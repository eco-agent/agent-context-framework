import path from "node:path";

import {
  artifactIdentity,
  CONTEXT_CAPSULE_PATH,
  CONTEXT_INSTALLATION_SCHEMA_VERSION,
  decodeContextCapsuleLock,
  type ContextCapsuleActivationLock,
  type ContextCapsuleLockV3,
  type ContextInstallationLockV2,
  type ContextLockedArtifact,
  type ContextRegistryArtifact,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";

import {
  buildContextCapsuleForProject,
  contextCapsuleEntryBytes,
  readContextCapsuleFile,
  type BuiltContextCapsule,
} from "./context-capsule.js";
import {
  readContextCapsuleProjectFiles,
  verifyContextCapsuleV3Installation,
} from "./context-capsule-installation.js";
import { createContextCapsuleLock } from "./context-capsule-lock.js";
import {
  contextCapsuleMaterializationActivation,
  materializeContextCapsule,
  planContextCapsuleMaterialization,
  type ContextMaterializationResult,
} from "./context-capsule-materialization.js";
import { classifyContextCapsuleRestart } from "./context-capsule-restart.js";
import {
  CONTEXT_LOCK_PATH,
  planContextInstallation,
  type ArtifactAssessment,
} from "./context-installer.js";
import {
  applyContextTransaction,
  inspectContextTransaction,
  type ContextMutation,
  type ContextTransactionOptions,
} from "./context-transaction.js";

export interface ContextCapsuleUpdateConflict {
  readonly targetPath: string;
  readonly detail: string;
}

export type ContextCapsuleUpdatePlan =
  | {
      readonly status: "ready" | "current";
      readonly projectRoot: string;
      readonly previousCapsule: BuiltContextCapsule;
      readonly nextCapsule: BuiltContextCapsule;
      readonly previousLock: ContextCapsuleLockV3;
      readonly nextLock: ContextCapsuleLockV3;
      readonly mutations: readonly ContextMutation[];
      readonly restart: ReturnType<typeof classifyContextCapsuleRestart>;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "blocked";
      readonly projectRoot: string;
      readonly previousCapsule: BuiltContextCapsule | null;
      readonly nextCapsule: BuiltContextCapsule | null;
      readonly previousLock: ContextCapsuleLockV3 | null;
      readonly nextLock: null;
      readonly mutations: readonly [];
      readonly restart: null;
      readonly conflicts: readonly ContextCapsuleUpdateConflict[];
    };

export interface ContextCapsuleUpdateResult {
  readonly status: "updated" | "current" | "blocked";
  readonly projectRoot: string;
  readonly previousCapsuleSha256: string | null;
  readonly nextCapsuleSha256: string | null;
  readonly restart: ReturnType<typeof classifyContextCapsuleRestart> | null;
  readonly materialization: ContextMaterializationResult | null;
  readonly writtenPaths: readonly string[];
  readonly conflicts: readonly ContextCapsuleUpdateConflict[];
}

export async function planContextCapsuleV3Update(
  frameworkRoot: string,
  projectRoot: string,
  frameworkRevision: string,
): Promise<ContextCapsuleUpdatePlan> {
  const projectFiles = await readContextCapsuleProjectFiles(projectRoot);
  const transaction = await inspectContextTransaction(projectFiles.projectRoot);
  if (transaction.status !== "none") {
    return blockedPlan(projectFiles.projectRoot, [{
      targetPath: ".agent-context/transaction.json",
      detail: `Context transaction recovery is required before capsule update: ${transaction.detail}`,
    }]);
  }

  let previousLock: ContextCapsuleLockV3;
  let previousCapsule: BuiltContextCapsule;
  try {
    previousLock = decodeContextCapsuleLock(projectFiles.lock);
    previousCapsule = await readContextCapsuleFile(
      path.join(projectFiles.projectRoot, CONTEXT_CAPSULE_PATH),
    );
  } catch (error) {
    return blockedPlan(projectFiles.projectRoot, [{
      targetPath: CONTEXT_LOCK_PATH,
      detail: error instanceof Error ? error.message : String(error),
    }]);
  }

  const installation = await verifyContextCapsuleV3Installation(
    previousCapsule,
    projectFiles.projectRoot,
  );
  if (!installation.ok) {
    return blockedPlan(
      projectFiles.projectRoot,
      installation.mismatches.map((mismatch) => ({
        targetPath: mismatch.targetPath ?? mismatch.identity,
        detail: mismatch.detail,
      })),
      previousCapsule,
      previousLock,
    );
  }
  const currentMaterialization = await planContextCapsuleMaterialization(
    previousCapsule,
    projectFiles.projectRoot,
    previousLock,
  );
  if (currentMaterialization.status !== "current") {
    return blockedPlan(
      projectFiles.projectRoot,
      currentMaterialization.status === "blocked"
        ? currentMaterialization.conflicts
        : [{
            targetPath: ".agent-context/materialization.json",
            detail: "Materialize the current capsule before planning an update.",
          }],
      previousCapsule,
      previousLock,
    );
  }

  const nextCapsule = await buildContextCapsuleForProject(
    frameworkRoot,
    projectFiles.projectRoot,
    frameworkRevision,
  );
  const activationPlan = await planActivationUpdate(
    frameworkRoot,
    projectFiles.projectRoot,
    projectFiles.config,
    previousCapsule,
    previousLock,
    nextCapsule,
  );
  if (activationPlan.status === "blocked") {
    return blockedPlan(
      projectFiles.projectRoot,
      activationPlan.conflicts.map(assessmentConflict),
      previousCapsule,
      previousLock,
      nextCapsule,
    );
  }
  const locallyModified = activationPlan.assessments.filter((assessment) =>
    assessment.status === "locally-modified" || assessment.status === "diverged");
  if (locallyModified.length > 0) {
    return blockedPlan(
      projectFiles.projectRoot,
      locallyModified.map(assessmentConflict),
      previousCapsule,
      previousLock,
      nextCapsule,
    );
  }

  const activation = activationPlan.nextLock.artifacts.map(toActivation);
  const nextLock = createContextCapsuleLock(
    nextCapsule,
    activation,
    contextCapsuleMaterializationActivation(nextCapsule),
  );
  const mutations: ContextMutation[] = [
    ...activationPlan.mutations,
    ...(previousCapsule.capsuleSha256 === nextCapsule.capsuleSha256
      ? []
      : [{
          operation: "write" as const,
          targetPath: CONTEXT_CAPSULE_PATH,
          content: nextCapsule.bytes,
        }]),
    ...(serializeJson(previousLock) === serializeJson(nextLock)
      ? []
      : [{
          operation: "write" as const,
          targetPath: CONTEXT_LOCK_PATH,
          content: serializeJson(nextLock),
        }]),
  ];
  return {
    status: mutations.length === 0 ? "current" : "ready",
    projectRoot: projectFiles.projectRoot,
    previousCapsule,
    nextCapsule,
    previousLock,
    nextLock,
    mutations,
    restart: classifyContextCapsuleRestart(previousCapsule, nextCapsule),
    conflicts: [],
  };
}

export async function updateContextCapsuleV3(
  frameworkRoot: string,
  projectRoot: string,
  frameworkRevision: string,
  options: ContextTransactionOptions = {},
): Promise<ContextCapsuleUpdateResult> {
  const plan = await planContextCapsuleV3Update(
    frameworkRoot,
    projectRoot,
    frameworkRevision,
  );
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      projectRoot: plan.projectRoot,
      previousCapsuleSha256: plan.previousCapsule?.capsuleSha256 ?? null,
      nextCapsuleSha256: plan.nextCapsule?.capsuleSha256 ?? null,
      restart: null,
      materialization: null,
      writtenPaths: [],
      conflicts: plan.conflicts,
    };
  }
  if (plan.status === "current") {
    return {
      status: "current",
      projectRoot: plan.projectRoot,
      previousCapsuleSha256: plan.previousCapsule.capsuleSha256,
      nextCapsuleSha256: plan.nextCapsule.capsuleSha256,
      restart: plan.restart,
      materialization: null,
      writtenPaths: [],
      conflicts: [],
    };
  }
  const writtenPaths = await applyContextTransaction(
    plan.projectRoot,
    "capsule",
    plan.nextCapsule.payload.registry.revision,
    plan.mutations,
    options,
  );
  const materialization = await materializeContextCapsule(
    plan.nextCapsule,
    plan.projectRoot,
    { authority: plan.nextLock },
  );
  return {
    status: materialization.status === "blocked" ? "blocked" : "updated",
    projectRoot: plan.projectRoot,
    previousCapsuleSha256: plan.previousCapsule.capsuleSha256,
    nextCapsuleSha256: plan.nextCapsule.capsuleSha256,
    restart: plan.restart,
    materialization,
    writtenPaths,
    conflicts: materialization.status === "blocked"
      ? materialization.conflicts
      : [],
  };
}

async function planActivationUpdate(
  frameworkRoot: string,
  projectRoot: string,
  config: Awaited<ReturnType<typeof readContextCapsuleProjectFiles>>["config"],
  previousCapsule: BuiltContextCapsule,
  previousLock: ContextCapsuleLockV3,
  nextCapsule: BuiltContextCapsule,
) {
  const previousArtifacts = activationArtifacts(previousCapsule);
  const lockedArtifacts: ContextLockedArtifact[] = previousLock.activation.map((record) => {
    const owner = previousArtifacts.get(record.identity);
    if (owner === undefined) {
      throw new Error(`Lock-v3 activation is absent from the previous capsule: ${record.identity}.`);
    }
    return {
      ...owner.artifact,
      component: owner.component,
      installedSha256: record.installedSha256,
    };
  });
  const registry = activationRegistry(nextCapsule);
  const previousInstallation: ContextInstallationLockV2 = {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    registryRevision: previousCapsule.payload.registry.revision,
    components: previousCapsule.payload.selection.resolvedComponents.map((component) => component.name),
    artifacts: lockedArtifacts,
  };
  const sources = new Map<string, string>();
  for (const component of nextCapsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts.filter((candidate) => !isMaterialized(candidate))) {
      sources.set(
        artifact.sourcePath,
        new TextDecoder("utf-8", { fatal: true }).decode(
          contextCapsuleEntryBytes(nextCapsule, artifact.sourcePath),
        ),
      );
    }
  }
  return await planContextInstallation(
    projectRoot,
    frameworkRoot,
    registry,
    config,
    previousInstallation,
    {
      kind: "update",
      mode: "preserve-local",
      components: new Set(nextCapsule.payload.selection.resolvedComponents.map((component) => component.name)),
    },
    sources,
  );
}

function activationRegistry(capsule: BuiltContextCapsule): ContextRegistryV2 {
  return {
    schemaVersion: capsule.payload.registry.schemaVersion,
    revision: capsule.payload.registry.revision,
    decisionPath: capsule.payload.registry.decisionPath,
    components: capsule.payload.selection.resolvedComponents.map((component) => ({
      ...component,
      artifacts: component.artifacts.filter((artifact) => !isMaterialized(artifact)),
    })),
  };
}

function activationArtifacts(capsule: BuiltContextCapsule): ReadonlyMap<
  string,
  { readonly component: string; readonly artifact: ContextRegistryArtifact }
> {
  const artifacts = new Map<
    string,
    { readonly component: string; readonly artifact: ContextRegistryArtifact }
  >();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts.filter((candidate) => !isMaterialized(candidate))) {
      artifacts.set(artifactIdentity(artifact), { component: component.name, artifact });
    }
  }
  return artifacts;
}

function isMaterialized(artifact: ContextRegistryArtifact): boolean {
  return artifact.targetPath.startsWith(".codex/skills/") ||
    artifact.targetPath.startsWith(".agent-context/runtime/");
}

function toActivation(locked: ContextLockedArtifact): ContextCapsuleActivationLock {
  return {
    identity: artifactIdentity(locked),
    targetPath: locked.targetPath,
    installedSha256: locked.installedSha256,
  };
}

function assessmentConflict(assessment: ArtifactAssessment): ContextCapsuleUpdateConflict {
  return { targetPath: assessment.targetPath, detail: assessment.detail };
}

function blockedPlan(
  projectRoot: string,
  conflicts: readonly ContextCapsuleUpdateConflict[],
  previousCapsule: BuiltContextCapsule | null = null,
  previousLock: ContextCapsuleLockV3 | null = null,
  nextCapsule: BuiltContextCapsule | null = null,
): Extract<ContextCapsuleUpdatePlan, { status: "blocked" }> {
  return {
    status: "blocked",
    projectRoot,
    previousCapsule,
    nextCapsule,
    previousLock,
    nextLock: null,
    mutations: [],
    restart: null,
    conflicts,
  };
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
