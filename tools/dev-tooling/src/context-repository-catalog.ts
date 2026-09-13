import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile, type BuiltContextCapsule } from "./context-capsule.js";
import { verifyContextCapsuleInstallation } from "./context-capsule-installation.js";
import { planContextCapsuleMaterialization } from "./context-capsule-materialization.js";
import { syncContextCapsule } from "./context-capsule-workflow.js";

export const CONTEXT_REPOSITORY_CATALOG_SCHEMA_VERSION = 1 as const;
export const CONTEXT_REPOSITORY_CATALOG_RELATIVE_PATH = "acf/repositories" as const;

export interface ContextRepositoryRecordV1 {
  readonly schemaVersion: typeof CONTEXT_REPOSITORY_CATALOG_SCHEMA_VERSION;
  readonly id: string;
  readonly root: string;
}

export type ContextRepositoryRegistrationResult = {
  readonly status: "registered" | "current";
  readonly catalogRoot: string;
  readonly record: ContextRepositoryRecordV1;
};

export interface ContextRepositoryForgetResult {
  readonly status: "forgotten" | "absent";
  readonly catalogRoot: string;
  readonly id: string;
}

export type ContextRepositorySyncResult =
  | {
      readonly id: string;
      readonly root: string;
      readonly status: "synced" | "current" | "blocked";
      readonly capsuleSha256: string;
      readonly treeSha256: string;
      readonly changedPathCount: number;
      readonly issues: readonly string[];
    }
  | {
      readonly id: string | null;
      readonly root: string | null;
      readonly recordPath?: string;
      readonly status: "failed";
      readonly issues: readonly [string];
    };

interface ContextRepositoryObservationBase {
  readonly id: string;
  readonly root: string;
  readonly issues: readonly string[];
}

interface LoadedContextRepositoryObservation extends ContextRepositoryObservationBase {
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly frameworkRevision: string;
  readonly registryRevision: string;
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly string[];
  readonly activationCount: number;
  readonly generatedFileCount: number;
}

export type ContextRepositoryObservation =
  | {
      readonly id: string | null;
      readonly root: null;
      readonly recordPath: string;
      readonly status: "invalid";
      readonly issues: readonly [string];
    }
  | (ContextRepositoryObservationBase & { readonly status: "missing" | "invalid" })
  | (LoadedContextRepositoryObservation & {
      readonly status: "repack-required" | "blocked" | "sync-required" | "current";
    });

export function resolveCodexHome(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  userHome: string = os.homedir(),
): string {
  const configured = environment.CODEX_HOME?.trim();
  const candidate = configured && configured.length > 0
    ? configured
    : path.join(userHome, ".codex");
  if (!path.isAbsolute(candidate)) {
    throw new Error("CODEX_HOME must be an absolute path.");
  }
  return path.resolve(candidate);
}

export function resolveContextRepositoryCatalogRoot(codexHome = resolveCodexHome()): string {
  if (!path.isAbsolute(codexHome)) {
    throw new Error("Codex home must be an absolute path.");
  }
  return path.join(path.resolve(codexHome), ...CONTEXT_REPOSITORY_CATALOG_RELATIVE_PATH.split("/"));
}

export async function registerContextRepository(
  projectRootCandidate: string,
  catalogRootCandidate = resolveContextRepositoryCatalogRoot(),
): Promise<ContextRepositoryRegistrationResult> {
  const catalogRoot = await canonicalizeCatalogRoot(catalogRootCandidate);
  const projectRoot = await requireRepositoryRoot(projectRootCandidate, catalogRoot);
  await readContextCapsuleFile(path.join(projectRoot, CONTEXT_CAPSULE_PATH));
  const record = contextRepositoryRecord(projectRoot);
  await mkdir(catalogRoot, { recursive: true });
  const recordPath = contextRepositoryRecordPath(catalogRoot, record.id);
  const content = serializeRecord(record);
  const temporaryPath = path.join(catalogRoot, `.${record.id}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  try {
    try {
      await link(temporaryPath, recordPath);
      return { status: "registered", catalogRoot, record };
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true });
  }
  const existing = await readContextRepositoryRecord(recordPath);
  if (existing.root !== record.root || existing.id !== record.id) {
    throw new Error(`Repository catalog identity collision at ${recordPath}.`);
  }
  return { status: "current", catalogRoot, record: existing };
}

export async function listContextRepositories(
  catalogRootCandidate = resolveContextRepositoryCatalogRoot(),
): Promise<readonly ContextRepositoryRecordV1[]> {
  const catalogRoot = await canonicalizeCatalogRoot(catalogRootCandidate);
  const entries = await readContextRepositoryCatalogEntries(catalogRoot);
  const records: ContextRepositoryRecordV1[] = [];
  for (const entry of entries) {
    if (entry.status === "invalid") throw new Error(entry.issue);
    records.push(entry.record);
  }
  return records;
}

export async function forgetContextRepository(
  id: string,
  catalogRootCandidate = resolveContextRepositoryCatalogRoot(),
): Promise<ContextRepositoryForgetResult> {
  const catalogRoot = await canonicalizeCatalogRoot(catalogRootCandidate);
  requireRepositoryId(id, "Repository selector");
  const recordPath = contextRepositoryRecordPath(catalogRoot, id);
  try {
    await rm(recordPath);
    return { status: "forgotten", catalogRoot, id };
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw error;
    return { status: "absent", catalogRoot, id };
  }
}

export async function inspectContextRepository(
  record: ContextRepositoryRecordV1,
  expectedRegistryRevision?: string,
): Promise<ContextRepositoryObservation> {
  try {
    const state = await lstat(record.root);
    if (!state.isDirectory() || state.isSymbolicLink()) {
      return unavailable(record, "missing", "Registered repository root is not a real directory.");
    }
  } catch (error) {
    return isErrorCode(error, "ENOENT")
      ? unavailable(record, "missing", "Registered repository root does not exist.")
      : unavailable(record, "invalid", errorMessage(error));
  }

  let capsule: BuiltContextCapsule;
  try {
    capsule = await readContextCapsuleFile(path.join(record.root, CONTEXT_CAPSULE_PATH));
  } catch (error) {
    return unavailable(record, "invalid", errorMessage(error));
  }

  const base = loadedObservation(record, capsule);
  if (
    expectedRegistryRevision !== undefined &&
    capsule.payload.registry.revision !== expectedRegistryRevision
  ) {
    return {
      ...base,
      status: "repack-required",
      issues: [
        `Capsule registry ${capsule.payload.registry.revision} differs from manager registry ${expectedRegistryRevision}.`,
      ],
    };
  }
  try {
    const activation = await verifyContextCapsuleInstallation(capsule, record.root);
    if (!activation.ok) {
      return {
        ...base,
        status: "repack-required",
        issues: activation.mismatches.map((mismatch) =>
          `${mismatch.targetPath ?? mismatch.identity}: ${mismatch.detail}`),
      };
    }
    const materialization = await planContextCapsuleMaterialization(capsule, record.root);
    if (materialization.status === "blocked") {
      return {
        ...base,
        status: "blocked",
        generatedFileCount: materialization.receipt.files.length,
        issues: materialization.conflicts.map((conflict) =>
          `${conflict.targetPath}: ${conflict.detail}`),
      };
    }
    return {
      ...base,
      status: materialization.status === "ready" ? "sync-required" : "current",
      generatedFileCount: materialization.receipt.files.length,
      issues: [],
    };
  } catch (error) {
    return { ...base, status: "blocked", issues: [errorMessage(error)] };
  }
}

export async function inspectContextRepositories(
  catalogRootCandidate = resolveContextRepositoryCatalogRoot(),
  expectedRegistryRevision?: string,
): Promise<readonly ContextRepositoryObservation[]> {
  const catalogRoot = await canonicalizeCatalogRoot(catalogRootCandidate);
  const entries = await readContextRepositoryCatalogEntries(catalogRoot);
  const observations: ContextRepositoryObservation[] = [];
  for (const entry of entries) {
    if (entry.status === "invalid") {
      observations.push({
        id: entry.id,
        root: null,
        recordPath: entry.recordPath,
        status: "invalid",
        issues: [entry.issue],
      });
    } else {
      observations.push(await inspectContextRepository(entry.record, expectedRegistryRevision));
    }
  }
  return observations;
}

export async function syncContextRepositories(
  catalogRootCandidate = resolveContextRepositoryCatalogRoot(),
): Promise<readonly ContextRepositorySyncResult[]> {
  const catalogRoot = await canonicalizeCatalogRoot(catalogRootCandidate);
  const entries = await readContextRepositoryCatalogEntries(catalogRoot);
  const results: ContextRepositorySyncResult[] = [];
  for (const entry of entries) {
    if (entry.status === "invalid") {
      results.push({
        id: entry.id,
        root: null,
        recordPath: entry.recordPath,
        status: "failed",
        issues: [entry.issue],
      });
      continue;
    }
    const record = entry.record;
    try {
      const result = await syncContextCapsule(record.root);
      results.push({
        id: record.id,
        root: record.root,
        status: result.status,
        capsuleSha256: result.capsuleSha256,
        treeSha256: result.treeSha256,
        changedPathCount: result.materialization?.writtenPaths.length ?? 0,
        issues: result.conflicts.map((conflict) =>
          `${conflict.targetPath}: ${conflict.detail}`),
      });
    } catch (error) {
      results.push({ id: record.id, root: record.root, status: "failed", issues: [errorMessage(error)] });
    }
  }
  return results;
}

export function decodeContextRepositoryRecord(
  value: unknown,
  label = "Repository catalog record",
): ContextRepositoryRecordV1 {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["id", "root", "schemaVersion"])) {
    throw new Error(`${label} must contain only schemaVersion, id, and root.`);
  }
  if (value.schemaVersion !== CONTEXT_REPOSITORY_CATALOG_SCHEMA_VERSION) {
    throw new Error(`${label} uses an unsupported schema version.`);
  }
  const root = requireAbsoluteRoot(value.root, `${label} root`);
  const id = requireRepositoryId(value.id, `${label} id`);
  if (repositoryId(root) !== id) {
    throw new Error(`${label} id does not match its repository root.`);
  }
  return { schemaVersion: CONTEXT_REPOSITORY_CATALOG_SCHEMA_VERSION, id, root };
}

function contextRepositoryRecord(projectRoot: string): ContextRepositoryRecordV1 {
  return {
    schemaVersion: CONTEXT_REPOSITORY_CATALOG_SCHEMA_VERSION,
    id: repositoryId(projectRoot),
    root: projectRoot,
  };
}

function loadedObservation(
  record: ContextRepositoryRecordV1,
  capsule: BuiltContextCapsule,
): LoadedContextRepositoryObservation {
  return {
    id: record.id,
    root: record.root,
    capsuleSha256: capsule.capsuleSha256,
    treeSha256: capsule.treeSha256,
    frameworkRevision: capsule.payload.frameworkRevision,
    registryRevision: capsule.payload.registry.revision,
    directComponents: capsule.payload.selection.directComponents,
    resolvedComponents: capsule.payload.selection.resolvedComponents.map((component) => component.name),
    activationCount: capsule.payload.activation.length,
    generatedFileCount: 0,
    issues: [],
  };
}

function unavailable(
  record: ContextRepositoryRecordV1,
  status: "missing" | "invalid",
  issue: string,
): ContextRepositoryObservation {
  return { id: record.id, root: record.root, status, issues: [issue] };
}

async function requireRepositoryRoot(candidate: string, catalogRoot: string): Promise<string> {
  const root = await realpath(candidate);
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new Error("Repository root must be a real directory.");
  }
  const resolvedRoot = path.resolve(root);
  if (path.dirname(resolvedRoot) === resolvedRoot || samePath(resolvedRoot, os.homedir())) {
    throw new Error("Repository root cannot be a filesystem root or the user home directory.");
  }
  if (containsPath(resolvedRoot, catalogRoot) || containsPath(catalogRoot, resolvedRoot)) {
    throw new Error("Repository root and the global ACF catalog must not contain one another.");
  }
  return resolvedRoot;
}

function repositoryId(root: string): string {
  const normalized = process.platform === "win32" ? root.toLowerCase() : root;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function contextRepositoryRecordPath(catalogRoot: string, id: string): string {
  requireRepositoryId(id, "Repository id");
  return path.join(catalogRoot, `${id}.json`);
}

function requireRepositoryId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 value.`);
  }
  return value;
}

function requireAbsoluteRoot(value: unknown, label: string): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function serializeRecord(record: ContextRepositoryRecordV1): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

async function readContextRepositoryRecord(recordPath: string): Promise<ContextRepositoryRecordV1> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(recordPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Repository catalog record contains invalid JSON: ${recordPath}.`, { cause: error });
    }
    throw error;
  }
  return decodeContextRepositoryRecord(value, recordPath);
}

type ContextRepositoryCatalogEntry =
  | { readonly status: "valid"; readonly record: ContextRepositoryRecordV1 }
  | {
      readonly status: "invalid";
      readonly id: string | null;
      readonly recordPath: string;
      readonly issue: string;
    };

async function readContextRepositoryCatalogEntries(
  catalogRoot: string,
): Promise<readonly ContextRepositoryCatalogEntry[]> {
  let directoryEntries;
  try {
    directoryEntries = await readdir(catalogRoot, { withFileTypes: true });
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return [];
    throw error;
  }
  const entries: ContextRepositoryCatalogEntry[] = [];
  for (const directoryEntry of directoryEntries.sort((left, right) =>
    left.name.localeCompare(right.name))) {
    if (!directoryEntry.isFile() || !directoryEntry.name.endsWith(".json")) continue;
    const recordPath = path.join(catalogRoot, directoryEntry.name);
    const filenameId = directoryEntry.name.slice(0, -".json".length);
    try {
      const record = await readContextRepositoryRecord(recordPath);
      if (directoryEntry.name !== `${record.id}.json`) {
        throw new Error(`Repository catalog filename does not match its identity: ${recordPath}.`);
      }
      entries.push({ status: "valid", record });
    } catch (error) {
      entries.push({
        status: "invalid",
        id: /^[a-f0-9]{64}$/u.test(filenameId) ? filenameId : null,
        recordPath,
        issue: errorMessage(error),
      });
    }
  }
  return entries;
}

async function canonicalizeCatalogRoot(candidate: string): Promise<string> {
  let existingAncestor = path.resolve(candidate);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonicalAncestor = await realpath(existingAncestor);
      return path.join(canonicalAncestor, ...missingSegments.reverse());
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      missingSegments.push(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(normalizeComparablePath(parent), normalizeComparablePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

function normalizeComparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
