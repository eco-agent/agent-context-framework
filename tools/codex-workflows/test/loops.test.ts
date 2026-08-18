import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decodeObjectiveId,
  JsonlLedger,
  MemoryLedger,
  runAuthorityLadder,
  runAutonomousEnvironment,
  runRelayChain,
  validateWorkflowPlan,
  type Decision,
  type Evidence,
} from "../src/index.js";

const testObjectiveId = decodeObjectiveId("70000000-0000-4000-8000-000000000001");

const evidence: readonly Evidence[] = [
  { kind: "test", summary: "Observed by test", references: ["test"] },
];

test("JSONL ledger resumes sequence from durable evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-test-"));
  const file = join(root, "run.jsonl");
  try {
    const first = await JsonlLedger.open(file, "durable-test");
    await first.append({
      objectiveId: testObjectiveId,
      type: "loop.started",
      loop: "test",
      state: {},
      evidence,
    });

    const resumed = await JsonlLedger.open(file, "durable-test");
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
    const ledger = await JsonlLedger.open(file, "crash-test");
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
    const resumed = await JsonlLedger.open(file, "crash-test");
    const events = await resumed.list();
    assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relay sends repair to the previous stage", async () => {
  const ledger = new MemoryLedger("relay-test");
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
    { ledger, objectiveId: testObjectiveId },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [
    "implement:",
    "verify:draft",
    "implement:fix the invariant",
    "verify:repaired",
  ]);
});

test("static plan rejects recursive task cycles", () => {
  assert.throws(
    () =>
      validateWorkflowPlan({
        objectiveId: testObjectiveId,
        objective: "Implement and verify",
        acceptanceCriteria: ["tests pass"],
        primaryRoleId: "primary",
        loop: "relay-chain",
        roles: [
          {
            identity: "primary",
            role: "implementer",
            scope: ["repository"],
            capabilities: ["write"],
            authority: ["read", "write"],
            thread: { sandboxMode: "workspace-write" },
          },
        ],
        tasks: [
          {
            objectiveId: testObjectiveId,
            id: "implement",
            roleId: "primary",
            purpose: "implement",
            scope: ["repository"],
            grantedAuthority: ["write"],
            dependencies: ["verify"],
            acceptanceCriteria: ["change exists"],
            expectedEvidence: ["diff"],
            maxAttempts: 1,
          },
          {
            objectiveId: testObjectiveId,
            id: "verify",
            roleId: "primary",
            purpose: "verify",
            scope: ["repository"],
            grantedAuthority: ["read"],
            dependencies: ["implement"],
            acceptanceCriteria: ["tests pass"],
            expectedEvidence: ["test output"],
            maxAttempts: 1,
          },
        ],
      }),
    /contains a cycle/u,
  );
});

test("autonomous loop escalates after measured stagnation", async () => {
  const ledger = new MemoryLedger("environment-test");
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
    { ledger, objectiveId: testObjectiveId },
  );

  assert.equal(result.status, "escalated");
  if (result.status === "escalated") {
    assert.match(result.issue, /No measured progress/u);
  }
});

test("authority ladder permits only backward returns", async () => {
  const ledger = new MemoryLedger("ladder-test");
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
    { ledger, objectiveId: testObjectiveId },
  );

  assert.deepEqual(result, {
    status: "completed",
    artifact: 3,
    evidence: [...evidence, ...evidence, ...evidence, ...evidence],
  });
});
