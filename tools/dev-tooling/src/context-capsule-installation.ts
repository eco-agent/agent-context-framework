import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  artifactIdentity,
  type ContextCapsuleActivationLock,
  type ContextRegistryArtifact,
} from "@agent-context/repo-policy";

import { createArtifactProjection } from "./context-artifact-projection.js";
import {
  contextCapsuleEntryBytes,
  isContextCapsuleMaterializedArtifact,
  type BuiltContextCapsule,
} from "./context-capsule.js";

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

export async function verifyContextCapsuleInstallation(
  capsule: BuiltContextCapsule,
  projectRootCandidate: string,
): Promise<ContextCapsuleInstallationVerification> {
  const projectRoot = await realpath(projectRootCandidate);
  const resolvedComponents = capsule.payload.selection.resolvedComponents.map(
    (component) => component.name,
  );
  const mismatches: ContextCapsuleInstallationMismatch[] = [];
  const capsuleArtifacts = new Map<string, ContextRegistryArtifact>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (!isContextCapsuleMaterializedArtifact(artifact)) {
        capsuleArtifacts.set(artifactIdentity(artifact), artifact);
      }
    }
  }
  const activation = new Map(
    capsule.payload.activation.map((record) => [record.identity, record]),
  );
  for (const [identity, artifact] of capsuleArtifacts) {
    const installed = activation.get(identity);
    if (installed === undefined) {
      mismatches.push({
        identity,
        targetPath: artifact.targetPath,
        detail: "Tracked artifact is missing from the capsule activation model.",
      });
      continue;
    }
    if (installed.targetPath !== artifact.targetPath) {
      mismatches.push({
        identity,
        targetPath: installed.targetPath,
        detail: "Capsule activation target differs from the artifact target.",
      });
      continue;
    }
    const mismatch = artifact.operation === "seed-file"
      ? await verifyInstalledSeed(projectRoot, installed)
      : await verifyInstalledProjection(
      capsule,
      projectRoot,
      installed,
      artifact,
    );
    if (mismatch !== null) mismatches.push(mismatch);
  }
  for (const [identity, installed] of activation) {
    if (!capsuleArtifacts.has(identity)) {
      mismatches.push({
        identity,
        targetPath: installed.targetPath,
        detail: "Capsule activation contains an artifact absent from the selected closure.",
      });
    }
  }
  return {
    ok: mismatches.length === 0,
    projectRoot,
    registryRevision: capsule.payload.registry.revision,
    directComponents: capsule.payload.selection.directComponents,
    resolvedComponents,
    artifactCount: activation.size,
    mismatches,
  };
}

async function verifyInstalledSeed(
  projectRoot: string,
  installed: ContextCapsuleActivationLock,
): Promise<ContextCapsuleInstallationMismatch | null> {
  try {
    const target = await readOptionalProjectText(projectRoot, installed.targetPath);
    return target === null
      ? {
          identity: installed.identity,
          targetPath: installed.targetPath,
          detail: "Installed project-owned seed is missing.",
        }
      : null;
  } catch (error) {
    return {
      identity: installed.identity,
      targetPath: installed.targetPath,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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
