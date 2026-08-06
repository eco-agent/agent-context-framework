import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  artifactIdentity,
  CONTEXT_ADAPTER,
  CONTEXT_INSTALLATION_SCHEMA_VERSION,
  decodeContextInstallationLock,
  decodeContextProjectConfig,
  decodeContextRegistry,
  resolveContextComponents,
  type ContextInstallationLockV1,
  type ContextLockedArtifact,
  type ContextProjectConfigV1,
  type ContextRegistryArtifact,
  type ContextRegistryV1,
} from "@agent-context/repo-policy";

import { exists } from "./workspace.js";

export const CONTEXT_CONFIG_PATH = ".agent-context/config.json";
export const CONTEXT_LOCK_PATH = ".agent-context/lock.json";
export const CONTEXT_REGISTRY_PATH = "registry/registry.json";
export const DEFAULT_CONTEXT_COMPONENT = "core";

export type ArtifactAssessmentStatus =
  | "current"
  | "missing"
  | "update"
  | "drift"
  | "unmanaged-conflict"
  | "malformed-section"
  | "stale";

export interface ArtifactAssessment {
  readonly identity: string;
  readonly targetPath: string;
  readonly status: ArtifactAssessmentStatus;
  readonly detail: string;
}

export interface PlannedContextWrite {
  readonly targetPath: string;
  readonly content: string;
}

export interface ReadyInstallationPlan {
  readonly status: "ready";
  readonly assessments: readonly ArtifactAssessment[];
  readonly writes: readonly PlannedContextWrite[];
  readonly nextLock: ContextInstallationLockV1;
  readonly lockChanged: boolean;
}

export interface BlockedInstallationPlan {
  readonly status: "blocked";
  readonly assessments: readonly ArtifactAssessment[];
  readonly conflicts: readonly ArtifactAssessment[];
}

export type ContextInstallationPlan = ReadyInstallationPlan | BlockedInstallationPlan;

export interface ContextOperationResult {
  readonly command: "init" | "add";
  readonly projectRoot: string;
  readonly configWriteRequired: boolean;
  readonly plan: ContextInstallationPlan;
  readonly writtenPaths: readonly string[];
}

export interface ContextDiffResult {
  readonly command: "diff";
  readonly projectRoot: string;
  readonly plan: ContextInstallationPlan;
  readonly current: boolean;
}

interface DesiredArtifact {
  readonly artifact: ContextRegistryArtifact;
  readonly source: string;
  readonly sha256: string;
}

interface SectionLocation {
  readonly innerStart: number;
  readonly innerEnd: number;
}

export async function initProject(
  projectRoot: string,
  frameworkRoot: string,
): Promise<ContextOperationResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const config =
    (await readOptionalConfig(resolvedProjectRoot)) ??
    createContextProjectConfig([DEFAULT_CONTEXT_COMPONENT]);
  const configWriteRequired = !(await exists(path.join(resolvedProjectRoot, CONTEXT_CONFIG_PATH)));
  return await applyDesiredState(
    "init",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    configWriteRequired,
  );
}

export async function addComponent(
  projectRoot: string,
  frameworkRoot: string,
  componentName: string,
): Promise<ContextOperationResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const currentConfig = await readOptionalConfig(resolvedProjectRoot);
  if (!currentConfig) {
    throw new Error(`Project is not initialized: ${CONTEXT_CONFIG_PATH} is missing.`);
  }
  const selected = currentConfig.components.includes(componentName)
    ? currentConfig.components
    : [...currentConfig.components, componentName];
  const config = createContextProjectConfig(selected);
  return await applyDesiredState(
    "add",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    selected !== currentConfig.components,
  );
}

export async function diffProject(
  projectRoot: string,
  frameworkRoot: string,
): Promise<ContextDiffResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const config = await readOptionalConfig(resolvedProjectRoot);
  if (!config) {
    throw new Error(`Project is not initialized: ${CONTEXT_CONFIG_PATH} is missing.`);
  }
  const registry = await loadContextRegistry(frameworkRoot);
  const lock = await readOptionalLock(resolvedProjectRoot);
  const plan = await planContextInstallation(resolvedProjectRoot, frameworkRoot, registry, config, lock);
  return {
    command: "diff",
    projectRoot: resolvedProjectRoot,
    plan,
    current: plan.status === "ready" && plan.writes.length === 0 && !plan.lockChanged,
  };
}

export async function loadContextRegistry(frameworkRoot: string): Promise<ContextRegistryV1> {
  const resolvedFrameworkRoot = await realpath(frameworkRoot);
  const registryPath = await securePath(
    resolvedFrameworkRoot,
    CONTEXT_REGISTRY_PATH,
    "Registry catalog",
  );
  return decodeContextRegistry(await readStrictJson(registryPath, "Context registry"));
}

export async function planContextInstallation(
  projectRoot: string,
  frameworkRoot: string,
  registry: ContextRegistryV1,
  config: ContextProjectConfigV1,
  previousLock: ContextInstallationLockV1 | null,
): Promise<ContextInstallationPlan> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const resolvedFrameworkRoot = await realpath(frameworkRoot);
  const components = resolveContextComponents(registry, config.components);
  const registryArtifacts = components.flatMap((component) => component.artifacts);
  validateTargetOwnership(registryArtifacts);

  const desiredArtifacts: DesiredArtifact[] = [];
  for (const artifact of registryArtifacts) {
    const sourcePath = await securePath(
      resolvedFrameworkRoot,
      artifact.sourcePath,
      `Registry source ${artifact.sourcePath}`,
    );
    const source = await readStrictUtf8(sourcePath, `Registry source ${artifact.sourcePath}`);
    if (artifact.ownership === "managed-section" && !source.endsWith("\n")) {
      throw new Error(`Managed section source ${artifact.sourcePath} must end with a newline.`);
    }
    desiredArtifacts.push({ artifact, source, sha256: contentHash(source) });
  }

  const lockedByIdentity = new Map(
    (previousLock?.artifacts ?? []).map((artifact) => [artifactIdentity(artifact), artifact]),
  );
  const desiredIdentities = new Set(desiredArtifacts.map(({ artifact }) => artifactIdentity(artifact)));
  const assessments: ArtifactAssessment[] = [];
  const virtualTargets = new Map<string, string | null>();
  const originalTargets = new Map<string, string | null>();

  for (const desired of desiredArtifacts) {
    const identity = artifactIdentity(desired.artifact);
    const targetPath = desired.artifact.targetPath;
    const targetAbsolutePath = await securePath(
      resolvedProjectRoot,
      targetPath,
      `Project target ${targetPath}`,
    );
    let target = virtualTargets.get(targetPath);
    if (target === undefined && !virtualTargets.has(targetPath)) {
      target = (await exists(targetAbsolutePath))
        ? await readStrictUtf8(targetAbsolutePath, `Project target ${targetPath}`)
        : null;
      virtualTargets.set(targetPath, target);
      originalTargets.set(targetPath, target);
    }
    const locked = lockedByIdentity.get(identity);
    const result = assessArtifact(desired, locked, target ?? null);
    assessments.push(result.assessment);
    virtualTargets.set(targetPath, result.nextTarget);
  }

  for (const locked of previousLock?.artifacts ?? []) {
    const identity = artifactIdentity(locked);
    if (!desiredIdentities.has(identity)) {
      assessments.push({
        identity,
        targetPath: locked.targetPath,
        status: "stale",
        detail: "The previous lock owns this artifact, but the selected registry no longer does.",
      });
    }
  }

  const conflicts = assessments.filter((assessment) => isConflict(assessment.status));
  if (conflicts.length > 0) {
    return { status: "blocked", assessments, conflicts };
  }

  const writes: PlannedContextWrite[] = [];
  for (const [targetPath, nextTarget] of virtualTargets) {
    const originalTarget = originalTargets.get(targetPath);
    if (nextTarget !== null && nextTarget !== originalTarget) {
      writes.push({ targetPath, content: nextTarget });
    }
  }
  const nextLock: ContextInstallationLockV1 = {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    registryRevision: registry.revision,
    components: components.map((component) => component.name),
    artifacts: desiredArtifacts.map(toLockedArtifact),
  };
  return {
    status: "ready",
    assessments,
    writes,
    nextLock,
    lockChanged: serializeJson(previousLock) !== serializeJson(nextLock),
  };
}

export function createContextProjectConfig(
  components: readonly string[],
): ContextProjectConfigV1 {
  return decodeContextProjectConfig({
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    adapter: CONTEXT_ADAPTER,
    components,
  });
}

export function managedSectionMarkers(sectionId: string): {
  readonly start: string;
  readonly end: string;
} {
  return {
    start: `<!-- agent-context:${sectionId}:start -->`,
    end: `<!-- agent-context:${sectionId}:end -->`,
  };
}

async function applyDesiredState(
  command: "init" | "add",
  projectRoot: string,
  frameworkRoot: string,
  config: ContextProjectConfigV1,
  configWriteRequired: boolean,
): Promise<ContextOperationResult> {
  const registry = await loadContextRegistry(frameworkRoot);
  const previousLock = await readOptionalLock(projectRoot);
  const plan = await planContextInstallation(
    projectRoot,
    frameworkRoot,
    registry,
    config,
    previousLock,
  );
  if (plan.status === "blocked") {
    return { command, projectRoot, configWriteRequired, plan, writtenPaths: [] };
  }

  const writtenPaths: string[] = [];
  for (const write of plan.writes) {
    await atomicProjectWrite(projectRoot, write.targetPath, write.content);
    writtenPaths.push(write.targetPath);
  }
  if (configWriteRequired) {
    await atomicProjectWrite(projectRoot, CONTEXT_CONFIG_PATH, serializeJson(config));
    writtenPaths.push(CONTEXT_CONFIG_PATH);
  }
  if (plan.lockChanged) {
    await atomicProjectWrite(projectRoot, CONTEXT_LOCK_PATH, serializeJson(plan.nextLock));
    writtenPaths.push(CONTEXT_LOCK_PATH);
  }
  return { command, projectRoot, configWriteRequired, plan, writtenPaths };
}

function assessArtifact(
  desired: DesiredArtifact,
  locked: ContextLockedArtifact | undefined,
  target: string | null,
): { readonly assessment: ArtifactAssessment; readonly nextTarget: string | null } {
  const identity = artifactIdentity(desired.artifact);
  const targetPath = desired.artifact.targetPath;
  if (desired.artifact.ownership === "managed-file") {
    if (!locked) {
      if (target !== null) {
        return {
          assessment: {
            identity,
            targetPath,
            status: "unmanaged-conflict",
            detail: "A whole-file target exists without a matching lock entry.",
          },
          nextTarget: target,
        };
      }
      return {
        assessment: {
          identity,
          targetPath,
          status: "missing",
          detail: "The managed file will be created.",
        },
        nextTarget: desired.source,
      };
    }
    if (target === null || contentHash(target) !== locked.sha256) {
      return {
        assessment: {
          identity,
          targetPath,
          status: "drift",
          detail: target === null ? "The previously managed file is missing." : "The managed file was edited locally.",
        },
        nextTarget: target,
      };
    }
    if (desired.sha256 !== locked.sha256) {
      return {
        assessment: {
          identity,
          targetPath,
          status: "update",
          detail: "Registry bytes changed and the installed file is safe to update.",
        },
        nextTarget: desired.source,
      };
    }
    return {
      assessment: { identity, targetPath, status: "current", detail: "Managed bytes are current." },
      nextTarget: target,
    };
  }

  const markers = managedSectionMarkers(desired.artifact.sectionId);
  const section = target === null ? null : locateManagedSection(target, markers.start, markers.end);
  if (!locked) {
    if (section !== null || (target !== null && containsEitherMarker(target, markers))) {
      return {
        assessment: {
          identity,
          targetPath,
          status: "malformed-section",
          detail: "Managed-section markers exist without a matching lock entry.",
        },
        nextTarget: target,
      };
    }
    return {
      assessment: {
        identity,
        targetPath,
        status: "missing",
        detail: "The managed section will be appended without changing existing project text.",
      },
      nextTarget: appendManagedSection(target ?? "", desired.source, markers.start, markers.end),
    };
  }
  if (target === null || section === null) {
    return {
      assessment: {
        identity,
        targetPath,
        status: "malformed-section",
        detail: target === null
          ? "The file containing the previously managed section is missing."
          : "The managed-section markers are missing, duplicated, or malformed.",
      },
      nextTarget: target,
    };
  }
  const installed = target.slice(section.innerStart, section.innerEnd);
  if (contentHash(installed) !== locked.sha256) {
    return {
      assessment: {
        identity,
        targetPath,
        status: "drift",
        detail: "The managed section was edited locally.",
      },
      nextTarget: target,
    };
  }
  if (desired.sha256 !== locked.sha256) {
    return {
      assessment: {
        identity,
        targetPath,
        status: "update",
        detail: "Registry bytes changed and the installed section is safe to update.",
      },
      nextTarget: `${target.slice(0, section.innerStart)}${desired.source}${target.slice(section.innerEnd)}`,
    };
  }
  return {
    assessment: { identity, targetPath, status: "current", detail: "Managed bytes are current." },
    nextTarget: target,
  };
}

function locateManagedSection(target: string, start: string, end: string): SectionLocation | null {
  const startToken = `${start}\n`;
  const firstStart = target.indexOf(startToken);
  if (firstStart < 0 || target.indexOf(startToken, firstStart + startToken.length) >= 0) return null;
  const innerStart = firstStart + startToken.length;
  const firstEnd = target.indexOf(end, innerStart);
  if (firstEnd < 0 || target.indexOf(end, firstEnd + end.length) >= 0) return null;
  if (target.includes(end, 0) && target.indexOf(end) < firstStart) return null;
  return { innerStart, innerEnd: firstEnd };
}

function containsEitherMarker(
  target: string,
  markers: { readonly start: string; readonly end: string },
): boolean {
  return target.includes(markers.start) || target.includes(markers.end);
}

function appendManagedSection(target: string, source: string, start: string, end: string): string {
  const separator = target.length === 0 ? "" : target.endsWith("\n\n") ? "" : target.endsWith("\n") ? "\n" : "\n\n";
  return `${target}${separator}${start}\n${source}${end}\n`;
}

function toLockedArtifact(desired: DesiredArtifact): ContextLockedArtifact {
  return desired.artifact.ownership === "managed-file"
    ? {
        ownership: "managed-file",
        sourcePath: desired.artifact.sourcePath,
        targetPath: desired.artifact.targetPath,
        sha256: desired.sha256,
      }
    : {
        ownership: "managed-section",
        sourcePath: desired.artifact.sourcePath,
        targetPath: desired.artifact.targetPath,
        sectionId: desired.artifact.sectionId,
        sha256: desired.sha256,
      };
}

function validateTargetOwnership(artifacts: readonly ContextRegistryArtifact[]): void {
  const byTarget = new Map<string, ContextRegistryArtifact[]>();
  for (const artifact of artifacts) {
    const current = byTarget.get(artifact.targetPath) ?? [];
    current.push(artifact);
    byTarget.set(artifact.targetPath, current);
  }
  for (const [targetPath, targetArtifacts] of byTarget) {
    if (targetArtifacts.some((artifact) => artifact.ownership === "managed-file") && targetArtifacts.length > 1) {
      throw new Error(`Managed file target ${targetPath} cannot share ownership with another artifact.`);
    }
    const identities = targetArtifacts.map(artifactIdentity);
    if (new Set(identities).size !== identities.length) {
      throw new Error(`Registry resolves duplicate ownership for ${targetPath}.`);
    }
  }
}

function isConflict(status: ArtifactAssessmentStatus): boolean {
  return status === "drift" ||
    status === "unmanaged-conflict" ||
    status === "malformed-section" ||
    status === "stale";
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function serializeJson(value: unknown): string {
  return value === null ? "" : `${JSON.stringify(value, null, 2)}\n`;
}

async function readOptionalConfig(projectRoot: string): Promise<ContextProjectConfigV1 | null> {
  const configPath = await securePath(projectRoot, CONTEXT_CONFIG_PATH, "Context project config");
  return (await exists(configPath))
    ? decodeContextProjectConfig(await readStrictJson(configPath, "Context project config"))
    : null;
}

async function readOptionalLock(projectRoot: string): Promise<ContextInstallationLockV1 | null> {
  const lockPath = await securePath(projectRoot, CONTEXT_LOCK_PATH, "Context installation lock");
  return (await exists(lockPath))
    ? decodeContextInstallationLock(await readStrictJson(lockPath, "Context installation lock"))
    : null;
}

async function readStrictJson(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readStrictUtf8(candidate, label)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON.`, { cause: error });
    throw error;
  }
}

async function readStrictUtf8(candidate: string, label: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must be UTF-8 without a byte-order mark.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8.`, { cause: error });
  }
}

async function atomicProjectWrite(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const targetPath = await securePath(projectRoot, relativePath, `Project write ${relativePath}`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The temporary file either was never created or was already renamed.
    }
    throw error;
  }
}

async function securePath(root: string, relativePath: string, label: string): Promise<string> {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its repository root.`);
  }

  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const state = await lstat(current);
      if (state.isSymbolicLink()) {
        throw new Error(`${label} traverses symbolic link ${current}.`);
      }
    } catch (error) {
      if (isMissingPathError(error)) break;
      throw error;
    }
  }
  return target;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
