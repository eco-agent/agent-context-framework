import assert from "node:assert/strict";
import test from "node:test";
import { PgBoss } from "pg-boss";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  objectiveId,
  type ObjectiveDefinition,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import { SystemObjectiveClock } from "../src/clock.js";
import {
  configureObjectiveReadyQueue,
  signalObjectiveReady,
} from "../src/pg-boss-signals.js";
import { PostgresObjectiveStore } from "../src/postgres-store.js";
import { ObjectiveScheduler } from "../src/scheduler.js";

const databaseUrl = process.env.OBJECTIVE_POSTGRES_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("OBJECTIVE_POSTGRES_URL is required for PostgreSQL objective tests.");
}

test("real pg-boss deduplicates readiness hints and a lost hint cannot strand work", async () => {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    application_name: "objective-runtime-pg-boss-test",
    schedule: false,
    supervise: false,
  });
  boss.on("error", () => undefined);
  const storeName = `signal-live-${process.pid}-${Date.now()}`;
  const store = await PostgresObjectiveStore.open({ databaseUrl, storeName });
  try {
    await boss.start();
    await configureObjectiveReadyQueue(boss);
    const signalId = objectiveId("50000000-0000-4000-8000-000000000001");
    const signal = {
      schemaVersion: 1 as const,
      storeName,
      objectiveId: signalId,
      objectiveVersion: 1,
    };
    const first = await signalObjectiveReady(boss, signal);
    const duplicate = await signalObjectiveReady(boss, signal);
    assert.equal(typeof first, "string");
    assert.equal(duplicate, null);

    const workId = objectiveId("50000000-0000-4000-8000-000000000002");
    const definition: ObjectiveDefinition = {
      schemaVersion: 1,
      objectiveId: workId,
      objectiveKey: "lost-signal-proof",
      purpose: "Complete through reconciliation without any pg-boss signal.",
      parent: { type: "root" },
      dependencies: [],
      authority: { allowedActors: ["live-worker", "live-coordinator"] },
      acceptance: [{ gateId: "proof", description: "proof", evidenceTypes: ["test"] }],
      budget: { maxAttempts: 2, maxTransitions: 10, maxContextBytes: 1_000, maxPromptBytes: 1_000, maxAgentInputTokens: 10_000, maxAgentOutputTokens: 10_000 },
      context: [],
      metadata: {},
    };
    const coordinator: TrustedActor = {
      actorId: "live-coordinator",
      capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.coordinate],
    };
    const worker: TrustedActor = {
      actorId: "live-worker",
      capabilities: [OBJECTIVE_CAPABILITIES.execute],
    };
    assert.equal(
      (await store.execute({
        type: "create",
        schemaVersion: 1,
        commandId: commandId("50000000-0000-4000-8000-000000000003"),
        objectiveId: workId,
        definition,
      }, coordinator)).status,
      "accepted",
    );
    const scheduler = new ObjectiveScheduler({
      store,
      clock: new SystemObjectiveClock(),
      coordinatorActor: coordinator,
      workerActor: worker,
      workerId: "live-worker",
      maxConcurrency: 1,
      leaseDurationMs: 60_000,
      runner: {
        async run() {
          return {
            type: "completed",
            summary: "reconciliation found work without a signal",
            evidence: [{ evidenceType: "test", summary: "lost signal did not strand work" }],
          };
        },
      },
    });
    const result = await scheduler.runOnce();
    assert.equal(result.completed, 1);
    const completed = await store.get(workId);
    assert.equal(completed?.state, "terminal");
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 }).catch(() => undefined);
    await store.close();
  }
});
