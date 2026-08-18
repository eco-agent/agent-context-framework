import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  leaseId,
  objectiveId,
  runId,
  utcTimestamp,
  type ObjectiveCommand,
  type ObjectiveCommandResult,
  type ObjectiveCommandStore,
  type ObjectiveDefinition,
  type ObjectiveId,
  type TrustedActor,
  type UtcTimestamp,
} from "@agent-context/objective-kernel";

export interface ObjectiveConformanceClock {
  now(): UtcTimestamp;
  advance(milliseconds: number): void | Promise<void>;
}

export interface ObjectiveStoreConformanceHarness {
  readonly store: ObjectiveCommandStore;
  readonly clock: ObjectiveConformanceClock;
  close?(): Promise<void>;
}

export type ObjectiveStoreConformanceFactory = (
  scenario: string,
) => Promise<ObjectiveStoreConformanceHarness>;

const coordinator: TrustedActor = {
  actorId: "conformance-coordinator",
  capabilities: [
    OBJECTIVE_CAPABILITIES.create,
    OBJECTIVE_CAPABILITIES.coordinate,
    OBJECTIVE_CAPABILITIES.cancel,
  ],
};

const worker: TrustedActor = {
  actorId: "conformance-worker",
  capabilities: [OBJECTIVE_CAPABILITIES.execute],
};

export async function runObjectiveStoreConformance(
  factory: ObjectiveStoreConformanceFactory,
): Promise<void> {
  await runScenario(factory, "idempotency", verifyIdempotency);
  await runScenario(factory, "lease-recovery", verifyLeaseExclusionAndRecovery);
  await runScenario(factory, "children", verifyConcurrentChildrenAndParentWake);
  await runScenario(factory, "budgets-authority", verifyBudgetsAndAuthority);
  await runScenario(factory, "mutation-isolation", verifyMutationIsolation);
}

async function verifyMutationIsolation(harness: ObjectiveStoreConformanceHarness): Promise<void> {
  const id = oid(40);
  const command = createCommand(id, cid(40), definition(id));
  const result = await harness.store.execute(command, coordinator);
  accepted(result);
  if (result.status !== "accepted") fail("mutation isolation create failed");
  // Test-only hostile mutation proves adapters do not retain caller-owned references.
  (command.definition as { purpose: string }).purpose = "mutated command";
  (result.snapshot.definition as { purpose: string }).purpose = "mutated result";
  const stored = await harness.store.get(id);
  equal(
    stored?.definition.purpose,
    "Prove adapter-neutral durable objective semantics.",
    "stored objective must be detached from caller mutations",
  );
}

async function runScenario(
  factory: ObjectiveStoreConformanceFactory,
  name: string,
  scenario: (harness: ObjectiveStoreConformanceHarness) => Promise<void>,
): Promise<void> {
  const harness = await factory(name);
  try {
    await scenario(harness);
  } finally {
    await harness.close?.();
  }
}

async function verifyIdempotency(harness: ObjectiveStoreConformanceHarness): Promise<void> {
  const id = oid(1);
  const create = createCommand(id, cid(1), definition(id));
  const accepted = await harness.store.execute(create, coordinator);
  equal(accepted.status, "accepted", "create must be accepted");

  const replay = await harness.store.execute(create, coordinator);
  equal(replay.status, "replayed", "identical command must replay");
  if (accepted.status === "accepted" && replay.status === "replayed") {
    equal(replay.event.commandDigest, accepted.event.commandDigest, "replay digest");
    equal(replay.snapshot.version, accepted.snapshot.version, "replay version");
  }

  const changed = {
    ...create,
    definition: { ...create.definition, purpose: "changed payload" },
  } satisfies ObjectiveCommand;
  const conflict = await harness.store.execute(changed, coordinator);
  rejectedAs(conflict, "command_conflict");

  const events = await harness.store.events(id);
  equal(events.length, 1, "replay must not append an event");
  equal(events[0]?.sequence, 1, "first event sequence");
}

async function verifyLeaseExclusionAndRecovery(
  harness: ObjectiveStoreConformanceHarness,
): Promise<void> {
  const id = oid(10);
  accepted(await harness.store.execute(createCommand(id, cid(10), definition(id)), coordinator));

  const first = acquireCommand(id, cid(11), lid(11), rid(11), 1);
  const second = acquireCommand(id, cid(12), lid(12), rid(12), 1);
  const [left, right] = await Promise.all([
    harness.store.execute(first, worker),
    harness.store.execute(second, worker),
  ]);
  const statuses = [left.status, right.status].sort();
  equal(statuses.join(","), "accepted,rejected", "exactly one concurrent lease winner");
  const winner = left.status === "accepted" ? left : right;
  const loser = left.status === "rejected" ? left : right;
  if (winner.status !== "accepted" || loser.status !== "rejected") {
    fail("lease race result narrowing failed");
  }
  includes(["version_conflict", "invalid_state"], loser.code, "lease loser rejection");

  await harness.clock.advance(1_100);
  const recovered = await harness.store.execute(
    {
      type: "recover_expired_lease",
      schemaVersion: 1,
      commandId: cid(13),
      objectiveId: id,
      expectedVersion: winner.snapshot.version,
      reason: "worker heartbeat expired",
    },
    coordinator,
  );
  accepted(recovered);
  if (recovered.status !== "accepted") fail("recovery did not return a snapshot");
  equal(recovered.snapshot.state, "ready", "recovery returns objective to ready");
  equal(recovered.snapshot.latestCheckpoint, undefined, "no checkpoint was invented");

  const reacquired = await harness.store.execute(
    acquireCommand(id, cid(14), lid(14), rid(14), recovered.snapshot.version),
    worker,
  );
  accepted(reacquired);
  if (reacquired.status !== "accepted" || reacquired.snapshot.state !== "leased") {
    fail("reacquired objective is not leased");
  }
  equal(reacquired.snapshot.lease.attempt, 2, "attempt increments after recovery");

  const completed = await harness.store.execute(
    completeCommand(
      id,
      cid(15),
      reacquired.snapshot.version,
      reacquired.snapshot.lease.leaseId,
      reacquired.snapshot.lease.runId,
    ),
    worker,
  );
  accepted(completed);
  if (completed.status !== "accepted" || completed.snapshot.state !== "terminal") {
    fail("completion did not terminalize objective");
  }
  equal(completed.snapshot.outcome.type, "completed", "completion outcome");
}

async function verifyConcurrentChildrenAndParentWake(
  harness: ObjectiveStoreConformanceHarness,
): Promise<void> {
  const parentId = oid(20);
  const leftId = oid(21);
  const rightId = oid(22);
  accepted(await harness.store.execute(createCommand(parentId, cid(20), definition(parentId)), coordinator));
  const parentLease = await harness.store.execute(
    acquireCommand(parentId, cid(21), lid(21), rid(21), 1),
    worker,
  );
  accepted(parentLease);
  if (parentLease.status !== "accepted" || parentLease.snapshot.state !== "leased") {
    fail("parent was not leased");
  }
  const waiting = await harness.store.execute(
    {
      type: "wait",
      schemaVersion: 1,
      commandId: cid(22),
      objectiveId: parentId,
      expectedVersion: parentLease.snapshot.version,
      leaseId: parentLease.snapshot.lease.leaseId,
      workerId: "conformance-worker",
      runId: parentLease.snapshot.lease.runId,
      condition: { type: "children", objectiveIds: [leftId, rightId] },
      checkpointSummary: "delegated two independent children",
    },
    worker,
  );
  accepted(waiting);

  const childParent = { type: "child" as const, objectiveId: parentId };
  accepted(await harness.store.execute(createCommand(leftId, cid(23), definition(leftId, childParent)), coordinator));
  accepted(await harness.store.execute(createCommand(rightId, cid(24), definition(rightId, childParent)), coordinator));

  const readyChildren = await harness.store.listReady({ limit: 10, parentObjectiveId: parentId });
  equal(readyChildren.length, 2, "both independent children are schedulable");

  const [leftLease, rightLease] = await Promise.all([
    harness.store.execute(acquireCommand(leftId, cid(25), lid(25), rid(25), 1), worker),
    harness.store.execute(acquireCommand(rightId, cid(26), lid(26), rid(26), 1), worker),
  ]);
  accepted(leftLease);
  accepted(rightLease);
  if (
    leftLease.status !== "accepted" || leftLease.snapshot.state !== "leased" ||
    rightLease.status !== "accepted" || rightLease.snapshot.state !== "leased"
  ) {
    fail("children were not concurrently leased");
  }

  const [leftDone, rightDone] = await Promise.all([
    harness.store.execute(
      completeCommand(leftId, cid(27), leftLease.snapshot.version, leftLease.snapshot.lease.leaseId, leftLease.snapshot.lease.runId),
      worker,
    ),
    harness.store.execute(
      completeCommand(rightId, cid(28), rightLease.snapshot.version, rightLease.snapshot.lease.leaseId, rightLease.snapshot.lease.runId),
      worker,
    ),
  ]);
  accepted(leftDone);
  accepted(rightDone);

  const parentSnapshot = await harness.store.get(parentId);
  if (parentSnapshot?.state !== "waiting") fail("parent must remain durably waiting");
  const woke = await harness.store.execute(
    {
      type: "wake",
      schemaVersion: 1,
      commandId: cid(29),
      objectiveId: parentId,
      expectedVersion: parentSnapshot.version,
      reason: "all children completed",
    },
    coordinator,
  );
  accepted(woke);
  if (woke.status !== "accepted") fail("parent wake missing snapshot");
  equal(woke.snapshot.state, "ready", "completed children unblock parent");
}

async function verifyBudgetsAndAuthority(
  harness: ObjectiveStoreConformanceHarness,
): Promise<void> {
  const id = oid(30);
  const constrained = definition(id, { type: "root" }, {
    maxAttempts: 1,
    maxTransitions: 10,
    maxContextBytes: 10,
    maxPromptBytes: 10,
    maxAgentInputTokens: 100,
    maxAgentOutputTokens: 100,
  });
  accepted(await harness.store.execute(createCommand(id, cid(30), constrained), coordinator));

  const unauthorized = await harness.store.execute(
    acquireCommand(id, cid(31), lid(31), rid(31), 1),
    coordinator,
  );
  rejectedAs(unauthorized, "unauthorized");

  const leased = await harness.store.execute(
    acquireCommand(id, cid(32), lid(32), rid(32), 1),
    worker,
  );
  accepted(leased);
  if (leased.status !== "accepted" || leased.snapshot.state !== "leased") fail("budget objective not leased");

  const exhausted = await harness.store.execute(
    {
      type: "checkpoint",
      schemaVersion: 1,
      commandId: cid(33),
      objectiveId: id,
      expectedVersion: leased.snapshot.version,
      leaseId: leased.snapshot.lease.leaseId,
      workerId: "conformance-worker",
      runId: leased.snapshot.lease.runId,
      summary: "oversized context",
      progressPercent: 50,
      artifacts: [],
      contextBytesDelta: 11,
      promptBytesDelta: 0,
      agentInputTokensDelta: 0,
      agentOutputTokensDelta: 0,
    },
    worker,
  );
  accepted(exhausted);
  if (exhausted.status !== "accepted" || exhausted.snapshot.state !== "terminal") {
    fail("budget exhaustion must be durable terminal state");
  }
  equal(exhausted.event.eventType, "budget_exhausted", "budget event type");
  equal(exhausted.snapshot.outcome.type, "budget_exhausted", "budget outcome");
}

function definition(
  id: ObjectiveId,
  parent: ObjectiveDefinition["parent"] = { type: "root" },
  budget: ObjectiveDefinition["budget"] = {
    maxAttempts: 4,
    maxTransitions: 20,
    maxContextBytes: 100_000,
    maxPromptBytes: 100_000,
    maxAgentInputTokens: 1_000_000,
    maxAgentOutputTokens: 1_000_000,
  },
): ObjectiveDefinition {
  return {
    schemaVersion: 1,
    objectiveId: id,
    objectiveKey: `conformance-${id}`,
    purpose: "Prove adapter-neutral durable objective semantics.",
    parent,
    dependencies: [],
    authority: { allowedActors: ["conformance-worker", "conformance-coordinator"] },
    acceptance: [
      {
        gateId: "proof",
        description: "The objective produced conformance evidence.",
        evidenceTypes: ["test"],
      },
    ],
    budget,
    context: [],
    metadata: { suite: "objective-store-conformance" },
  };
}

function createCommand(
  id: ObjectiveId,
  command: ReturnType<typeof commandId>,
  value: ObjectiveDefinition,
): Extract<ObjectiveCommand, { type: "create" }> {
  return {
    type: "create",
    schemaVersion: 1,
    commandId: command,
    objectiveId: id,
    definition: value,
  };
}

function acquireCommand(
  id: ObjectiveId,
  command: ReturnType<typeof commandId>,
  lease: ReturnType<typeof leaseId>,
  run: ReturnType<typeof runId>,
  expectedVersion: number,
): Extract<ObjectiveCommand, { type: "acquire_lease" }> {
  return {
    type: "acquire_lease",
    schemaVersion: 1,
    commandId: command,
    objectiveId: id,
    expectedVersion,
    leaseId: lease,
    workerId: "conformance-worker",
    runId: run,
    durationMs: 1_000,
  };
}

function completeCommand(
  id: ObjectiveId,
  command: ReturnType<typeof commandId>,
  expectedVersion: number,
  lease: ReturnType<typeof leaseId>,
  run: ReturnType<typeof runId>,
): Extract<ObjectiveCommand, { type: "complete" }> {
  return {
    type: "complete",
    schemaVersion: 1,
    commandId: command,
    objectiveId: id,
    expectedVersion,
    leaseId: lease,
    workerId: "conformance-worker",
    runId: run,
    summary: "conformance objective complete",
    evidence: [{ evidenceType: "test", summary: "adapter assertions passed" }],
    contextBytesDelta: 0,
    promptBytesDelta: 0,
    agentInputTokensDelta: 0,
    agentOutputTokensDelta: 0,
  };
}

function oid(value: number): ObjectiveId {
  return objectiveId(uuid(value));
}

function cid(value: number) {
  return commandId(uuid(10_000 + value));
}

function lid(value: number) {
  return leaseId(uuid(20_000 + value));
}

function rid(value: number) {
  return runId(uuid(30_000 + value));
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function accepted(result: ObjectiveCommandResult): void {
  if (result.status !== "accepted") {
    fail(`expected accepted result, received ${result.status}${result.status === "rejected" ? `:${result.code}` : ""}`);
  }
}

function rejectedAs(
  result: ObjectiveCommandResult,
  code: Extract<ObjectiveCommandResult, { status: "rejected" }>["code"],
): void {
  if (result.status !== "rejected" || result.code !== code) {
    fail(`expected rejection ${code}, received ${result.status}${result.status === "rejected" ? `:${result.code}` : ""}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) {
    fail(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function includes<T>(values: readonly T[], actual: T, label: string): void {
  if (!values.includes(actual)) fail(`${label}: unexpected ${String(actual)}`);
}

function fail(message: string): never {
  throw new Error(`objective-store conformance: ${message}`);
}

export const OBJECTIVE_CONFORMANCE_START = utcTimestamp("2026-01-01T00:00:00.000Z");
