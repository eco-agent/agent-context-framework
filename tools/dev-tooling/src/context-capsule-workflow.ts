import { realpath } from "node:fs/promises";
import path from "node:path";

import {
  CONTEXT_CAPSULE_PATH,
  artifactIdentity,
  type ContextCapsuleActivationLock,
  type ContextInstallationLockV2,
  type ContextLockedArtifact,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";

import {
  buildContextCapsule,
  contextCapsuleEntryBytes,
  isContextCapsuleMaterializedArtifact,
  readContextCapsuleFile,
  replaceContextCapsuleActivation,
  type BuiltContextCapsule,
} from "./context-capsule.js";
import {
  verifyContextCapsuleInstallation,
  type ContextCapsuleInstallationVerification,
} from "./context-capsule-installation.js";
import {
  materializeContextCapsule,
  planContextCapsuleMaterialization,
  type ContextMaterializationResult,
} from "./context-capsule-materialization.js";
import {
  createContextProjectConfig,
  planContextInstallation,
  type ArtifactAssessment,
  type ContextInstallationPlan,
  type ContextSourceOverrides,
} from "./context-installer.js";
import {
  applyContextTransaction,
  resumeContextTransaction,
  type ContextTransactionRecoveryResult,
} from "./context-transaction.js";

export interface ContextCapsulePackConflict {
  readonly targetPath: string;
  readonly detail: string;
}

export type ContextCapsulePackResult =
  | {
      readonly status: "packed" | "current";
      readonly projectRoot: string;
      readonly capsulePath: string;
      readonly capsuleSha256: string;
      readonly treeSha256: string;
      readonly directComponents: readonly string[];
      readonly resolvedComponents: readonly string[];
      readonly writtenPaths: readonly string[];
      readonly sync: ContextMaterializationResult;
      readonly recovery: ContextTransactionRecoveryResult;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "blocked";
      readonly projectRoot: string;
      readonly capsulePath: string;
      readonly capsuleSha256: string | null;
      readonly treeSha256: string | null;
      readonly directComponents: readonly string[];
      readonly resolvedComponents: readonly string[];
      readonly writtenPaths: readonly string[];
      readonly sync: null;
      readonly recovery: ContextTransactionRecoveryResult;
      readonly conflicts: readonly ContextCapsulePackConflict[];
    };

export interface ContextCapsuleSyncResult {
  readonly status: "synced" | "current" | "blocked";
  readonly projectRoot: string;
  readonly capsulePath: string;
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly verification: ContextCapsuleInstallationVerification;
  readonly materialization: ContextMaterializationResult | null;
  readonly recovery: ContextTransactionRecoveryResult;
  readonly conflicts: readonly ContextCapsulePackConflict[];
}

export async function packContextCapsule(
  frameworkRoot: string,
  projectRootCandidate: string,
  frameworkRevision: string,
  requestedComponents: readonly string[],
): Promise<ContextCapsulePackResult> {
  const projectRoot = await realpath(projectRootCandidate);
  const capsulePath = path.join(projectRoot, CONTEXT_CAPSULE_PATH);
  const recovery = await resumeContextTransaction(projectRoot);
  const previousCapsule = await readOptionalCapsule(capsulePath);
  if (previousCapsule !== null) {
    const currentProjection = await planContextCapsuleMaterialization(previousCapsule, projectRoot);
    if (currentProjection.status === "blocked") {
      return blockedPack(
        projectRoot,
        capsulePath,
        previousCapsule,
        recovery,
        currentProjection.conflicts,
        [],
      );
    }
  }
  const directComponents = uniqueInOrder([
    "core",
    ...(requestedComponents.length > 0
      ? requestedComponents
      : previousCapsule?.payload.selection.directComponents ?? []),
  ]);
  const candidateCapsule = await buildContextCapsule({
    frameworkRoot,
    frameworkRevision,
    directComponents,
  });
  const previousLock = previousCapsule === null
    ? null
    : embeddedInstallation(previousCapsule);
  const selected = new Set([
    ...(previousCapsule?.payload.selection.resolvedComponents.map((component) => component.name) ?? []),
    ...candidateCapsule.payload.selection.resolvedComponents.map((component) => component.name),
  ]);
  const plan = await planContextInstallation(
    projectRoot,
    frameworkRoot,
    activationRegistry(candidateCapsule),
    createContextProjectConfig(directComponents),
    previousLock,
    previousCapsule === null
      ? { kind: "install" }
      : { kind: "update", mode: "preserve-local", components: selected },
    activationSources(candidateCapsule),
  );
  if (plan.status === "blocked") {
    return blockedPack(
      projectRoot,
      capsulePath,
      candidateCapsule,
      recovery,
      plan.conflicts.map(assessmentConflict),
      [],
    );
  }
  const preservedDrift = plan.assessments.filter((assessment) =>
    assessment.status === "locally-modified");
  if (preservedDrift.length > 0) {
    return blockedPack(
      projectRoot,
      capsulePath,
      candidateCapsule,
      recovery,
      preservedDrift.map(assessmentConflict),
      [],
    );
  }
  const nextCapsule = replaceContextCapsuleActivation(
    candidateCapsule,
    plannedActivation(plan),
  );
  requireEmbeddedActivation(plan, nextCapsule);
  const nextProjection = await planContextCapsuleMaterialization(nextCapsule, projectRoot);
  if (nextProjection.status === "blocked") {
    return blockedPack(
      projectRoot,
      capsulePath,
      nextCapsule,
      recovery,
      nextProjection.conflicts,
      [],
    );
  }
  const capsuleChanged = previousCapsule?.capsuleSha256 !== nextCapsule.capsuleSha256;
  const mutations = [
    ...plan.mutations,
    ...(capsuleChanged
      ? [{ operation: "write" as const, targetPath: CONTEXT_CAPSULE_PATH, content: nextCapsule.bytes }]
      : []),
  ];
  const writtenPaths = await applyContextTransaction(
    projectRoot,
    "pack",
    nextCapsule.payload.registry.revision,
    mutations,
  );
  const sync = await materializeContextCapsule(nextCapsule, projectRoot);
  if (sync.status === "blocked") {
    return blockedPack(
      projectRoot,
      capsulePath,
      nextCapsule,
      recovery,
      sync.conflicts,
      writtenPaths,
    );
  }
  return {
    status: writtenPaths.length === 0 && sync.status === "current" ? "current" : "packed",
    projectRoot,
    capsulePath,
    capsuleSha256: nextCapsule.capsuleSha256,
    treeSha256: nextCapsule.treeSha256,
    directComponents: nextCapsule.payload.selection.directComponents,
    resolvedComponents: nextCapsule.payload.selection.resolvedComponents.map((component) => component.name),
    writtenPaths,
    sync,
    recovery,
    conflicts: [],
  };
}

export async function syncContextCapsule(
  projectRootCandidate: string,
): Promise<ContextCapsuleSyncResult> {
  const projectRoot = await realpath(projectRootCandidate);
  const recovery = await resumeContextTransaction(projectRoot);
  const capsulePath = path.join(projectRoot, CONTEXT_CAPSULE_PATH);
  const capsule = await readContextCapsuleFile(capsulePath);
  const verification = await verifyContextCapsuleInstallation(capsule, projectRoot);
  if (!verification.ok) {
    return {
      status: "blocked",
      projectRoot,
      capsulePath,
      capsuleSha256: capsule.capsuleSha256,
      treeSha256: capsule.treeSha256,
      verification,
      materialization: null,
      recovery,
      conflicts: verification.mismatches.map((mismatch) => ({
        targetPath: mismatch.targetPath ?? mismatch.identity,
        detail: mismatch.detail,
      })),
    };
  }
  const materialization = await materializeContextCapsule(capsule, projectRoot);
  return {
    status: materialization.status === "blocked"
      ? "blocked"
      : materialization.status === "current" ? "current" : "synced",
    projectRoot,
    capsulePath,
    capsuleSha256: capsule.capsuleSha256,
    treeSha256: capsule.treeSha256,
    verification,
    materialization,
    recovery,
    conflicts: materialization.conflicts,
  };
}

function embeddedInstallation(capsule: BuiltContextCapsule): ContextInstallationLockV2 {
  const activation = new Map(capsule.payload.activation.map((record) => [record.identity, record]));
  const artifacts: ContextLockedArtifact[] = [];
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (isContextCapsuleMaterializedArtifact(artifact)) continue;
      const identity = artifactIdentity(artifact);
      const installed = activation.get(identity);
      if (installed === undefined) {
        throw new Error(`Context capsule activation is missing ${identity}.`);
      }
      artifacts.push({
        ...artifact,
        component: component.name,
        installedSha256: installed.installedSha256,
      });
    }
  }
  return {
    schemaVersion: 2,
    registryRevision: capsule.payload.registry.revision,
    components: capsule.payload.selection.resolvedComponents.map((component) => component.name),
    artifacts,
  };
}

function activationRegistry(capsule: BuiltContextCapsule): ContextRegistryV2 {
  return {
    schemaVersion: capsule.payload.registry.schemaVersion,
    revision: capsule.payload.registry.revision,
    decisionPath: capsule.payload.registry.decisionPath,
    components: capsule.payload.selection.resolvedComponents.map((component) => ({
      ...component,
      artifacts: component.artifacts.filter((artifact) =>
        !isContextCapsuleMaterializedArtifact(artifact)),
    })),
  };
}

function activationSources(capsule: BuiltContextCapsule): ContextSourceOverrides {
  const sources = new Map<string, string>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (isContextCapsuleMaterializedArtifact(artifact) || sources.has(artifact.sourcePath)) continue;
      sources.set(
        artifact.sourcePath,
        decodeUtf8(
          contextCapsuleEntryBytes(capsule, artifact.sourcePath),
          `Context capsule activation source ${artifact.sourcePath}`,
        ),
      );
    }
  }
  return sources;
}

function requireEmbeddedActivation(
  plan: Extract<ContextInstallationPlan, { status: "ready" }>,
  capsule: BuiltContextCapsule,
): void {
  const planned = plan.nextLock.artifacts
    .map((artifact) => ({
      identity: artifactIdentity(artifact),
      targetPath: artifact.targetPath,
      installedSha256: artifact.installedSha256,
    }))
    .sort((left, right) => compareStrings(left.identity, right.identity));
  if (JSON.stringify(planned) !== JSON.stringify(capsule.payload.activation)) {
    throw new Error("Capsule embedded activation differs from the installation plan.");
  }
}

function plannedActivation(
  plan: Extract<ContextInstallationPlan, { status: "ready" }>,
): readonly ContextCapsuleActivationLock[] {
  return plan.nextLock.artifacts
    .map((artifact) => ({
      identity: artifactIdentity(artifact),
      targetPath: artifact.targetPath,
      installedSha256: artifact.installedSha256,
    }))
    .sort((left, right) => compareStrings(left.identity, right.identity));
}

function assessmentConflict(assessment: ArtifactAssessment): ContextCapsulePackConflict {
  return { targetPath: assessment.targetPath, detail: assessment.detail };
}

function blockedPack(
  projectRoot: string,
  capsulePath: string,
  capsule: BuiltContextCapsule | null,
  recovery: ContextTransactionRecoveryResult,
  conflicts: readonly ContextCapsulePackConflict[],
  writtenPaths: readonly string[],
): Extract<ContextCapsulePackResult, { status: "blocked" }> {
  return {
    status: "blocked",
    projectRoot,
    capsulePath,
    capsuleSha256: capsule?.capsuleSha256 ?? null,
    treeSha256: capsule?.treeSha256 ?? null,
    directComponents: capsule?.payload.selection.directComponents ?? [],
    resolvedComponents: capsule?.payload.selection.resolvedComponents.map((component) => component.name) ?? [],
    writtenPaths,
    sync: null,
    recovery,
    conflicts,
  };
}

async function readOptionalCapsule(candidate: string): Promise<BuiltContextCapsule | null> {
  try {
    return await readContextCapsuleFile(candidate);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must contain valid UTF-8.`, { cause: error });
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueInOrder(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
