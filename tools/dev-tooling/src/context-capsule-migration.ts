import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
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
  contextCapsuleMaterializationActivation,
  planContextCapsuleMaterialization,
} from "./context-capsule-materialization.js";
import { CONTEXT_LOCK_PATH } from "./context-installer.js";
import {
  applyContextTransaction,
  inspectContextTransaction,
  type ContextMutation,
  type ContextTransactionOptions,
} from "./context-transaction.js";

const EXPANDED_SKILL_PREFIX = ".codex/skills/";
const CAPSULE_ATTRIBUTES_PATH = ".gitattributes";
const CAPSULE_ATTRIBUTES_RULE = "*.acf binary";

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
  const materialization = await planContextCapsuleMaterialization(
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

  const materialized = contextCapsuleMaterializationActivation(capsule);
  const materializedByIdentity = new Map(materialized.map((record) => [record.identity, record]));
  const expandedMaterialization = installation.lock.artifacts.filter(isMaterializedArtifact);
  const invalidMaterialization = expandedMaterialization.find(
    (locked) => !materializedByIdentity.has(artifactIdentity(locked)),
  );
  if (
    invalidMaterialization !== undefined ||
    expandedMaterialization.length !== materialized.length
  ) {
    return blockedPlan(installation.projectRoot, [{
      identity: invalidMaterialization === undefined
        ? "materialization:scope"
        : artifactIdentity(invalidMaterialization),
      targetPath: invalidMaterialization?.targetPath ?? ".agent-context/materialization.json",
      detail: "The v2 ownership does not match the capsule materialization scope.",
    }]);
  }

  const attributes = await planCapsuleAttributes(installation.projectRoot);
  const activation: ContextCapsuleActivationLock[] = [];
  for (const locked of installation.lock.artifacts.filter(
    (artifact) => !isMaterializedArtifact(artifact),
  )) {
    if (locked.operation === "seed-file") {
      const content = locked.targetPath === CAPSULE_ATTRIBUTES_PATH && attributes !== null
        ? Buffer.from(attributes, "utf8")
        : await readFile(path.resolve(installation.projectRoot, locked.targetPath));
      activation.push({
        ...toActivation(locked),
        installedSha256: createHash("sha256").update(content).digest("hex"),
      });
    } else {
      activation.push(toActivation(locked));
    }
  }
  const nextLock = createContextCapsuleLock(capsule, activation, materialized);
  const removedPaths = expandedMaterialization
    .map((locked) => locked.targetPath)
    .sort(compareStrings);
  const mutations: ContextMutation[] = [
    {
      operation: "write",
      targetPath: CONTEXT_LOCK_PATH,
      content: serializeJson(nextLock),
    },
    ...(attributes === null
      ? []
      : [{
          operation: "write" as const,
          targetPath: CAPSULE_ATTRIBUTES_PATH,
          content: attributes,
        }]),
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
  const materialized = contextCapsuleMaterializationActivation(capsule);
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
  const materialization = await planContextCapsuleMaterialization(capsule, projectRoot);
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
  for (const targetPath of expandedMaterializationTargets(capsule)) {
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

function isMaterializedArtifact(locked: ContextLockedArtifact): boolean {
  return (
    locked.operation === "file" && locked.targetPath.startsWith(EXPANDED_SKILL_PREFIX)
  ) || (
    (locked.operation === "file" || locked.operation === "runtime-workspace") &&
    locked.targetPath.startsWith(".agent-context/runtime/")
  );
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

function expandedMaterializationTargets(capsule: BuiltContextCapsule): readonly string[] {
  return capsule.payload.selection.resolvedComponents.flatMap((component) =>
    component.artifacts.filter((artifact) =>
      artifact.targetPath.startsWith(EXPANDED_SKILL_PREFIX) ||
      artifact.targetPath.startsWith(".agent-context/runtime/"))
      .map((artifact) => artifact.targetPath));
}

async function planCapsuleAttributes(projectRoot: string): Promise<string | null> {
  const target = path.join(projectRoot, CAPSULE_ATTRIBUTES_PATH);
  let current: string;
  try {
    current = await readFile(target, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      current = "";
    } else {
      throw error;
    }
  }
  if (current.split(/\r?\n/u).some((line) => line.trim() === CAPSULE_ATTRIBUTES_RULE)) {
    return null;
  }
  if (current.length === 0) return `${CAPSULE_ATTRIBUTES_RULE}\n`;
  return `${current}${current.endsWith("\n") ? "" : "\n"}${CAPSULE_ATTRIBUTES_RULE}\n`;
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
