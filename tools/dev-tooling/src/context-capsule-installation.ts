import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  artifactIdentity,
  decodeContextCapsuleLock,
  decodeContextInstallationLock,
  decodeContextProjectConfig,
  type ContextCapsuleActivationLock,
  type ContextLockedArtifact,
  type ContextRegistryArtifact,
} from "@agent-context/repo-policy";

import { createArtifactProjection } from "./context-artifact-projection.js";
import {
  contextCapsuleEntryBytes,
  type BuiltContextCapsule,
} from "./context-capsule.js";
import {
  CONTEXT_CONFIG_PATH,
  CONTEXT_LOCK_PATH,
} from "./context-installer.js";
import { verifyContextCapsuleLock } from "./context-capsule-lock.js";
import { contextCapsuleMaterializationActivation } from "./context-capsule-materialization.js";

const EXPANDED_SKILL_PREFIX = ".codex/skills/";

export interface ContextCapsuleInstallationMismatch {
  readonly identity: string;
  readonly targetPath: string | null;
  readonly detail: string;
}

export interface ContextCapsuleInstallationVerification {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly registryRevision: string;
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly string[];
  readonly artifactCount: number;
  readonly mismatches: readonly ContextCapsuleInstallationMismatch[];
}

export interface ContextCapsuleV2Installation {
  readonly projectRoot: string;
  readonly config: ReturnType<typeof decodeContextProjectConfig>;
  readonly lock: ReturnType<typeof decodeContextInstallationLock>;
}

export interface ContextCapsuleProjectFiles {
  readonly projectRoot: string;
  readonly config: ReturnType<typeof decodeContextProjectConfig>;
  readonly lock: unknown;
}

export interface ContextCapsuleV3InstallationVerification {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly mismatches: readonly ContextCapsuleInstallationMismatch[];
}

export async function readContextCapsuleProjectFiles(
  projectRootCandidate: string,
): Promise<ContextCapsuleProjectFiles> {
  const projectRoot = await realpath(projectRootCandidate);
  const config = decodeContextProjectConfig(
    await readJsonFile(
      await secureProjectFile(projectRoot, CONTEXT_CONFIG_PATH, "Context project config"),
      "Context project config",
    ),
  );
  const lock = await readJsonFile(
    await secureProjectFile(projectRoot, CONTEXT_LOCK_PATH, "Context installation lock"),
    "Context installation lock",
  );
  return { projectRoot, config, lock };
}

export async function readContextCapsuleV2Installation(
  projectRootCandidate: string,
): Promise<ContextCapsuleV2Installation> {
  const { projectRoot, config, lock: lockValue } = await readContextCapsuleProjectFiles(
    projectRootCandidate,
  );
  const lock = decodeContextInstallationLock(lockValue);
  return { projectRoot, config, lock };
}

export async function verifyContextCapsuleInstallation(
  capsule: BuiltContextCapsule,
  projectRootCandidate: string,
): Promise<ContextCapsuleInstallationVerification> {
  const { projectRoot, config, lock } = await readContextCapsuleV2Installation(
    projectRootCandidate,
  );
  const resolvedComponents = capsule.payload.selection.resolvedComponents.map(
    (component) => component.name,
  );
  const mismatches: ContextCapsuleInstallationMismatch[] = [];
  if (!sameValues(config.components, capsule.payload.selection.directComponents)) {
    mismatches.push({
      identity: "selection:direct",
      targetPath: CONTEXT_CONFIG_PATH,
      detail: "Project direct components differ from the capsule selection.",
    });
  }
  if (lock.registryRevision !== capsule.payload.registry.revision) {
    mismatches.push({
      identity: "registry:revision",
      targetPath: CONTEXT_LOCK_PATH,
      detail: `Project lock registry ${lock.registryRevision} differs from capsule registry ${capsule.payload.registry.revision}.`,
    });
  }
  if (!sameValues(lock.components, resolvedComponents)) {
    mismatches.push({
      identity: "selection:resolved",
      targetPath: CONTEXT_LOCK_PATH,
      detail: "Project resolved components differ from the capsule closure.",
    });
  }

  const capsuleArtifacts = new Map<string, {
    readonly component: string;
    readonly artifact: ContextRegistryArtifact;
  }>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      capsuleArtifacts.set(artifactIdentity(artifact), {
        component: component.name,
        artifact,
      });
    }
  }
  const lockedArtifacts = new Map(
    lock.artifacts.map((artifact) => [artifactIdentity(artifact), artifact]),
  );
  for (const [identity, capsuleArtifact] of capsuleArtifacts) {
    const locked = lockedArtifacts.get(identity);
    if (locked === undefined) {
      mismatches.push({
        identity,
        targetPath: capsuleArtifact.artifact.targetPath,
        detail: "Capsule artifact is missing from the project lock.",
      });
      continue;
    }
    if (
      locked.component !== capsuleArtifact.component ||
      locked.sourcePath !== capsuleArtifact.artifact.sourcePath ||
      locked.sourceSha256 !== capsuleArtifact.artifact.sourceSha256
    ) {
      mismatches.push({
        identity,
        targetPath: locked.targetPath,
        detail: "Project lock artifact provenance differs from the capsule manifest.",
      });
      continue;
    }
    const mismatch = await verifyInstalledArtifact(
      capsule,
      projectRoot,
      locked,
    );
    if (mismatch !== null) mismatches.push(mismatch);
  }
  for (const [identity, locked] of lockedArtifacts) {
    if (!capsuleArtifacts.has(identity)) {
      mismatches.push({
        identity,
        targetPath: locked.targetPath,
        detail: "Project lock contains an artifact absent from the capsule manifest.",
      });
    }
  }
  return {
    ok: mismatches.length === 0,
    projectRoot,
    registryRevision: capsule.payload.registry.revision,
    directComponents: capsule.payload.selection.directComponents,
    resolvedComponents,
    artifactCount: capsuleArtifacts.size,
    mismatches,
  };
}

export async function verifyContextCapsuleV3Installation(
  capsule: BuiltContextCapsule,
  projectRootCandidate: string,
): Promise<ContextCapsuleV3InstallationVerification> {
  const projectFiles = await readContextCapsuleProjectFiles(projectRootCandidate);
  const lock = decodeContextCapsuleLock(projectFiles.lock);
  const materialization = contextCapsuleMaterializationActivation(capsule);
  const mismatches: ContextCapsuleInstallationMismatch[] = verifyContextCapsuleLock(
    lock,
    capsule,
    lock.activation,
    materialization,
  ).mismatches.map((detail) => ({
    identity: "lock:v3",
    targetPath: CONTEXT_LOCK_PATH,
    detail,
  }));
  if (!sameValues(projectFiles.config.components, capsule.payload.selection.directComponents)) {
    mismatches.push({
      identity: "selection:direct",
      targetPath: CONTEXT_CONFIG_PATH,
      detail: "Project direct components differ from the capsule selection.",
    });
  }

  const artifacts = new Map<string, ContextRegistryArtifact>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (
        !artifact.targetPath.startsWith(EXPANDED_SKILL_PREFIX) &&
        !artifact.targetPath.startsWith(".agent-context/runtime/")
      ) {
        artifacts.set(artifactIdentity(artifact), artifact);
      }
    }
  }
  const activation = new Map(lock.activation.map((record) => [record.identity, record]));
  for (const [identity, artifact] of artifacts) {
    const record = activation.get(identity);
    if (record === undefined) {
      mismatches.push({
        identity,
        targetPath: artifact.targetPath,
        detail: "Capsule activation artifact is missing from lock v3.",
      });
      continue;
    }
    if (record.targetPath !== artifact.targetPath) {
      mismatches.push({
        identity,
        targetPath: record.targetPath,
        detail: "Lock-v3 activation target differs from the capsule manifest.",
      });
      continue;
    }
    const mismatch = await verifyInstalledProjection(
      capsule,
      projectFiles.projectRoot,
      record,
      artifact,
    );
    if (mismatch !== null) mismatches.push(mismatch);
  }
  for (const [identity, record] of activation) {
    if (!artifacts.has(identity)) {
      mismatches.push({
        identity,
        targetPath: record.targetPath,
        detail: "Lock v3 contains an activation artifact absent from the capsule manifest.",
      });
    }
  }
  return {
    ok: mismatches.length === 0,
    projectRoot: projectFiles.projectRoot,
    mismatches,
  };
}

async function verifyInstalledArtifact(
  capsule: BuiltContextCapsule,
  projectRoot: string,
  locked: ContextLockedArtifact,
): Promise<ContextCapsuleInstallationMismatch | null> {
  if (locked.operation === "seed-file") {
    try {
      const target = await readOptionalProjectText(projectRoot, locked.targetPath);
      return target === null
        ? {
            identity: artifactIdentity(locked),
            targetPath: locked.targetPath,
            detail: "Installed project-owned seed is missing.",
          }
        : null;
    } catch (error) {
      return {
        identity: artifactIdentity(locked),
        targetPath: locked.targetPath,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return await verifyInstalledProjection(
    capsule,
    projectRoot,
    {
      identity: artifactIdentity(locked),
      targetPath: locked.targetPath,
      installedSha256: locked.installedSha256,
    },
    locked,
  );
}

async function verifyInstalledProjection(
  capsule: BuiltContextCapsule,
  projectRoot: string,
  installed: ContextCapsuleActivationLock,
  artifact: ContextRegistryArtifact,
): Promise<ContextCapsuleInstallationMismatch | null> {
  const identity = installed.identity;
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(
      contextCapsuleEntryBytes(capsule, artifact.sourcePath),
    );
  } catch (error) {
    return {
      identity,
      targetPath: installed.targetPath,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const projection = createArtifactProjection(artifact, source);
  if (
    artifact.operation !== "seed-file" &&
    projection.sourceSha256 !== installed.installedSha256
  ) {
    return {
      identity,
      targetPath: installed.targetPath,
      detail: "Capsule source projects to a different installed hash than the project lock.",
    };
  }
  let target: string | null;
  try {
    target = await readOptionalProjectText(projectRoot, installed.targetPath);
  } catch (error) {
    return {
      identity,
      targetPath: installed.targetPath,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const current = projection.read(target);
  if (current.state !== "present") {
    return {
      identity,
      targetPath: installed.targetPath,
      detail: current.state === "absent" ? "Installed artifact is missing." : current.detail,
    };
  }
  if (current.sha256 !== installed.installedSha256) {
    return {
      identity,
      targetPath: installed.targetPath,
      detail: "Installed artifact scope differs from the capsule and project lock.",
    };
  }
  return null;
}

async function readJsonFile(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(decodeProjectText(await readFile(candidate), label)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON.`, { cause: error });
    throw error;
  }
}

async function readOptionalProjectText(
  projectRoot: string,
  relativePath: string,
): Promise<string | null> {
  const candidate = containedProjectPath(projectRoot, relativePath, `Installed target ${relativePath}`);
  try {
    await requireRegularProjectFile(
      projectRoot,
      candidate,
      `Installed target ${relativePath}`,
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  return decodeProjectText(await readFile(candidate), `Installed target ${relativePath}`);
}

async function secureProjectFile(
  projectRoot: string,
  relativePath: string,
  label: string,
): Promise<string> {
  const candidate = containedProjectPath(projectRoot, relativePath, label);
  await requireRegularProjectFile(projectRoot, candidate, label);
  return candidate;
}

async function requireRegularProjectFile(
  projectRoot: string,
  candidate: string,
  label: string,
): Promise<void> {
  let current = projectRoot;
  for (const segment of path.relative(projectRoot, candidate).split(path.sep)) {
    current = path.join(current, segment);
    const state = await lstat(current);
    if (state.isSymbolicLink()) throw new Error(`${label} traverses symbolic link ${current}.`);
  }
  const state = await lstat(candidate);
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
}

function decodeProjectText(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must contain valid UTF-8.`, { cause: error });
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not begin with a UTF-8 BOM.`);
  return text;
}

function containedProjectPath(root: string, relativePath: string, label: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} escapes the project root.`);
  }
  return candidate;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
