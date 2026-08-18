import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  artifactHash,
  leaseId,
  objectiveId,
  runId,
  utcTimestamp,
  type ArtifactReference,
  type LeasedObjective,
} from "@agent-context/objective-kernel";
import type {
  CapabilityRequest,
  ImplementationContractV2,
  ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import {
  createTaskEnvelope,
  renderTaskEnvelopeContext,
  serializeTaskEnvelope,
  TASK_ENVELOPE_MEDIA_TYPE,
  taskEnvelopeBytes,
  VerifiedTaskEnvelopeV2,
  verifyEnvelopeSourceHashes,
} from "../src/task-envelope.js";

const execFileAsync = promisify(execFile);

test("task envelope is a deterministic, bounded leased-attempt projection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-envelope-"));
  try {
    const contractPath = "contract.md";
    const primaryPath = "primary.ts";
    const secondaryPath = "secondary.ts";
    const implementationPath = "implementation.json";
    const evidencePath = "precedent.md";
    const skillPath = ".codex/skills/product-skill/SKILL.md";
    const materializationPath = "materialization.json";
    const precedentSourcePath = "upstream-board.tsx";
    await writeFile(path.join(root, contractPath), "# Outcome\nImplement one slice.\n");
    await writeFile(path.join(root, evidencePath), "# GitHub Issues precedent\nUse list/detail topology.\n");
    const precedentSourceBytes = Buffer.from("export const Board = () => 'upstream';\n");
    await writeFile(path.join(root, precedentSourcePath), precedentSourceBytes);
    await writeFile(path.join(root, "LICENSE"), "MIT License\n");
    await mkdir(path.dirname(path.join(root, skillPath)), { recursive: true });
    await writeFile(
      path.join(root, skillPath),
      "---\nname: product-skill\ndescription: Use external evidence.\n---\n\n# Product skill\n",
    );
    await git(root, ["init"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test"]);
    await git(root, ["remote", "add", "origin", "https://github.com/example/issues-clone.git"]);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "pinned source"]);
    const precedentRevision = await git(root, ["rev-parse", "HEAD"]);
    const implementationContract = productImplementationContract(
      evidencePath,
      skillPath,
      materializationPath,
      precedentRevision,
    );
    await writeFile(path.join(root, implementationPath), JSON.stringify(implementationContract));
    const productPrecedentMaterialization = materialization(
      implementationContract,
      evidencePath,
      precedentSourceBytes,
    );
    await writeFile(
      path.join(root, materializationPath),
      JSON.stringify(productPrecedentMaterialization),
    );
    await writeFile(path.join(root, primaryPath), "export const owner = true;\n");
    await writeFile(path.join(root, secondaryPath), "export const omitted = true;\n");
    const snapshot = leasedSnapshot(1);
    const binding = {
      requestPath: "request.json",
      requestHash: "a".repeat(64),
      contractPath,
      contractHash: sha256(await readFile(path.join(root, contractPath))),
      implementationContract: {
        path: implementationPath,
        hash: sha256(await readFile(path.join(root, implementationPath))),
      },
      productPrecedentMaterialization: {
        path: materializationPath,
        hash: sha256(await readFile(path.join(root, materializationPath))),
      },
      baselineRevision: "b".repeat(40),
    };
    const capability = taskCapability(snapshot, binding, [
      evidencePath,
      skillPath,
      materializationPath,
      precedentSourcePath,
      primaryPath,
      secondaryPath,
    ]);

    const first = await createTaskEnvelope(root, {
      snapshot,
      binding,
      capability,
      implementationContract,
      productPrecedentMaterialization,
    });
    const second = await createTaskEnvelope(root, {
      snapshot,
      binding,
      capability,
      implementationContract,
      productPrecedentMaterialization,
    });
    assert.deepEqual(second, first);
    assert.equal(first.objective.objectiveId, snapshot.definition.objectiveId);
    assert.equal(first.attempt.leaseId, snapshot.lease.leaseId);
    assert.deepEqual(
      first.context.sources.map((source) => source.role),
      [
        "task_contract",
        "implementation_contract",
        "implementation_skill",
        "product_precedent_materialization",
        "product_precedent",
        "product_precedent_source",
        "supplemental",
        "supplemental",
      ],
    );
    assert.equal(first.context.omittedReferenceCount, 0);
    assert.equal(first.implementation?.productPrecedent?.product, "GitHub Issues");
    const serialized = serializeTaskEnvelope(first);
    assert.ok(Buffer.byteLength(serialized, "utf8") <= first.context.maxEnvelopeBytes);
    assert.equal(first.context.sources.every((source) => source.truncated === false), true);
    assert.match(serialized, /export const Board = \(\) => 'upstream'/u);
    assert.doesNotMatch(serialized, /sessionId|acquiredAt|expiresAt|recordedAt|resumeToken/u);

    const verified = VerifiedTaskEnvelopeV2.create({
      envelope: first,
      expected: first,
      snapshot,
    });
    const artifact = referenceFor(first);
    assert.match(renderTaskEnvelopeContext(verified, artifact), /^TaskEnvelopeV2 sha256:/u);
    await verifyEnvelopeSourceHashes(root, verified.value);

    const nextAttempt = leasedSnapshot(2);
    const next = await createTaskEnvelope(root, {
      snapshot: nextAttempt,
      binding,
      capability: taskCapability(nextAttempt, binding, capability.readableReferences),
      implementationContract,
      productPrecedentMaterialization,
    });
    assert.notEqual(serializeTaskEnvelope(next), serialized);

    await assert.rejects(
      createTaskEnvelope(root, {
        snapshot,
        binding,
        capability,
        implementationContract: {
          ...implementationContract,
          productPrecedent: implementationContract.productPrecedent === null
            ? null
            : {
                ...implementationContract.productPrecedent,
                deviations: [{
                  acceptanceGateId: "invented-deviation",
                  description: "Unowned product change.",
                }],
              },
        },
        productPrecedentMaterialization,
      }),
      /unknown acceptance gate/u,
    );

    await writeFile(path.join(root, skillPath), "# Changed implementation skill\n");
    await assert.rejects(
      verifyEnvelopeSourceHashes(root, verified.value),
      /source changed: \.codex\/skills\/product-skill\/SKILL\.md/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task envelope rejects mismatched identity and an oversized contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-envelope-size-"));
  try {
    await writeFile(path.join(root, "contract.md"), `${"x".repeat(11_000)}\n`);
    const roomySnapshot = leasedSnapshot(1);
    const snapshot: LeasedObjective = {
      ...roomySnapshot,
      definition: {
        ...roomySnapshot.definition,
        budget: { ...roomySnapshot.definition.budget, maxContextBytes: 8_000 },
      },
    };
    const binding = {
      requestPath: "request.json",
      requestHash: "a".repeat(64),
      contractPath: "contract.md",
      contractHash: sha256(await readFile(path.join(root, "contract.md"))),
      implementationContract: null,
      productPrecedentMaterialization: null,
      baselineRevision: "b".repeat(40),
    };
    const capability = taskCapability(snapshot, binding, []);
    await assert.rejects(
      createTaskEnvelope(root, {
        snapshot,
        binding,
        capability: {
          ...capability,
          objectiveId: objectiveId("73000000-0000-4000-8000-000000000099"),
        },
        implementationContract: null,
        productPrecedentMaterialization: null,
      }),
      /identity/u,
    );
    const unauthorizedSnapshot: LeasedObjective = {
      ...snapshot,
      definition: {
        ...snapshot.definition,
        authority: { allowedActors: ["different-worker"] },
      },
    };
    await assert.rejects(
      createTaskEnvelope(root, {
        snapshot: unauthorizedSnapshot,
        binding,
        capability,
        implementationContract: null,
        productPrecedentMaterialization: null,
      }),
      /outside objective authority/u,
    );
    await assert.rejects(
      createTaskEnvelope(root, {
        snapshot,
        binding,
        capability,
        implementationContract: null,
        productPrecedentMaterialization: null,
      }),
      /Mandatory task envelope .* exceeds the 8000-byte remaining context budget/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function leasedSnapshot(attempt: number): LeasedObjective {
  const id = objectiveId("73000000-0000-4000-8000-000000000001");
  const now = utcTimestamp("2026-01-01T00:00:00.000Z");
  return {
    state: "leased",
    definition: {
      schemaVersion: 1,
      objectiveId: id,
      objectiveKey: "task-envelope-test",
      purpose: "Implement one slice",
      parent: { type: "root" },
      dependencies: [],
      authority: { allowedActors: ["codex-worker"] },
      acceptance: [{ gateId: "proof", description: "Tests pass", evidenceTypes: ["test"] }],
      budget: {
        maxAttempts: 3,
        maxTransitions: 20,
        maxContextBytes: 20_000,
        maxPromptBytes: 50_000,
        maxAgentInputTokens: 100_000,
        maxAgentOutputTokens: 20_000,
      },
      context: [{ type: "git", repository: "fixture", revision: "head" }],
      metadata: { adapter: "codex" },
    },
    lease: {
      leaseId: leaseId(`73000000-0000-4000-8000-${attempt.toString().padStart(12, "0")}`),
      runId: runId(`73000000-0000-4000-8001-${attempt.toString().padStart(12, "0")}`),
      workerId: "codex-worker",
      acquiredAt: now,
      expiresAt: utcTimestamp("2026-01-01T00:01:00.000Z"),
      attempt,
    },
    version: attempt,
    eventSequence: attempt,
    usage: {
      attempts: attempt,
      transitions: attempt,
      contextBytes: 0,
      promptBytes: 0,
      agentInputTokens: 0,
      agentOutputTokens: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function taskCapability(
  snapshot: LeasedObjective,
  binding: {
    readonly contractPath: string;
    readonly baselineRevision: string;
    readonly implementationContract: { readonly path: string; readonly hash: string } | null;
    readonly productPrecedentMaterialization: {
      readonly path: string;
      readonly hash: string;
    } | null;
  },
  readableReferences: readonly string[],
): CapabilityRequest {
  const base = {
    objectiveId: snapshot.definition.objectiveId,
    objective: snapshot.definition.purpose,
    contractPath: binding.contractPath,
    baselineRevision: binding.baselineRevision,
    supersedes: [],
    writablePaths: ["owner.ts", "THIRD_PARTY_LICENSE.txt"],
    readableReferences,
    repairBudget: 0 as const,
  };
  return binding.implementationContract === null
    ? { ...base, verificationProfile: "workflow" }
    : {
        ...base,
        verificationProfile: "product-topology",
        implementationContractPath: binding.implementationContract.path,
      };
}

function referenceFor(envelope: Parameters<typeof taskEnvelopeBytes>[0]): ArtifactReference {
  const bytes = taskEnvelopeBytes(envelope);
  return {
    hash: artifactHash(`sha256:${sha256(bytes)}`),
    mediaType: TASK_ENVELOPE_MEDIA_TYPE,
    bytes: bytes.byteLength,
    label: "TaskEnvelopeV2 test",
  };
}

function productImplementationContract(
  evidencePath: string,
  skillPath: string,
  materializationPath: string,
  revision: string,
): ImplementationContractV2 {
  return {
    schemaVersion: 2,
    replacements: [{ path: "legacy-task-board.tsx", disposition: "remove" }],
    skills: [skillPath],
    productPrecedent: {
      product: "GitHub Issues",
      source: {
        repository: "https://github.com/example/issues-clone.git",
        revision,
        license: "MIT",
      },
      checkoutPath: ".",
      licensePath: "LICENSE",
      evidencePath,
      materializationPath,
      adopt: ["list and detail topology"],
      deviations: [{ acceptanceGateId: "proof", description: "Expose objective state." }],
      implementation: {
        kind: "reuse",
        licenseNoticePath: "THIRD_PARTY_LICENSE.txt",
        files: [{ sourcePath: "upstream-board.tsx", targetPath: "owner.ts", mode: "copy" }],
      },
    },
  };
}

function materialization(
  contract: ImplementationContractV2,
  evidencePath: string,
  precedentSourceBytes: Uint8Array,
): ProductPrecedentMaterializationV2 {
  const precedent = contract.productPrecedent;
  if (precedent === null) throw new Error("Fixture precedent is missing.");
  const evidenceBytes = Buffer.from("# GitHub Issues precedent\nUse list/detail topology.\n");
  const evidenceHash = sha256(evidenceBytes);
  return {
    schemaVersion: 2,
    repository: precedent.source.repository,
    resolvedOrigin: precedent.source.repository,
    requestedRevision: precedent.source.revision,
    checkoutPath: precedent.checkoutPath,
    checkedOutRevision: precedent.source.revision,
    ancestry: "equal",
    license: {
      declared: precedent.source.license,
      path: precedent.licensePath,
      noticePath: "THIRD_PARTY_LICENSE.txt",
      sha256: "d".repeat(64),
    },
    evidence: {
      path: evidencePath,
      sha256: evidenceHash,
      artifact: {
        hash: artifactHash(`sha256:${evidenceHash}`),
        mediaType: "text/markdown",
        bytes: evidenceBytes.byteLength,
        label: `Product precedent evidence: ${precedent.product}`,
      },
    },
    sourceFiles: [{
      sourcePath: "upstream-board.tsx",
      targetPath: "owner.ts",
      mode: "copy",
      sha256: sha256(precedentSourceBytes),
      bytes: precedentSourceBytes.byteLength,
    }],
  };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.stdout.trim();
}
