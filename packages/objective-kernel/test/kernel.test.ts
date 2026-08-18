import assert from "node:assert/strict";
import test from "node:test";
import {
  OBJECTIVE_CAPABILITIES,
  ObjectiveDecodeError,
  applyObjectiveCommand,
  commandId,
  createInitialSnapshot,
  decodeObjectiveCommand,
  decodeObjectiveDefinition,
  leaseId,
  objectiveId,
  runId,
  utcTimestamp,
  type ObjectiveDefinition,
} from "../src/index.js";

const id = objectiveId("10000000-0000-4000-8000-000000000001");
const definition: ObjectiveDefinition = {
  schemaVersion: 1,
  objectiveId: id,
  objectiveKey: "kernel-test",
  purpose: "Prove kernel decoding and transitions.",
  parent: { type: "root" },
  dependencies: [],
  authority: { allowedActors: "any_trusted_actor" },
  acceptance: [{ gateId: "test", description: "test", evidenceTypes: ["test"] }],
  budget: {
    maxAttempts: 2,
    maxTransitions: 5,
    maxContextBytes: 10,
    maxPromptBytes: 10,
    maxAgentInputTokens: 100,
    maxAgentOutputTokens: 100,
  },
  context: [],
  metadata: {},
};

test("strict decoders reject unknown fields and cross-objective create commands", () => {
  assert.deepEqual(decodeObjectiveDefinition(definition), definition);
  assert.throws(
    () => decodeObjectiveDefinition({ ...definition, unexpected: true }),
    (error: unknown) =>
      error instanceof ObjectiveDecodeError && error.path === "$definition.unexpected",
  );
  assert.throws(
    () =>
      decodeObjectiveCommand({
        type: "create",
        schemaVersion: 1,
        commandId: "10000000-0000-4000-8000-000000000002",
        objectiveId: "10000000-0000-4000-8000-000000000003",
        definition,
      }),
    /must match command.objectiveId/u,
  );
});

test("lease ownership and acceptance evidence are enforced", () => {
  const now = utcTimestamp("2026-01-01T00:00:00.000Z");
  const create = {
    type: "create" as const,
    schemaVersion: 1 as const,
    commandId: commandId("10000000-0000-4000-8000-000000000004"),
    objectiveId: id,
    definition,
  };
  const ready = createInitialSnapshot(create, now);
  const acquire = {
    type: "acquire_lease" as const,
    schemaVersion: 1 as const,
    commandId: commandId("10000000-0000-4000-8000-000000000005"),
    objectiveId: id,
    expectedVersion: 1,
    leaseId: leaseId("10000000-0000-4000-8000-000000000006"),
    workerId: "worker",
    runId: runId("10000000-0000-4000-8000-000000000007"),
    durationMs: 60_000,
  };
  const acquired = applyObjectiveCommand(ready, acquire, {
    now,
    dependenciesSatisfied: true,
    waitConditionSatisfied: false,
  });
  assert.equal(acquired.status, "applied");
  if (acquired.status !== "applied") return;

  const missingEvidence = applyObjectiveCommand(
    acquired.snapshot,
    {
      type: "complete",
      schemaVersion: 1,
      commandId: commandId("10000000-0000-4000-8000-000000000008"),
      objectiveId: id,
      expectedVersion: 2,
      leaseId: acquire.leaseId,
      workerId: acquire.workerId,
      runId: acquire.runId,
      summary: "done",
      evidence: [{ evidenceType: "wrong", summary: "not accepted" }],
      contextBytesDelta: 0,
      promptBytesDelta: 0,
      agentInputTokensDelta: 0,
      agentOutputTokensDelta: 0,
    },
    {
      now: utcTimestamp("2026-01-01T00:00:01.000Z"),
      dependenciesSatisfied: true,
      waitConditionSatisfied: false,
    },
  );
  assert.deepEqual(missingEvidence, {
    status: "rejected",
    code: "invalid_command",
    message: "Acceptance gate test has no matching evidence.",
  });
});

test("known capabilities decode at the trust boundary", () => {
  assert.deepEqual(
    OBJECTIVE_CAPABILITIES,
    {
      cancel: "objective:cancel",
      coordinate: "objective:coordinate",
      create: "objective:create",
      execute: "objective:execute",
    },
  );
});

test("definitions reject duplicate gates, empty evidence contracts, and empty actor sets", () => {
  assert.throws(
    () => decodeObjectiveDefinition({
      ...definition,
      acceptance: [definition.acceptance[0], definition.acceptance[0]],
    }),
    /gateId values must be unique/u,
  );
  assert.throws(
    () => decodeObjectiveDefinition({
      ...definition,
      acceptance: [{ ...definition.acceptance[0], evidenceTypes: [] }],
    }),
    /must not be empty/u,
  );
  assert.throws(
    () => decodeObjectiveDefinition({
      ...definition,
      authority: { allowedActors: [] },
    }),
    /must contain at least one actor/u,
  );
});

test("lease heartbeats advance ordering without consuming logical transition budget", () => {
  const now = utcTimestamp("2026-01-01T00:00:00.000Z");
  const constrained = {
    ...definition,
    budget: { ...definition.budget, maxTransitions: 1 },
  };
  const ready = createInitialSnapshot({
    type: "create",
    schemaVersion: 1,
    commandId: commandId("10000000-0000-4000-8000-000000000020"),
    objectiveId: id,
    definition: constrained,
  }, now);
  const lease = leaseId("10000000-0000-4000-8000-000000000021");
  const run = runId("10000000-0000-4000-8000-000000000022");
  const acquired = applyObjectiveCommand(ready, {
    type: "acquire_lease",
    schemaVersion: 1,
    commandId: commandId("10000000-0000-4000-8000-000000000023"),
    objectiveId: id,
    expectedVersion: 1,
    leaseId: lease,
    workerId: "worker",
    runId: run,
    durationMs: 60_000,
  }, { now, dependenciesSatisfied: true, waitConditionSatisfied: false });
  assert.equal(acquired.status, "applied");
  if (acquired.status !== "applied") return;
  const renewed = applyObjectiveCommand(acquired.snapshot, {
    type: "renew_lease",
    schemaVersion: 1,
    commandId: commandId("10000000-0000-4000-8000-000000000024"),
    objectiveId: id,
    expectedVersion: 2,
    leaseId: lease,
    workerId: "worker",
    runId: run,
    durationMs: 60_000,
  }, {
    now: utcTimestamp("2026-01-01T00:00:10.000Z"),
    dependenciesSatisfied: true,
    waitConditionSatisfied: false,
  });
  assert.equal(renewed.status, "applied");
  if (renewed.status === "applied") {
    assert.equal(renewed.snapshot.state, "leased");
    assert.equal(renewed.snapshot.version, 3);
    assert.equal(renewed.snapshot.eventSequence, 3);
    assert.equal(renewed.snapshot.usage.transitions, 1);
  }
});
