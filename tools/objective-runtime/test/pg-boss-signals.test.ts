import assert from "node:assert/strict";
import test from "node:test";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  objectiveId,
  utcTimestamp,
  type ObjectiveDefinition,
} from "@agent-context/objective-kernel";
import { ManualObjectiveClock } from "../src/clock.js";
import { MemoryObjectiveStore } from "../src/memory-store.js";
import {
  OBJECTIVE_READY_QUEUE,
  configureObjectiveReadyQueue,
  decodeObjectiveReadySignal,
  reconcileObjectiveReadySignals,
} from "../src/pg-boss-signals.js";

test("pg-boss signals are stable duplicate-tolerant readiness hints", async () => {
  const sent: Array<{ queue: string; data: unknown; id: string | undefined }> = [];
  const fakeBoss = {
    async createQueue(name: string) {
      assert.equal(name, OBJECTIVE_READY_QUEUE);
    },
    async send(queue: string, data: unknown, options: { id?: string }) {
      sent.push({ queue, data, id: options.id });
      return options.id ?? null;
    },
  };
  await configureObjectiveReadyQueue(fakeBoss as never);
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = objectiveId("40000000-0000-4000-8000-000000000001");
  const definition: ObjectiveDefinition = {
    schemaVersion: 1,
    objectiveId: id,
    objectiveKey: "signal-test",
    purpose: "Prove signals are hints.",
    parent: { type: "root" },
    dependencies: [],
    authority: { allowedActors: "any_trusted_actor" },
    acceptance: [{ gateId: "proof", description: "proof", evidenceTypes: ["test"] }],
    budget: { maxAttempts: 2, maxTransitions: 10, maxContextBytes: 100, maxPromptBytes: 100, maxAgentInputTokens: 10_000, maxAgentOutputTokens: 10_000 },
    context: [],
    metadata: {},
  };
  await store.execute(
    {
      type: "create",
      schemaVersion: 1,
      commandId: commandId("40000000-0000-4000-8000-000000000002"),
      objectiveId: id,
      definition,
    },
    { actorId: "creator", capabilities: [OBJECTIVE_CAPABILITIES.create] },
  );
  assert.equal(await reconcileObjectiveReadySignals(fakeBoss as never, store, "signal-test"), 1);
  assert.equal(await reconcileObjectiveReadySignals(fakeBoss as never, store, "signal-test"), 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.id, sent[1]?.id);
  assert.deepEqual(decodeObjectiveReadySignal(sent[0]?.data), sent[0]?.data);
  assert.throws(() => decodeObjectiveReadySignal({ ...sent[0]?.data as object, extra: true }));
});
