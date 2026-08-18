import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  OBJECTIVE_CONFORMANCE_START,
  runObjectiveStoreConformance,
} from "@agent-context/objective-test-fixtures/objective-store-conformance";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  leaseId,
  objectiveId,
  runId,
  type ObjectiveDefinition,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import { ManualObjectiveClock } from "../src/clock.js";
import { JsonlObjectiveStore } from "../src/jsonl-store.js";

test("JsonlObjectiveStore satisfies the objective store contract", async () => {
  await runObjectiveStoreConformance(async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), `objective-jsonl-${scenario}-`));
    const clock = new ManualObjectiveClock(OBJECTIVE_CONFORMANCE_START);
    const store = await JsonlObjectiveStore.open(join(root, "objectives.jsonl"), { clock });
    return {
      clock,
      store,
      close: async () => {
        await store.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  });
});

test("JSONL restart reconstructs state and discards only an interrupted tail", async () => {
  const root = await mkdtemp(join(tmpdir(), "objective-jsonl-restart-"));
  try {
    const path = join(root, "nested", "objectives.jsonl");
    const clock = new ManualObjectiveClock(OBJECTIVE_CONFORMANCE_START);
    const actor: TrustedActor = {
      actorId: "worker",
      capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.execute],
    };
    const id = objectiveId("20000000-0000-4000-8000-000000000001");
    const definition: ObjectiveDefinition = {
      schemaVersion: 1,
      objectiveId: id,
      objectiveKey: "restart-proof",
      purpose: "Prove restart recovery.",
      parent: { type: "root" },
      dependencies: [],
      authority: { allowedActors: ["worker"] },
      acceptance: [{ gateId: "proof", description: "proof", evidenceTypes: ["test"] }],
      budget: {
        maxAttempts: 2,
        maxTransitions: 10,
        maxContextBytes: 1_000,
        maxPromptBytes: 1_000,
        maxAgentInputTokens: 10_000,
        maxAgentOutputTokens: 10_000,
      },
      context: [],
      metadata: {},
    };
    const create = {
      type: "create" as const,
      schemaVersion: 1 as const,
      commandId: commandId("20000000-0000-4000-8000-000000000002"),
      objectiveId: id,
      definition,
    };
    let store = await JsonlObjectiveStore.open(path, { clock });
    assert.equal((await store.execute(create, actor)).status, "accepted");
    const acquired = await store.execute(
      {
        type: "acquire_lease",
        schemaVersion: 1,
        commandId: commandId("20000000-0000-4000-8000-000000000003"),
        objectiveId: id,
        expectedVersion: 1,
        leaseId: leaseId("20000000-0000-4000-8000-000000000004"),
        workerId: "worker",
        runId: runId("20000000-0000-4000-8000-000000000005"),
        durationMs: 60_000,
      },
      actor,
    );
    assert.equal(acquired.status, "accepted");
    await store.close();

    await appendFile(path, "{\"recordVersion\":1", "utf8");
    store = await JsonlObjectiveStore.open(path, { clock });
    assert.equal(store.recoveredTruncatedBytes, 18);
    const restored = await store.get(id);
    assert.equal(restored?.state, "leased");
    assert.equal(restored?.version, 2);
    assert.equal((await store.execute(create, actor)).status, "replayed");
    await store.close();

    const bytes = await readFile(path, "utf8");
    assert.equal(bytes.endsWith("\n"), true);
    assert.equal(bytes.includes("{\"recordVersion\":1\n"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONL refuses a corrupt complete record", async () => {
  const root = await mkdtemp(join(tmpdir(), "objective-jsonl-corrupt-"));
  try {
    const path = join(root, "objectives.jsonl");
    await appendFile(path, "{}\n", "utf8");
    await assert.rejects(
      JsonlObjectiveStore.open(path, {
        clock: new ManualObjectiveClock(OBJECTIVE_CONFORMANCE_START),
      }),
      /Invalid objective journal record 1/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
