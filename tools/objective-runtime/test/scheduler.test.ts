import assert from "node:assert/strict";
import test from "node:test";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  leaseId,
  objectiveId,
  runId,
  utcTimestamp,
  type ObjectiveCommandStore,
  type ObjectiveDefinition,
  type ObjectiveId,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import { ManualObjectiveClock } from "../src/clock.js";
import { MemoryObjectiveStore } from "../src/memory-store.js";
import {
  ObjectiveScheduler,
  type ObjectiveAttemptRunner,
} from "../src/scheduler.js";

const coordinator: TrustedActor = {
  actorId: "scheduler-coordinator",
  capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.coordinate],
};
const worker: TrustedActor = {
  actorId: "scheduler-worker",
  capabilities: [OBJECTIVE_CAPABILITIES.execute],
};

test("scheduler enforces concurrency, checkpoints progress, and drains ready work", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const ids = [oid(1), oid(2), oid(3)];
  for (const [index, id] of ids.entries()) await create(store, id, index + 1);

  let active = 0;
  let maximumActive = 0;
  let releaseFirstWave!: () => void;
  const firstWave = new Promise<void>((resolve) => { releaseFirstWave = resolve; });
  let started = 0;
  const runner: ObjectiveAttemptRunner = {
    async run(context) {
      active += 1;
      started += 1;
      maximumActive = Math.max(maximumActive, active);
      await context.checkpoint({
        summary: "halfway",
        progressPercent: 50,
        contextBytesDelta: 5,
        promptBytesDelta: 7,
        resumeToken: "step-2",
      });
      if (started <= 2) await firstWave;
      active -= 1;
      return {
        type: "completed",
        summary: "work complete",
        evidence: [{ evidenceType: "test", summary: "runner completed" }],
      };
    },
  };
  const scheduler = schedulerFor(store, clock, runner, 2);
  const firstPass = scheduler.runOnce();
  await eventually(() => started === 2);
  assert.equal(maximumActive, 2);
  assert.equal(started, 2);
  releaseFirstWave();
  const first = await firstPass;
  assert.deepEqual(first, {
    acquired: 2,
    completed: 2,
    failed: 0,
    retried: 0,
    waiting: 0,
    lostLeases: 0,
    recovered: 0,
    woken: 0,
    budgetExhausted: 0,
  });
  const remaining = await scheduler.runUntilIdle();
  assert.equal(remaining.acquired, 1);
  assert.equal(remaining.completed, 1);
  assert.equal(started, 3);
  for (const id of ids) {
    const snapshot = await store.get(id);
    assert.equal(snapshot?.state, "terminal");
    assert.equal(snapshot?.latestCheckpoint?.resumeToken, "step-2");
  }
});

test("two schedulers cannot execute the same objective concurrently", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = oid(10);
  await create(store, id, 10);
  let invocations = 0;
  const runner: ObjectiveAttemptRunner = {
    async run() {
      invocations += 1;
      return {
        type: "completed",
        summary: "one winner",
        evidence: [{ evidenceType: "test", summary: "exclusive lease" }],
      };
    },
  };
  const left = schedulerFor(store, clock, runner, 1, "left-worker");
  const right = schedulerFor(store, clock, runner, 1, "right-worker");
  const [leftSummary, rightSummary] = await Promise.all([left.runOnce(), right.runOnce()]);
  assert.equal(leftSummary.acquired + rightSummary.acquired, 1);
  assert.equal(invocations, 1);
  assert.equal((await store.get(id))?.state, "terminal");
});

test("scheduler retries thrown work and reconciles expired leases and timer waits", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const retryId = oid(20);
  await create(store, retryId, 20);
  let attempts = 0;
  const runner: ObjectiveAttemptRunner = {
    async run(context) {
      attempts += 1;
      if (context.snapshot.definition.objectiveId === retryId && attempts === 1) {
        throw new Error("transient adapter failure");
      }
      return {
        type: "completed",
        summary: "eventually complete",
        evidence: [{ evidenceType: "test", summary: "retry recovered" }],
      };
    },
  };
  const scheduler = schedulerFor(store, clock, runner, 1);
  const result = await scheduler.runUntilIdle();
  assert.equal(result.retried, 1);
  assert.equal(result.completed, 1);
  assert.equal(attempts, 2);

  const expiredId = oid(21);
  await create(store, expiredId, 21);
  const lease = await store.execute(
    {
      type: "acquire_lease",
      schemaVersion: 1,
      commandId: cid(210),
      objectiveId: expiredId,
      expectedVersion: 1,
      leaseId: leaseId(uuid(211)),
      workerId: "abandoned-worker",
      runId: runId(uuid(212)),
      durationMs: 1_000,
    },
    worker,
  );
  assert.equal(lease.status, "accepted");
  clock.advance(1_001);
  const recovered = await scheduler.runOnce();
  assert.equal(recovered.recovered, 1);
  assert.equal(recovered.acquired, 1);
  assert.equal(recovered.completed, 1);

  const timerId = oid(22);
  await create(store, timerId, 22);
  const timerLease = await store.execute(
    {
      type: "acquire_lease",
      schemaVersion: 1,
      commandId: cid(220),
      objectiveId: timerId,
      expectedVersion: 1,
      leaseId: leaseId(uuid(221)),
      workerId: "scheduler-worker",
      runId: runId(uuid(222)),
      durationMs: 60_000,
    },
    worker,
  );
  if (timerLease.status !== "accepted" || timerLease.snapshot.state !== "leased") {
    assert.fail("timer objective was not leased");
  }
  await store.execute(
    {
      type: "wait",
      schemaVersion: 1,
      commandId: cid(223),
      objectiveId: timerId,
      expectedVersion: timerLease.snapshot.version,
      leaseId: timerLease.snapshot.lease.leaseId,
      workerId: timerLease.snapshot.lease.workerId,
      runId: timerLease.snapshot.lease.runId,
      condition: {
        type: "timer",
        wakeAt: utcTimestamp("2026-01-01T00:00:02.000Z"),
      },
      checkpointSummary: "waiting for timer",
    },
    worker,
  );
  assert.equal((await scheduler.runOnce()).woken, 0);
  clock.advance(1_000);
  const woken = await scheduler.runOnce();
  assert.equal(woken.woken, 1);
  assert.equal(woken.completed, 1);
});

test("attempt exhaustion terminalizes without executing another runner", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = oid(30);
  await create(store, id, 30, 1);
  let invocations = 0;
  const scheduler = schedulerFor(store, clock, {
    async run() {
      invocations += 1;
      return { type: "retry", reason: "consume the only attempt", retryAfterMs: 0 };
    },
  }, 1);
  const summary = await scheduler.runUntilIdle();
  assert.equal(invocations, 1);
  assert.equal(summary.retried, 1);
  assert.equal(summary.budgetExhausted, 1);
  const snapshot = await store.get(id);
  assert.equal(snapshot?.state, "terminal");
  if (snapshot?.state === "terminal") assert.equal(snapshot.outcome.type, "budget_exhausted");
});

function schedulerFor(
  store: ObjectiveCommandStore,
  clock: ManualObjectiveClock,
  runner: ObjectiveAttemptRunner,
  maxConcurrency: number,
  workerId = "scheduler-worker",
): ObjectiveScheduler {
  return new ObjectiveScheduler({
    store,
    clock,
    runner,
    workerActor: worker,
    coordinatorActor: coordinator,
    workerId,
    maxConcurrency,
    leaseDurationMs: 60_000,
  });
}

async function create(
  store: ObjectiveCommandStore,
  id: ObjectiveId,
  seed: number,
  maxAttempts = 4,
): Promise<void> {
  const definition: ObjectiveDefinition = {
    schemaVersion: 1,
    objectiveId: id,
    objectiveKey: `scheduler-${seed}`,
    purpose: "Exercise unattended objective execution.",
    parent: { type: "root" },
    dependencies: [],
    authority: {
      allowedActors: ["scheduler-worker", "left-worker", "right-worker", "scheduler-coordinator"],
    },
    acceptance: [{ gateId: "proof", description: "proof", evidenceTypes: ["test"] }],
    budget: {
      maxAttempts,
      maxTransitions: 20,
      maxContextBytes: 10_000,
      maxPromptBytes: 10_000,
      maxAgentInputTokens: 100_000,
      maxAgentOutputTokens: 100_000,
    },
    context: [],
    metadata: {},
  };
  const result = await store.execute(
    {
      type: "create",
      schemaVersion: 1,
      commandId: cid(seed),
      objectiveId: id,
      definition,
    },
    coordinator,
  );
  assert.equal(result.status, "accepted");
}

function oid(value: number): ObjectiveId {
  return objectiveId(uuid(value));
}

function cid(value: number) {
  return commandId(uuid(10_000 + value));
}

function uuid(value: number): string {
  return `30000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

async function eventually(condition: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("condition was not reached");
}
