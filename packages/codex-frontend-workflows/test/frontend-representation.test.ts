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
  decodeRepresentationRequest,
  runFrontendRepresentationWorkflow,
  type RepresentationArtifactStore,
} from "../src/frontend-representation.js";

test("representation workflow stores and accepts each fixed task before the next turn", async () => {
  const stored: string[] = [];
  const prompts: string[] = [];
  const ledger = new MemoryLedger("representation-test");
  const result = await runFrontendRepresentationWorkflow({
    request: request(),
    workingDirectory: "D:\\prepared-evidence",
    ledger,
    artifacts: store(stored),
    model: "gpt-5.6-sol",
    timeoutMs: 1_000,
    codex: mockCodex([candidateDecision("a", "single-flow"), candidateDecision("b", "split-pane"), comparisonDecision()], stored, prompts),
  });

  assert.equal(result.status, "awaiting_human_approval");
  assert.deepEqual(stored, ["candidate-a", "candidate-b", "comparison"]);
  assert.equal(prompts.length, 3);
  assert.equal(prompts.every((prompt) => !prompt.includes("src/components") && !prompt.includes("className=")), true);
  assert.equal(prompts.every((prompt) => prompt.includes("Evidence references must use these evidence IDs")), true);
  assert.equal(prompts.every((prompt) => prompt.includes("Every evidence item kind must be exactly")), true);
  assert.deepEqual(
    (await ledger.list()).filter((event) => event.type === "task.accepted").map((event) => event.taskId),
    ["candidate-a", "candidate-b", "compare"],
  );
  assert.equal((await ledger.list()).filter((event) => event.type === "codex.thread_bound").length, 3);
});

test("representation workflow rejects a cosmetic second candidate", async () => {
  const stored: string[] = [];
  await assert.rejects(
    runFrontendRepresentationWorkflow({
      request: request(),
      workingDirectory: "D:\\prepared-evidence",
      ledger: new MemoryLedger("cosmetic-test"),
      artifacts: store(stored),
      model: "gpt-5.6-sol",
      timeoutMs: 1_000,
      codex: mockCodex([candidateDecision("a", "single-flow"), candidateDecision("b", "single-flow")], stored, []),
    }),
    /must replace the composition mode/u,
  );
  assert.deepEqual(stored, ["candidate-a"]);
});

test("representation workflow rejects missing content and unknown evidence", async () => {
  const missingContent = candidateDecision("a", "single-flow");
  const artifact = missingContent.artifact as { preservedContentIds: string[] };
  artifact.preservedContentIds = artifact.preservedContentIds.slice(1);
  await assert.rejects(
    runFrontendRepresentationWorkflow({
      request: request(),
      workingDirectory: "D:\\prepared-evidence",
      ledger: new MemoryLedger("content-test"),
      artifacts: store([]),
      model: "gpt-5.6-sol",
      timeoutMs: 1_000,
      codex: mockCodex([missingContent], [], []),
    }),
    /preserved content must exactly match/u,
  );

  const unknownEvidence = candidateDecision("a", "single-flow");
  unknownEvidence.evidence[0]!.references = ["source-code"];
  await assert.rejects(
    runFrontendRepresentationWorkflow({
      request: request(),
      workingDirectory: "D:\\prepared-evidence",
      ledger: new MemoryLedger("evidence-test"),
      artifacts: store([]),
      model: "gpt-5.6-sol",
      timeoutMs: 1_000,
      codex: mockCodex([unknownEvidence], [], []),
    }),
    /unknown references/u,
  );
});

test("request decoder rejects unknown keys and duplicate state identities", () => {
  assert.throws(
    () => decodeRepresentationRequest({ ...request(), sourceFiles: ["src/App.tsx"] }),
    /unknown: sourceFiles/u,
  );
  const value = request();
  assert.throws(
    () => decodeRepresentationRequest({ ...value, requiredStates: [value.requiredStates[0], value.requiredStates[0]] }),
    /state IDs must not contain duplicates/u,
  );
});

function request() {
  return {
    schemaVersion: 1 as const,
    subject: "Instance workspace composition",
    decision: "How should existing operational content coexist without unnecessary containers?",
    audience: "Operators managing local Convex instances",
    productJob: "Inspect instance health and perform recovery or connection tasks",
    contentIds: ["identity", "runtime-status", "actions", "navigation", "runtime-facts", "endpoints"],
    requiredStates: [
      { id: "running", description: "Runtime is running", userNeed: "Confirm health and open the dashboard" },
      { id: "unreachable", description: "Endpoint checks fail", userNeed: "See the failure and retry" },
    ],
    evidence: [
      { id: "screen-running", kind: "screenshot" as const, reference: "running.png", observation: "Current wide workspace" },
      { id: "screen-unreachable", kind: "screenshot" as const, reference: "unreachable.png", observation: "Current recovery state" },
      { id: "layout", kind: "layout-facts" as const, reference: "layout.json", observation: "No horizontal viewport overflow" },
    ],
    constraints: ["Preserve all content IDs", "Do not add actions", "Use at most one primary surface"],
  };
}

function candidateDecision(id: "a" | "b", compositionMode: "single-flow" | "split-pane") {
  const requestValue = request();
  return {
    kind: "accept" as const,
    artifact: {
      id,
      title: id === "a" ? "Operational flow" : "Status and work split",
      thesis: id === "a" ? "Read from status into facts and actions" : "Keep live status beside the active work area",
      compositionMode,
      readingOrder: ["identity", "runtime-status", "actions", "navigation", "runtime-facts", "endpoints"],
      spatialGroups: [
        {
          id: "header",
          contentIds: ["identity", "runtime-status", "actions", "navigation"],
          layoutOwner: "workspace header",
          containment: "none" as const,
          interactionReason: "Placement and baseline alignment explain the relationship",
        },
        {
          id: "details",
          contentIds: ["runtime-facts", "endpoints"],
          layoutOwner: "workspace detail layout",
          containment: "primary" as const,
          interactionReason: "The scrollable workspace is the single primary work region",
        },
      ],
      primarySurfaceCount: 1 as const,
      additionalSurfaceReasons: [],
      density: { rowHeightPx: 32, gapPx: 12, controlHeightPx: 28, source: "Observed compact controls and rows" },
      preservedContentIds: [...requestValue.contentIds],
      stateTreatments: requestValue.requiredStates.map((state) => ({ stateId: state.id, treatment: `${state.id} remains visible in the shared flow` })),
      omissions: ["No cards, badges, decorative summaries, or repeated section framing"],
      majorChoiceReplaced: id === "a" ? "none" : "Replace one vertical detail flow with a status and work split",
    },
    confidence: 0.9,
    evidence: [{ kind: `candidate-${id}`, summary: `Candidate ${id} uses the supplied captures`, references: ["screen-running", "screen-unreachable", "layout"] }],
  };
}

function comparisonDecision() {
  return {
    kind: "accept" as const,
    artifact: {
      recommended: "a" as const,
      findings: [
        "hierarchy", "grouping", "alignment", "density", "surfaces", "omission", "state-legibility",
      ].map((dimension) => ({
        dimension,
        candidateA: `Candidate A treatment of ${dimension}`,
        candidateB: `Candidate B treatment of ${dimension}`,
        judgment: `Candidate A is quieter for ${dimension}`,
      })),
      selectedReason: "Candidate A keeps one reading direction for infrequent operational inspection",
      rejectedRisk: "Candidate B spends horizontal space before the operator starts a focused task",
      unresolvedRisks: ["Long endpoint paths still need a rendered narrow-width check"],
      approvalQuestion: "Approve Candidate A as the implementation specification?",
    },
    confidence: 0.88,
    evidence: [{ kind: "comparison", summary: "Both candidates were compared against the same captures", references: ["screen-running", "screen-unreachable", "layout"] }],
  };
}

function store(names: string[]): RepresentationArtifactStore {
  return {
    async store(name) {
      names.push(name);
      return `sha256:${name}`;
    },
  };
}

function mockCodex(responses: JsonValue[], stored: string[], prompts: string[]): WorkflowCodex {
  let index = 0;
  return {
    startThread(options: ThreadOptions) {
      assert.equal(options.workingDirectory, "D:\\prepared-evidence");
      assert.equal(options.skipGitRepoCheck, true);
      assert.equal(options.sandboxMode, "read-only");
      assert.equal(options.approvalPolicy, "never");
      assert.equal(options.networkAccessEnabled, false);
      const response = responses[index];
      if (response === undefined) throw new Error(`No mock response for turn ${index + 1}`);
      if (stored.length !== index) throw new Error(`Turn ${index + 1} started before the prior artifact was stored`);
      index += 1;
      const thread: WorkflowThread = {
        id: `thread-${index}`,
        async run(input, options) {
          const outputSchema = JSON.stringify(options.outputSchema);
          assert.equal(outputSchema.includes('"enum":["screen-running","screen-unreachable","layout"]'), true);
          assert.equal(outputSchema.includes(`"enum":["${index === 1 ? "candidate-a" : index === 2 ? "candidate-b" : "comparison"}"]`), true);
          assert.equal(outputSchema.includes("running.png"), false);
          prompts.push(input);
          return { finalResponse: JSON.stringify(response), usage: null };
        },
      };
      return thread;
    },
    resumeThread() {
      throw new Error("Representation workflow must not resume threads");
    },
  };
}
