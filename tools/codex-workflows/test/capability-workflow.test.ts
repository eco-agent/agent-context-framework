import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyResult } from "@agent-context/repo-policy";
import {
  decodeObjectiveId,
  MemoryLedger,
  runCapabilityWorkflow,
  type CapabilityArtifact,
  type Evidence,
  type RepairInput,
} from "../src/index.js";

const request = {
  objectiveId: decodeObjectiveId("70000000-0000-4000-8000-000000000002"),
  objective: "Implement repository policy",
  contractPath: ".codex/work/types/dev-tooling-contract.md",
  baselineRevision: "011e03fe35531174548dac646a7c3bc1cc82b7d7",
  supersedes: [],
  writablePaths: ["tools/repo-policy/**"],
  readableReferences: ["docs/adr/0016-package-ownership-and-dependency-boundaries.md"],
  verificationProfile: "workspace-structure",
  repairBudget: 1,
} as const;

const artifact: CapabilityArtifact = {
  revision: "abc123",
  summary: "Implemented policy",
  changedFiles: ["tools/repo-policy/src/cli.ts"],
};

const evidence: readonly Evidence[] = [
  {
    kind: "diff",
    summary: "Bounded diff",
    references: ["abc123"],
  },
];

test("capability workflow gives repair only compact policy failures", async () => {
  const ledger = new MemoryLedger("capability-repair");
  const repairInputs: RepairInput[] = [];
  let verificationAttempt = 0;

  const result = await runCapabilityWorkflow(
    request,
    {
      worker: {
        id: "implementer",
        async implement() {
          return { artifact, evidence };
        },
        async repair(input) {
          repairInputs.push(input);
          return {
            artifact: { ...artifact, revision: "def456", summary: "Repaired policy" },
            evidence,
          };
        },
      },
      verifier: {
        async verify(): Promise<PolicyResult> {
          verificationAttempt += 1;
          const ok = verificationAttempt > 1;
          return policyResult(ok);
        },
      },
      reviewer: {
        id: "independent-reviewer",
        async inspect() {
          return { kind: "accept", evidence };
        },
      },
    },
    { ledger, objectiveId: request.objectiveId },
  );

  assert.equal(result.status, "completed");
  assert.equal(repairInputs.length, 1);
  assert.deepEqual(repairInputs[0]?.observedFailures, [
    {
      id: "typecheck",
      summary: "typecheck failed.",
      diagnostics: ["See compact artifact."],
      artifact: ".codex/artifacts/run/typecheck.log",
    },
  ]);
});

test("zero repair budget stops before changing the artifact again", async () => {
  const ledger = new MemoryLedger("capability-no-repair");
  let repairs = 0;
  const result = await runCapabilityWorkflow(
    { ...request, repairBudget: 0 },
    {
      worker: {
        id: "implementer",
        async implement() {
          return { artifact, evidence };
        },
        async repair() {
          repairs += 1;
          return { artifact, evidence };
        },
      },
      verifier: {
        async verify() {
          return policyResult(false);
        },
      },
      reviewer: {
        id: "independent-reviewer",
        async inspect() {
          return { kind: "accept", evidence };
        },
      },
    },
    { ledger, objectiveId: request.objectiveId },
  );

  assert.equal(result.status, "budget_exhausted");
  assert.equal(repairs, 0);
});

function policyResult(ok: boolean): PolicyResult {
  return {
    ok,
    operation: "verify-profile",
    profile: "workspace-structure",
    changedFiles: [],
    affectedUnits: ["@agent-context/repo-policy"],
    checks: [
      {
        id: "typecheck",
        ok,
        durationMs: 1,
        summary: ok ? "typecheck passed." : "typecheck failed.",
        diagnostics: ok ? [] : ["See compact artifact."],
        artifact: ".codex/artifacts/run/typecheck.log",
      },
    ],
  };
}
