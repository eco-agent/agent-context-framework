import assert from "node:assert/strict";
import test from "node:test";

import type { ThreadOptions } from "@openai/codex-sdk";

import {
  MemoryLedger,
  type JsonValue,
  type WorkflowCodex,
  type WorkflowThread,
} from "@agent-context/codex-workflow-runtime";
import {
  decodeComposeRefineRequest,
  runFrontendComposeRefineWorkflow,
  type ComposeArtifactStore,
  type ComposeRevisionEnvironment,
  type ImplementationTaskId,
  type RevisionArtifact,
} from "../src/frontend-compose-refine.js";

test("compose workflow stores a verified revision and stops for human review", async () => {
  const stored: string[] = [];
  const ledger = new MemoryLedger("compose-accept");
  const result = await runFrontendComposeRefineWorkflow({
    request: request(),
    repositoryDirectory: "D:\\fixture",
    reviewerDirectory: "D:\\evidence",
    ledger,
    artifacts: store(stored),
    environment: environment(),
    model: "gpt-5.6-sol",
    implementationTimeoutMs: 1_000,
    reviewTimeoutMs: 1_000,
    codex: mockCodex([
      implementation("implement"),
      reviewAccept("review-1"),
    ]),
  });

  assert.equal(result.status, "ready_for_human_review");
  assert.deepEqual(stored, ["implement", "review-1"]);
  const events = await ledger.list();
  assert.deepEqual(
    events.filter((event) => event.type === "task.accepted").map((event) => event.taskId),
    ["implement", "review-1"],
  );
  assert.equal(events.some((event) => event.type === "loop.completed"), true);
});

test("compose workflow returns one review repair to the same implementer", async () => {
  const stored: string[] = [];
  const stages: string[] = [];
  const result = await runFrontendComposeRefineWorkflow({
    request: request(),
    repositoryDirectory: "D:\\fixture",
    reviewerDirectory: "D:\\evidence",
    ledger: new MemoryLedger("compose-repair"),
    artifacts: store(stored),
    environment: environment(stages),
    model: "gpt-5.6-sol",
    implementationTimeoutMs: 1_000,
    reviewTimeoutMs: 1_000,
    codex: mockCodex([
      implementation("implement"),
      reviewRepair("review-1"),
      implementation("repair-1"),
      reviewAccept("review-2"),
    ]),
  });

  assert.equal(result.status, "ready_for_human_review");
  assert.deepEqual(stages, ["implement", "repair-1"]);
  assert.deepEqual(stored, ["implement", "review-1", "repair-1", "review-2"]);
});

test("compose workflow exhausts after the fixed two-repair budget", async () => {
  const result = await runFrontendComposeRefineWorkflow({
    request: request(),
    repositoryDirectory: "D:\\fixture",
    reviewerDirectory: "D:\\evidence",
    ledger: new MemoryLedger("compose-exhausted"),
    artifacts: store([]),
    environment: environment(),
    model: "gpt-5.6-sol",
    implementationTimeoutMs: 1_000,
    reviewTimeoutMs: 1_000,
    codex: mockCodex([
      implementation("implement"),
      reviewRepair("review-1"),
      implementation("repair-1"),
      reviewRepair("review-2"),
      implementation("repair-2"),
      reviewRepair("review-3"),
    ]),
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") assert.match(result.issue, /budget exhausted/u);
});

test("compose workflow rejects acceptance without complete verification", async () => {
  await assert.rejects(
    runFrontendComposeRefineWorkflow({
      request: request(),
      repositoryDirectory: "D:\\fixture",
      reviewerDirectory: "D:\\evidence",
      ledger: new MemoryLedger("compose-invalid-accept"),
      artifacts: store([]),
      environment: failedEnvironment(),
      model: "gpt-5.6-sol",
      implementationTimeoutMs: 1_000,
      reviewTimeoutMs: 1_000,
      codex: mockCodex([implementation("implement"), reviewAccept("review-1", ["verification:typecheck"])]),
    }),
    /cannot accept a revision without verification/u,
  );
});

test("compose request rejects unknown keys, path escapes, and excessive repairs", () => {
  assert.throws(() => decodeComposeRefineRequest({ ...request(), command: "pnpm test" }), /unknown: command/u);
  assert.throws(() => decodeComposeRefineRequest({ ...request(), writablePaths: ["../outside.ts"] }), /contained relative path/u);
  assert.throws(() => decodeComposeRefineRequest({ ...request(), repairBudget: 3 }), /integer from 0 through 2/u);
});

function request() {
  return {
    schemaVersion: 1 as const,
    objective: "Implement approved Candidate A",
    baselineRevision: "a".repeat(40),
    approvedCandidateReference: `sha256:${"b".repeat(64)}`,
    approvedCandidatePath: ".codex/work/candidate-a.json",
    specificationPath: ".codex/work/specification.md",
    specificationSha256: "c".repeat(64),
    writablePaths: ["src/components/instance-workspace.tsx", "src/components/instance-ui.test.tsx"],
    verificationChecks: ["typecheck", "test", "build"],
    renderStates: [
      { id: "overview-unreachable", beforeReference: "evidence/before-overview.png", screenshotName: "light-1440-unreachable.png", observation: "Overview failure state" },
      { id: "logs-filtered-error", beforeReference: "evidence/before-logs.png", screenshotName: "light-1440-logs.png", observation: "Filtered log state" },
    ],
    constraints: ["Preserve content and behavior"],
    repairBudget: 2 as const,
  };
}

function implementation(stage: ImplementationTaskId): JsonValue {
  return {
    kind: "implemented",
    summary: `${stage} completed the approved presentation`,
    changedFiles: ["src/components/instance-workspace.tsx"],
    evidence: [{ kind: stage, summary: "Used the approved specification", references: ["approved-candidate", "specification"] }],
  };
}

function reviewAccept(
  taskId: "review-1" | "review-2" | "review-3",
  references: readonly string[] = ["after:overview-unreachable", "after:logs-filtered-error"],
): JsonValue {
  return {
    kind: "accept",
    findings: [],
    issue: "No blocking rendered-composition findings remain.",
    evidence: [{ kind: taskId, summary: "Rendered evidence satisfies the approved composition", references }],
  };
}

function reviewRepair(taskId: "review-1" | "review-2" | "review-3"): JsonValue {
  return {
    kind: "repair",
    findings: [{
      id: `${taskId}-alignment`,
      dimension: "alignment",
      summary: "Keep long values inside the local value column",
      evidence: [{ kind: taskId, summary: "The Overview screenshot shows a wrapping defect", references: ["after:overview-unreachable"] }],
    }],
    issue: "",
    evidence: [{ kind: taskId, summary: "One blocking alignment finding remains", references: ["after:overview-unreachable"] }],
  };
}

function environment(stages: string[] = []): ComposeRevisionEnvironment {
  let revisionIndex = 0;
  return {
    async materialize(input) {
      stages.push(input.stage);
      revisionIndex += 1;
      const artifact = readyArtifact(input.stage, String(revisionIndex).repeat(40));
      return {
        artifact,
        evidence: [{ kind: "revision", summary: `Stored ${input.stage}`, references: [artifact.revision] }],
      };
    },
  };
}

function failedEnvironment(): ComposeRevisionEnvironment {
  return {
    async materialize(input) {
      return {
        artifact: {
          status: "verification_failed",
          stage: input.stage,
          revision: "d".repeat(40),
          summary: input.decision.summary,
          changedFiles: input.decision.changedFiles,
          verification: [
            { id: "typecheck", ok: false, summary: "Typecheck failed", diagnostics: ["TS error"] },
            { id: "test", ok: true, summary: "Tests passed", diagnostics: [] },
            { id: "build", ok: true, summary: "Build passed", diagnostics: [] },
          ],
          problem: "Typecheck failed",
        },
        evidence: [{ kind: "verification", summary: "Typecheck failed", references: ["typecheck"] }],
      };
    },
  };
}

function readyArtifact(stage: ImplementationTaskId, revision: string): RevisionArtifact {
  return {
    status: "ready_for_review",
    stage,
    revision,
    summary: `${stage} revision`,
    changedFiles: ["src/components/instance-workspace.tsx"],
    verification: [
      { id: "typecheck", ok: true, summary: "Typecheck passed", diagnostics: [] },
      { id: "test", ok: true, summary: "Tests passed", diagnostics: [] },
      { id: "build", ok: true, summary: "Build passed", diagnostics: [] },
    ],
    render: {
      revision,
      aggregateSha256: "e".repeat(64),
      states: [
        { id: "overview-unreachable", screenshotReference: "after/overview.png", sha256: "f".repeat(64), observation: "Overview captured" },
        { id: "logs-filtered-error", screenshotReference: "after/logs.png", sha256: "1".repeat(64), observation: "Logs captured" },
      ],
      consoleErrors: [],
      layoutFacts: { canScrollX: false },
    },
  };
}

function store(names: string[]): ComposeArtifactStore {
  return {
    async store(name) {
      names.push(name);
      return `sha256:${name}`;
    },
  };
}

function mockCodex(responses: readonly JsonValue[]): WorkflowCodex {
  let responseIndex = 0;
  const threads = new Map<string, WorkflowThread>();
  return {
    startThread(options: ThreadOptions) {
      if (options.workingDirectory === "D:\\fixture") {
        assert.equal(options.sandboxMode, "danger-full-access");
        assert.equal(options.networkAccessEnabled, false);
      } else {
        assert.equal(options.workingDirectory, "D:\\evidence");
        assert.equal(options.skipGitRepoCheck, true);
        assert.equal(options.sandboxMode, "danger-full-access");
      }
      const id = `thread-${threads.size + 1}`;
      const thread: WorkflowThread = {
        id,
        async run(input, turnOptions) {
          const response = responses[responseIndex];
          if (response === undefined) throw new Error(`No mock response ${responseIndex + 1}`);
          const schema = JSON.stringify(turnOptions.outputSchema);
          assert.equal(
            schema.includes("src/components/instance-workspace.tsx") ||
            schema.includes("after:overview-unreachable") ||
            schema.includes("verification:typecheck"),
            true,
          );
          assert.equal(input.includes("danger-full-access"), false);
          responseIndex += 1;
          return { finalResponse: JSON.stringify(response), usage: null };
        },
      };
      threads.set(id, thread);
      return thread;
    },
    resumeThread(id) {
      const thread = threads.get(id);
      if (thread === undefined) throw new Error(`Unknown mock thread ${id}`);
      return thread;
    },
  };
}
