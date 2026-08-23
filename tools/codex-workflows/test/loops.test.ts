import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createObjectiveLoopContext,
  decodeObjectiveId,
  ObjectiveJsonlLedger,
  ObjectiveMemoryLedger,
  runAuthorityLadder,
  runAutonomousEnvironment,
  runRelayChain,
  type Decision,
  type Evidence,
} from "../src/index.js";

const testObjectiveId = decodeObjectiveId("70000000-0000-4000-8000-000000000001");
const secondTestObjectiveId = decodeObjectiveId("70000000-0000-4000-8000-000000000002");

const evidence: readonly Evidence[] = [
  { kind: "test", summary: "Observed by test", references: ["test"] },
];

test("objective loop contexts namespace shared ledger run IDs", () => {
  const ledger = new ObjectiveMemoryLedger("shared-ledger");
  const first = createObjectiveLoopContext(testObjectiveId, ledger);
  const second = createObjectiveLoopContext(secondTestObjectiveId, ledger);

  assert.equal(first.ledger.runId, `${ledger.runId}:${testObjectiveId}`);
  assert.equal(second.ledger.runId, `${ledger.runId}:${secondTestObjectiveId}`);
  assert.notEqual(first.ledger.runId, second.ledger.runId);
});

test("JSONL ledger resumes sequence from durable evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-test-"));
  const file = join(root, "run.jsonl");
  try {
    const first = await ObjectiveJsonlLedger.open(file, "durable-test");
    await first.append({
      objectiveId: testObjectiveId,
      type: "loop.started",
      loop: "test",
      state: {},
      evidence,
    });

    const resumed = await ObjectiveJsonlLedger.open(file, "durable-test");
    const second = await resumed.append({
      objectiveId: testObjectiveId,
      type: "loop.completed",
      loop: "test",
      state: {},
      evidence,
    });

    assert.equal(second.sequence, 2);
    assert.equal((await resumed.list()).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONL ledger serializes concurrent appends and recovers an interrupted tail", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-crash-test-"));
  const file = join(root, "run.jsonl");
  try {
    const ledger = await ObjectiveJsonlLedger.open(file, "crash-test");
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        ledger.append({
          objectiveId: testObjectiveId,
          type: "loop.transition",
          loop: "test",
          state: { index },
          evidence,
        }),
      ),
    );
    await appendFile(file, "{\"interrupted\":", "utf8");
    const resumed = await ObjectiveJsonlLedger.open(file, "crash-test");
    const events = await resumed.list();
    assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Objective JSONL ledger rejects malformed complete records and empty interior lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-invalid-test-"));
  try {
    const malformed = join(root, "malformed.jsonl");
    await writeFile(malformed, "{}\n", "utf8");
    await assert.rejects(
      ObjectiveJsonlLedger.open(malformed, "invalid-test"),
      /line 1 sequence must be a positive safe integer/u,
    );

    const emptyInterior = join(root, "empty-interior.jsonl");
    const ledger = await ObjectiveJsonlLedger.open(emptyInterior, "empty-test");
    await ledger.append({
      objectiveId: testObjectiveId,
      type: "loop.started",
      loop: "test",
      state: {},
      evidence,
    });
    await appendFile(emptyInterior, "\n", "utf8");
    await assert.rejects(
      ObjectiveJsonlLedger.open(emptyInterior, "empty-test"),
      /Workflow ledger line 2 is empty/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relay sends repair to the previous stage", async () => {
  const ledger = new ObjectiveMemoryLedger("relay-test");
  const calls: string[] = [];
  let verificationAttempts = 0;

  const result = await runRelayChain(
    "draft",
    [
      {
        id: "implement",
        async run(artifact, context): Promise<Decision<string>> {
          calls.push(`implement:${context.feedback.join("|")}`);
          return {
            kind: "accept",
            artifact: context.feedback.length === 0 ? artifact : "repaired",
            confidence: 1,
            evidence,
          };
        },
      },
      {
        id: "verify",
        async run(artifact): Promise<Decision<string>> {
          calls.push(`verify:${artifact}`);
          verificationAttempts += 1;
          return verificationAttempts === 1
            ? {
                kind: "repair",
                artifact,
                feedback: ["fix the invariant"],
                evidence,
              }
            : { kind: "accept", artifact, confidence: 1, evidence };
        },
      },
    ],
    { maxTransitions: 5, maxRepairs: 1 },
    createObjectiveLoopContext(testObjectiveId, ledger),
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [
    "implement:",
    "verify:draft",
    "implement:fix the invariant",
    "verify:repaired",
  ]);
});

test("autonomous loop escalates after measured stagnation", async () => {
  const ledger = new ObjectiveMemoryLedger("environment-test");
  let state = 0;

  const result = await runAutonomousEnvironment(
    "change state",
    {
      id: "worker",
      authority: ["write"],
      async decide() {
        return {
          kind: "act" as const,
          action: "noop",
          requiredAuthority: ["write"] as const,
          evidence,
        };
      },
    },
    {
      async observe() {
        return state;
      },
      async execute() {
        state += 0;
        return undefined;
      },
      async measure(previous, next) {
        return next - previous;
      },
      madeProgress(change) {
        return typeof change === "number" && change !== 0;
      },
    },
    {
      maxSteps: 5,
      maxConsecutiveStagnantSteps: 2,
      retainedHistory: 2,
    },
    createObjectiveLoopContext(testObjectiveId, ledger),
  );

  assert.equal(result.status, "escalated");
  if (result.status === "escalated") {
    assert.match(result.issue, /No measured progress/u);
  }
});

test("authority ladder permits only backward returns", async () => {
  const ledger = new ObjectiveMemoryLedger("ladder-test");
  let qualityAttempts = 0;

  const result = await runAuthorityLadder(
    "ship",
    0,
    [
      {
        id: "implementation",
        roleId: "primary",
        async run({ workspace, feedback }) {
          return {
            kind: "accept" as const,
            workspace: workspace + (feedback.length > 0 ? 2 : 1),
            evidence,
          };
        },
      },
      {
        id: "quality",
        roleId: "reviewer",
        async run({ workspace }) {
          qualityAttempts += 1;
          return qualityAttempts === 1
            ? {
                kind: "return" as const,
                targetStageId: "implementation",
                workspace,
                feedback: ["repair"],
                evidence,
              }
            : {
                kind: "accept" as const,
                workspace,
                evidence,
              };
        },
      },
    ],
    5,
    createObjectiveLoopContext(testObjectiveId, ledger),
  );

  assert.deepEqual(result, {
    status: "completed",
    artifact: 3,
    evidence: [...evidence, ...evidence, ...evidence, ...evidence],
  });
});
