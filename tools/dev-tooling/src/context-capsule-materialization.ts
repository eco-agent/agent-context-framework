import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { artifactIdentity } from "@agent-context/repo-policy";

import {
  contextCapsuleEntryBytes,
  type BuiltContextCapsule,
} from "./context-capsule.js";
import {
  applyContextTransaction,
  type ContextMutation,
} from "./context-transaction.js";

export const CONTEXT_MATERIALIZATION_PATH = ".agent-context/materialization.json";
export const CONTEXT_MATERIALIZATION_SCHEMA_VERSION = 1 as const;
export const CONTEXT_MATERIALIZATION_KIND = "agent-context-materialization" as const;

const EXPANDED_SKILL_PREFIX = ".codex/skills/";
const MATERIALIZED_SKILL_PREFIX = ".agents/skills/";

export interface ContextMaterializedFileV1 {
  readonly component: string;
  readonly identity: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ContextMaterializationReceiptV1 {
  readonly schemaVersion: typeof CONTEXT_MATERIALIZATION_SCHEMA_VERSION;
  readonly kind: typeof CONTEXT_MATERIALIZATION_KIND;
  readonly registryRevision: string;
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly files: readonly ContextMaterializedFileV1[];
}

export interface ContextMaterializationConflict {
  readonly targetPath: string;
  readonly detail: string;
}

export type ContextMaterializationPlan =
  | {
      readonly status: "ready";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV1;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "current";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV1;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "blocked";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV1;
      readonly conflicts: readonly ContextMaterializationConflict[];
    };

export interface ContextMaterializationResult {
  readonly status: "materialized" | "current" | "blocked";
  readonly projectRoot: string;
  readonly receipt: ContextMaterializationReceiptV1;
  readonly conflicts: readonly ContextMaterializationConflict[];
  readonly writtenPaths: readonly string[];
}

interface DesiredMaterializedFile {
  readonly receipt: ContextMaterializedFileV1;
  readonly content: Buffer;
}

export async function planContextCapsuleSkillMaterialization(
  capsule: BuiltContextCapsule,
  projectRoot: string,
): Promise<ContextMaterializationPlan> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const desiredFiles = desiredSkillFiles(capsule);
  const desiredReceipt = createReceipt(capsule, desiredFiles.map((file) => file.receipt));
  const storedReceipt = await readStoredReceipt(resolvedProjectRoot);

  if (storedReceipt.status === "invalid") {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      conflicts: [{ targetPath: CONTEXT_MATERIALIZATION_PATH, detail: storedReceipt.detail }],
    };
  }

  if (storedReceipt.receipt === null) {
    const conflicts = await findUnexpectedDesiredTargets(resolvedProjectRoot, desiredReceipt.files);
    return conflicts.length === 0
      ? {
          status: "ready",
          projectRoot: resolvedProjectRoot,
          receipt: desiredReceipt,
          conflicts: [],
        }
      : {
          status: "blocked",
          projectRoot: resolvedProjectRoot,
          receipt: desiredReceipt,
          conflicts,
        };
  }

  const storedConflicts = await verifyReceiptFiles(resolvedProjectRoot, storedReceipt.receipt);
  if (storedConflicts.length > 0) {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      conflicts: storedConflicts,
    };
  }
  if (serializeReceipt(storedReceipt.receipt) !== serializeReceipt(desiredReceipt)) {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      conflicts: [{
        targetPath: CONTEXT_MATERIALIZATION_PATH,
        detail:
          "The existing generated files are valid for a different capsule. This checkpoint does not replace a valid materialization.",
      }],
    };
  }
  return {
    status: "current",
    projectRoot: resolvedProjectRoot,
    receipt: desiredReceipt,
    conflicts: [],
  };
}

export async function materializeContextCapsuleSkills(
  capsule: BuiltContextCapsule,
  projectRoot: string,
): Promise<ContextMaterializationResult> {
  const plan = await planContextCapsuleSkillMaterialization(capsule, projectRoot);
  if (plan.status === "blocked") {
    return { ...plan, status: "blocked", writtenPaths: [] };
  }
  if (plan.status === "current") {
    return { ...plan, status: "current", writtenPaths: [] };
  }

  const desiredFiles = desiredSkillFiles(capsule);
  const mutations: ContextMutation[] = [
    ...desiredFiles.map((file) => ({
      operation: "write" as const,
      targetPath: file.receipt.targetPath,
      content: file.content,
    })),
    {
      operation: "write",
      targetPath: CONTEXT_MATERIALIZATION_PATH,
      content: serializeReceipt(plan.receipt),
    },
  ];
  const writtenPaths = await applyContextTransaction(
    plan.projectRoot,
    "capsule",
    capsule.payload.registry.revision,
    mutations,
  );
  const verified = await planContextCapsuleSkillMaterialization(capsule, plan.projectRoot);
  if (verified.status !== "current") {
    throw new Error("Context capsule materialization did not verify after publication.");
  }
  return {
    status: "materialized",
    projectRoot: plan.projectRoot,
    receipt: plan.receipt,
    conflicts: [],
    writtenPaths,
  };
}

export function decodeContextMaterializationReceipt(
  value: unknown,
): ContextMaterializationReceiptV1 {
  const record = requiredRecord(value, "Context materialization receipt");
  requireKeys(record, [
    "schemaVersion",
    "kind",
    "registryRevision",
    "capsuleSha256",
    "treeSha256",
    "files",
  ], "Context materialization receipt");
  if (record.schemaVersion !== CONTEXT_MATERIALIZATION_SCHEMA_VERSION) {
    throw new Error("Context materialization receipt schemaVersion must be 1.");
  }
  if (record.kind !== CONTEXT_MATERIALIZATION_KIND) {
    throw new Error(`Context materialization receipt kind must be ${CONTEXT_MATERIALIZATION_KIND}.`);
  }
  const files = requiredArray(record.files, "Context materialization receipt files").map(
    (file, index) => decodeMaterializedFile(file, index),
  );
  const sorted = [...files].sort((left, right) => compareStrings(left.targetPath, right.targetPath));
  if (files.some((file, index) => file.targetPath !== sorted[index]?.targetPath)) {
    throw new Error("Context materialization receipt files must be sorted by targetPath.");
  }
  if (new Set(files.map((file) => file.targetPath)).size !== files.length) {
    throw new Error("Context materialization receipt target paths must be unique.");
  }
  if (files.length === 0) {
    throw new Error("Context materialization receipt must contain at least one file.");
  }
  return {
    schemaVersion: CONTEXT_MATERIALIZATION_SCHEMA_VERSION,
    kind: CONTEXT_MATERIALIZATION_KIND,
    registryRevision: requiredString(record.registryRevision, "registryRevision"),
    capsuleSha256: requiredSha256(record.capsuleSha256, "capsuleSha256"),
    treeSha256: requiredSha256(record.treeSha256, "treeSha256"),
    files,
  };
}

function desiredSkillFiles(capsule: BuiltContextCapsule): readonly DesiredMaterializedFile[] {
  const files: DesiredMaterializedFile[] = [];
  const targets = new Set<string>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (!artifact.targetPath.startsWith(EXPANDED_SKILL_PREFIX)) continue;
      if (artifact.operation !== "file") {
        throw new Error(
          `Context capsule skill artifact ${artifact.targetPath} must use the file operation.`,
        );
      }
      const suffix = artifact.targetPath.slice(EXPANDED_SKILL_PREFIX.length);
      const targetPath = `${MATERIALIZED_SKILL_PREFIX}${suffix}`;
      requireMaterializedTargetPath(targetPath);
      if (targets.has(targetPath)) {
        throw new Error(`Context capsule resolves duplicate materialized target ${targetPath}.`);
      }
      targets.add(targetPath);
      const content = contextCapsuleEntryBytes(capsule, artifact.sourcePath);
      if (sha256(content) !== artifact.sourceSha256) {
        throw new Error(`Context capsule materialization source drifted for ${artifact.sourcePath}.`);
      }
      files.push({
        content,
        receipt: {
          component: component.name,
          identity: artifactIdentity(artifact),
          sourcePath: artifact.sourcePath,
          targetPath,
          sha256: artifact.sourceSha256,
          bytes: content.length,
        },
      });
    }
  }
  files.sort((left, right) => compareStrings(left.receipt.targetPath, right.receipt.targetPath));
  if (files.length === 0) {
    throw new Error("Context capsule selects no materializable skill files.");
  }
  return files;
}

function createReceipt(
  capsule: BuiltContextCapsule,
  files: readonly ContextMaterializedFileV1[],
): ContextMaterializationReceiptV1 {
  return decodeContextMaterializationReceipt({
    schemaVersion: CONTEXT_MATERIALIZATION_SCHEMA_VERSION,
    kind: CONTEXT_MATERIALIZATION_KIND,
    registryRevision: capsule.payload.registry.revision,
    capsuleSha256: capsule.capsuleSha256,
    treeSha256: capsule.treeSha256,
    files,
  });
}

async function readStoredReceipt(projectRoot: string): Promise<
  | { readonly status: "valid"; readonly receipt: ContextMaterializationReceiptV1 | null }
  | { readonly status: "invalid"; readonly receipt: null; readonly detail: string }
> {
  let bytes: Buffer | null;
  try {
    bytes = await readOptionalProjectFile(projectRoot, CONTEXT_MATERIALIZATION_PATH);
  } catch (error) {
    return { status: "invalid", receipt: null, detail: errorMessage(error) };
  }
  if (bytes === null) return { status: "valid", receipt: null };
  try {
    return {
      status: "valid",
      receipt: decodeContextMaterializationReceipt(JSON.parse(bytes.toString("utf8")) as unknown),
    };
  } catch (error) {
    return {
      status: "invalid",
      receipt: null,
      detail: `Materialization receipt is invalid: ${errorMessage(error)}`,
    };
  }
}

async function findUnexpectedDesiredTargets(
  projectRoot: string,
  files: readonly ContextMaterializedFileV1[],
): Promise<readonly ContextMaterializationConflict[]> {
  const conflicts: ContextMaterializationConflict[] = [];
  for (const skillRoot of materializedSkillRoots(files)) {
    try {
      if (await projectPathExists(projectRoot, skillRoot)) {
        conflicts.push({
          targetPath: skillRoot,
          detail: "A materialized skill directory exists without an ACF receipt.",
        });
      }
    } catch (error) {
      conflicts.push({ targetPath: skillRoot, detail: errorMessage(error) });
    }
  }
  return conflicts;
}

async function verifyReceiptFiles(
  projectRoot: string,
  receipt: ContextMaterializationReceiptV1,
): Promise<readonly ContextMaterializationConflict[]> {
  const conflicts: ContextMaterializationConflict[] = [];
  for (const file of receipt.files) {
    let bytes: Buffer | null;
    try {
      bytes = await readOptionalProjectFile(projectRoot, file.targetPath);
    } catch (error) {
      conflicts.push({ targetPath: file.targetPath, detail: errorMessage(error) });
      continue;
    }
    if (bytes === null) {
      conflicts.push({ targetPath: file.targetPath, detail: "Generated materialized file is missing." });
    } else if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      conflicts.push({ targetPath: file.targetPath, detail: "Generated materialized file was modified." });
    }
  }
  for (const skillRoot of materializedSkillRoots(receipt.files)) {
    try {
      const actual = await listMaterializedTree(projectRoot, skillRoot);
      const expected = expectedMaterializedTree(receipt.files, skillRoot);
      const unexpected = actual.filter((entry) => !expected.has(entry));
      if (unexpected.length > 0) {
        conflicts.push({
          targetPath: skillRoot,
          detail: `Generated materialized skill contains unexpected path ${unexpected[0]}.`,
        });
      }
    } catch (error) {
      conflicts.push({ targetPath: skillRoot, detail: errorMessage(error) });
    }
  }
  return conflicts;
}

async function projectPathExists(projectRoot: string, relativePath: string): Promise<boolean> {
  portableRelativePath(relativePath, "Materialized project path");
  const absolutePath = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, absolutePath);
  let current = projectRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const state = await lstat(current);
      if (state.isSymbolicLink()) {
        throw new Error(`Materialized project path traverses a symbolic link: ${relativePath}.`);
      }
    } catch (error) {
      if (isMissingPathError(error)) return false;
      throw error;
    }
  }
  return true;
}

async function listMaterializedTree(
  projectRoot: string,
  skillRoot: string,
): Promise<readonly string[]> {
  const absoluteRoot = path.resolve(projectRoot, skillRoot);
  const rootState = await lstat(absoluteRoot);
  if (!rootState.isDirectory() || rootState.isSymbolicLink()) {
    throw new Error(`Materialized skill root must be a regular directory: ${skillRoot}.`);
  }
  const entries: string[] = [];
  async function visit(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Materialized skill contains a symbolic link: ${relativePath}.`);
      }
      if (entry.isDirectory()) {
        entries.push(`${relativePath}/`);
        await visit(path.join(absoluteDirectory, entry.name), relativePath);
      } else if (entry.isFile()) {
        entries.push(relativePath);
      } else {
        throw new Error(`Materialized skill contains an unsupported entry: ${relativePath}.`);
      }
    }
  }
  await visit(absoluteRoot, skillRoot);
  return entries.sort(compareStrings);
}

function expectedMaterializedTree(
  files: readonly ContextMaterializedFileV1[],
  skillRoot: string,
): ReadonlySet<string> {
  const expected = new Set<string>();
  for (const file of files.filter((candidate) => candidate.targetPath.startsWith(`${skillRoot}/`))) {
    expected.add(file.targetPath);
    const segments = file.targetPath.slice(skillRoot.length + 1).split("/");
    for (let index = 1; index < segments.length; index += 1) {
      expected.add(`${skillRoot}/${segments.slice(0, index).join("/")}/`);
    }
  }
  return expected;
}

function materializedSkillRoots(
  files: readonly ContextMaterializedFileV1[],
): readonly string[] {
  return [...new Set(files.map((file) => file.targetPath.split("/").slice(0, 3).join("/")))]
    .sort(compareStrings);
}

async function readOptionalProjectFile(projectRoot: string, relativePath: string): Promise<Buffer | null> {
  portableRelativePath(relativePath, "Materialized project path");
  const absolutePath = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, absolutePath);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Materialized project path escapes the project: ${relativePath}.`);
  }
  let current = projectRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let state;
    try {
      state = await lstat(current);
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw error;
    }
    if (state.isSymbolicLink()) {
      throw new Error(`Materialized project path traverses a symbolic link: ${relativePath}.`);
    }
  }
  const state = await lstat(absolutePath);
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new Error(`Materialized project path must be a regular file: ${relativePath}.`);
  }
  return await readFile(absolutePath);
}

function decodeMaterializedFile(value: unknown, index: number): ContextMaterializedFileV1 {
  const label = `Context materialization receipt files[${index}]`;
  const record = requiredRecord(value, label);
  requireKeys(record, ["component", "identity", "sourcePath", "targetPath", "sha256", "bytes"], label);
  const targetPath = portableRelativePath(record.targetPath, `${label}.targetPath`);
  requireMaterializedTargetPath(targetPath);
  return {
    component: requiredString(record.component, `${label}.component`),
    identity: requiredString(record.identity, `${label}.identity`),
    sourcePath: portableRelativePath(record.sourcePath, `${label}.sourcePath`),
    targetPath,
    sha256: requiredSha256(record.sha256, `${label}.sha256`),
    bytes: requiredNonnegativeSafeInteger(record.bytes, `${label}.bytes`),
  };
}

function requireMaterializedTargetPath(targetPath: string): void {
  if (!targetPath.startsWith(MATERIALIZED_SKILL_PREFIX) || targetPath === MATERIALIZED_SKILL_PREFIX) {
    throw new Error(`Materialized skill target must be below ${MATERIALIZED_SKILL_PREFIX}.`);
  }
}

function serializeReceipt(receipt: ContextMaterializationReceiptV1): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requiredSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requiredNonnegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function portableRelativePath(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  if (
    path.posix.isAbsolute(candidate) ||
    candidate.includes("\\") ||
    candidate.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized relative path.`);
  }
  return candidate;
}

function requireKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const expected = [...keys].sort(compareStrings);
  const actual = Object.keys(record).sort(compareStrings);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
