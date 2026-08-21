import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeActiveTaskBinding,
  decodeCapabilityRequest,
} from "../src/model.js";
import { profileForChanges, verificationProfiles } from "../src/profiles.js";
import { matchesWritablePath } from "../src/checks/scope.js";

const validRequest = {
  objectiveId: "60000000-0000-4000-8000-000000000001",
  objective: "Implement one bounded change",
  contractPath: ".codex/work/types/dev-tooling-contract.md",
  baselineRevision: "011e03fe35531174548dac646a7c3bc1cc82b7d7",
  supersedes: [],
  writablePaths: ["tools/repo-policy/**"],
  readableReferences: ["docs/adr/0016-package-ownership-and-dependency-boundaries.md"],
  verificationProfile: "workspace-structure",
  repairBudget: 1,
} as const;

test("capability request accepts only registered control fields", () => {
  assert.deepEqual(decodeCapabilityRequest(validRequest), validRequest);
  assert.throws(
    () => decodeCapabilityRequest({ ...validRequest, command: "git push" }),
    /unknown fields: command/u,
  );
  assert.throws(
    () => decodeCapabilityRequest({ ...validRequest, verificationProfile: "product-topology" }),
    /require implementationContractPath/u,
  );
  assert.equal(
    decodeCapabilityRequest({ ...validRequest, verificationProfile: "frontend" }).verificationProfile,
    "frontend",
  );
  assert.equal(
    decodeCapabilityRequest({
      ...validRequest,
      verificationProfile: "product-topology",
      implementationContractPath: ".codex/work/implementation.json",
    }).implementationContractPath,
    ".codex/work/implementation.json",
  );
  assert.throws(
    () => decodeCapabilityRequest({ ...validRequest, objectiveId: "  " }),
    /objectiveId must be a lowercase RFC 9562 UUID/u,
  );
});

test("active task bindings reject unknown fields and invalid hashes", () => {
  const binding = {
    schemaVersion: 1,
    state: "session",
    sessionId: "thread-1",
    objectiveId: "60000000-0000-4000-8000-000000000002",
    leaseId: "60000000-0000-4000-8000-000000000003",
    runId: "60000000-0000-4000-8000-000000000004",
    workerId: "test-worker",
    attempt: 1,
    requestPath: ".codex/work/request.json",
    requestHash: "a".repeat(64),
    contractPath: ".codex/work/contract.md",
    contractHash: "b".repeat(64),
    implementationContract: null,
    productPrecedentMaterialization: null,
    baselineRevision: "c".repeat(40),
    executionDirectory: "D:/test/repository",
    envelopeArtifact: {
      hash: `sha256:${"d".repeat(64)}`,
      mediaType: "application/vnd.agent-context.task-envelope.v2+json",
      bytes: 100,
      label: "TaskEnvelopeV2 attempt 1",
    },
  };
  assert.deepEqual(decodeActiveTaskBinding(binding), binding);
  assert.throws(
    () => decodeActiveTaskBinding({ ...binding, extra: true }),
    /unknown fields: extra/u,
  );
  assert.throws(
    () => decodeActiveTaskBinding({ ...binding, contractHash: "short" }),
    /contractHash must be/u,
  );
});

test("writable scope supports exact paths and trailing recursive scope only", () => {
  assert.equal(matchesWritablePath("tools/repo-policy/src/cli.ts", "tools/repo-policy/**"), true);
  assert.equal(matchesWritablePath("tools/codex-workflows/src/index.ts", "tools/repo-policy/**"), false);
  assert.equal(matchesWritablePath("package.json", "package.json"), true);
});

test("changed paths select profiles without model judgment", () => {
  assert.equal(profileForChanges(["docs/README.md"]), "docs");
  assert.equal(profileForChanges(["tools/codex-workflows/src/index.ts"]), "workflow");
  assert.equal(profileForChanges(["package.json"]), "workspace-structure");
});

test("every changed-file verification profile runs agent prose", () => {
  for (const profile of Object.values(verificationProfiles)) {
    assert.equal(profile.checks.includes("agent-prose"), true);
  }
});
