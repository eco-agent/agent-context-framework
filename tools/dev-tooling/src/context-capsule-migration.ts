import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  artifactIdentity,
  decodeContextCapsuleLock,
  type ContextCapsuleActivationLock,
  type ContextCapsuleLockV3,
  type ContextLockedArtifact,
} from "@agent-context/repo-policy";

import type { BuiltContextCapsule } from "./context-capsule.js";
import {
  readContextCapsuleProjectFiles,
  readContextCapsuleV2Installation,
  verifyContextCapsuleInstallation,
} from "./context-capsule-installation.js";
import {
  createContextCapsuleLock,
  verifyContextCapsuleLock,
} from "./context-capsule-lock.js";
import {
  contextCapsuleSkillActivation,
  planContextCapsuleSkillMaterialization,
} from "./context-capsule-materialization.js";
import { CONTEXT_LOCK_PATH } from "./context-installer.js";
import {
  applyContextTransaction,
  inspectContextTransaction,
  type ContextMutation,
  type ContextTransactionOptions,
} from "./context-transaction.js";

const EXPANDED_SKILL_PREFIX = ".codex/skills/";

export interface ContextCapsuleMigrationConflict {
  readonly identity: string;
  readonly targetPath: string;
  readonly detail: string;
}

export type ContextCapsuleMigrationPlan =
  | {
      readonly status: "ready";
      readonly projectRoot: string;
      readonly nextLock: ContextCapsuleLockV3;
      readonly removedPaths: readonly string[];
      readonly mutations: readonly ContextMutation[];
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "current";
      readonly projectRoot: string;
      readonly nextLock: ContextCapsuleLockV3;
      readonly removedPaths: readonly [];
      readonly mutations: readonly [];
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "blocked";
      readonly projectRoot: string;
      readonly nextLock: null;
      readonly removedPaths: readonly [];
      readonly mutations: readonly [];
      readonly conflicts: readonly ContextCapsuleMigrationConflict[];
    };

export interface ContextCapsuleMigrationResult {
  readonly status: "migrated" | "current" | "blocked";
  readonly projectRoot: string;
  readonly nextLock: ContextCapsuleLockV3 | null;
  readonly removedPaths: readonly string[];
  readonly writtenPaths: readonly string[];
  readonly conflicts: readonly ContextCapsuleMigrationConflict[];
}

export async function planContextCapsuleV2Migration(
  capsule: BuiltContextCapsule,
  projectRootCandidate: string,
): Promise<ContextCapsuleMigrationPlan> {
  const projectFiles = await readContextCapsuleProjectFiles(projectRootCandidate);
  if (lockSchemaVersion(projectFiles.lock) === 3) {
    return await planCurrentMigration(capsule, projectFiles.projectRoot, projectFiles.config.components, projectFiles.lock);
  }
  const installation = await readContextCapsuleV2Installation(projectRootCandidate);
  const transaction = await inspectContextTransaction(installation.projectRoot);
  if (transaction.status !== "none") {
    return blockedPlan(installation.projectRoot, [{
      identity: "transaction:context",
      targetPath: ".agent-context/transaction.json",
      detail: `Context transaction recovery is required before migration: ${transaction.detail}`,
    }]);
  }
  const verification = await verifyContextCapsuleInstallation(
    capsule,
    installation.projectRoot,
  );
  if (!verification.ok) {
    return blockedPlan(installation.projectRoot, verification.mismatches.map((mismatch) => ({
      identity: mismatch.identity,
      targetPath: mismatch.targetPath ?? CONTEXT_LOCK_PATH,
      detail: mismatch.detail,
    })));
  }
  const materialization = await planContextCapsuleSkillMaterialization(
    capsule,
    installation.projectRoot,
  );
  if (materialization.status !== "current") {
    const conflicts = materialization.status === "blocked"
      ? materialization.conflicts.map((conflict) => ({
          identity: "materialization:generated",
          targetPath: conflict.targetPath,
          detail: conflict.detail,
        }))
      : [{
          identity: "materialization:missing",
          targetPath: ".agents/skills",
          detail: "Run node .agent-context/bootstrap.mjs materialize before migration.",
        }];
    return blockedPlan(installation.projectRoot, conflicts);
  }

  const materialized = contextCapsuleSkillActivation(capsule);
  const materializedByIdentity = new Map(materialized.map((record) => [record.identity, record]));
  const expandedSkills = installation.lock.artifacts.filter(isExpandedSkillArtifact);
  const invalidSkill = expandedSkills.find((locked) => !materializedByIdentity.has(artifactIdentity(locked)));
  if (invalidSkill !== undefined || expandedSkills.length !== materialized.length) {
    return blockedPlan(installation.projectRoot, [{
      identity: invalidSkill === undefined ? "materialization:scope" : artifactIdentity(invalidSkill),
      targetPath: invalidSkill?.targetPath ?? ".agents/skills",
      detail: "The v2 skill ownership does not match the capsule materialization scope.",
    }]);
  }

  const activation = installation.lock.artifacts
    .filter((locked) => !isExpandedSkillArtifact(locked))
    .map(toActivation);
  const nextLock = createContextCapsuleLock(capsule, activation, materialized);
  const removedPaths = expandedSkills.map((locked) => locked.targetPath).sort(compareStrings);
  const mutations: ContextMutation[] = [
    {
      operation: "write",
      targetPath: CONTEXT_LOCK_PATH,
      content: serializeJson(nextLock),
    },
    ...removedPaths.map((targetPath) => ({ operation: "delete" as const, targetPath })),
  ];
  return {
    status: "ready",
    projectRoot: installation.projectRoot,
    nextLock,
    removedPaths,
    mutations,
    conflicts: [],
  };
}

export async function migrateContextCapsuleV2(
  capsule: BuiltContextCapsule,
  projectRoot: string,
  options: ContextTransactionOptions = {},
): Promise<ContextCapsuleMigrationResult> {
  const plan = await planContextCapsuleV2Migration(capsule, projectRoot);
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      projectRoot: plan.projectRoot,
      nextLock: null,
      removedPaths: [],
      writtenPaths: [],
      conflicts: plan.conflicts,
    };
  }
  if (plan.status === "current") {
    return {
      status: "current",
      projectRoot: plan.projectRoot,
      nextLock: plan.nextLock,
      removedPaths: [],
      writtenPaths: [],
      conflicts: [],
    };
  }
  const writtenPaths = await applyContextTransaction(
    plan.projectRoot,
    "capsule",
    capsule.payload.registry.revision,
    plan.mutations,
    options,
  );
  return {
    status: "migrated",
    projectRoot: plan.projectRoot,
    nextLock: plan.nextLock,
    removedPaths: plan.removedPaths,
    writtenPaths,
    conflicts: [],
  };
}

async function planCurrentMigration(
  capsule: BuiltContextCapsule,
  projectRoot: string,
  directComponents: readonly string[],
  lockValue: unknown,
): Promise<ContextCapsuleMigrationPlan> {
  const lock = decodeContextCapsuleLock(lockValue);
  const materialized = contextCapsuleSkillActivation(capsule);
  const verification = verifyContextCapsuleLock(
    lock,
    capsule,
    lock.activation,
    materialized,
  );
  const conflicts: ContextCapsuleMigrationConflict[] = verification.mismatches.map((detail) => ({
    identity: "lock:v3",
    targetPath: CONTEXT_LOCK_PATH,
    detail,
  }));
  if (!sameValues(directComponents, capsule.payload.selection.directComponents)) {
    conflicts.push({
      identity: "selection:direct",
      targetPath: ".agent-context/config.json",
      detail: "Project direct components differ from the capsule selection.",
    });
  }
  const materialization = await planContextCapsuleSkillMaterialization(capsule, projectRoot);
  if (materialization.status !== "current") {
    conflicts.push(...(materialization.status === "blocked"
      ? materialization.conflicts.map((conflict) => ({
          identity: "materialization:generated",
          targetPath: conflict.targetPath,
          detail: conflict.detail,
        }))
      : [{
          identity: "materialization:missing",
          targetPath: ".agents/skills",
          detail: "Run node .agent-context/bootstrap.mjs materialize before migration verification.",
        }]));
  }
  for (const targetPath of expandedSkillTargets(capsule)) {
    if (await pathExists(path.resolve(projectRoot, targetPath))) {
      conflicts.push({
        identity: `expanded:${targetPath}`,
        targetPath,
        detail: "Expanded skill output remains after lock-v3 migration.",
      });
    }
  }
  return conflicts.length > 0
    ? blockedPlan(projectRoot, conflicts)
    : {
        status: "current",
        projectRoot,
        nextLock: lock,
        removedPaths: [],
        mutations: [],
        conflicts: [],
      };
}

function isExpandedSkillArtifact(locked: ContextLockedArtifact): boolean {
  return locked.operation === "file" && locked.targetPath.startsWith(EXPANDED_SKILL_PREFIX);
}

function toActivation(locked: ContextLockedArtifact): ContextCapsuleActivationLock {
  return {
    identity: artifactIdentity(locked),
    targetPath: locked.targetPath,
    installedSha256: locked.installedSha256,
  };
}

function blockedPlan(
  projectRoot: string,
  conflicts: readonly ContextCapsuleMigrationConflict[],
): ContextCapsuleMigrationPlan {
  return {
    status: "blocked",
    projectRoot,
    nextLock: null,
    removedPaths: [],
    mutations: [],
    conflicts,
  };
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lockSchemaVersion(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value)) return null;
  return typeof value.schemaVersion === "number" ? value.schemaVersion : null;
}

function expandedSkillTargets(capsule: BuiltContextCapsule): readonly string[] {
  return capsule.payload.selection.resolvedComponents.flatMap((component) =>
    component.artifacts.filter((artifact) => artifact.targetPath.startsWith(EXPANDED_SKILL_PREFIX))
      .map((artifact) => artifact.targetPath));
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
