import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

import { artifactIdentity } from "@agent-context/repo-policy";
import type {
  ContextCapsuleActivationLock,
} from "@agent-context/repo-policy";

import {
  contextCapsuleEntryBytes,
  type BuiltContextCapsule,
} from "./context-capsule.js";
import {
  applyContextTransaction,
  inspectContextTransaction,
  type ContextMutation,
  type ContextTransactionOptions,
} from "./context-transaction.js";
export const CONTEXT_MATERIALIZATION_PATH = ".codex/acf/receipt.json";
export const CONTEXT_MATERIALIZATION_SCHEMA_VERSION = 2 as const;
export const CONTEXT_MATERIALIZATION_KIND = "agent-context-materialization" as const;

const EXPANDED_SKILL_PREFIX = ".codex/skills/";
const MATERIALIZED_SKILL_PREFIX = ".agents/skills/";
const EXPANDED_RUNTIME_PREFIX = ".codex/acf/runtime-source/";
const MATERIALIZED_RUNTIME_PREFIX = ".codex/acf/runtime/";

export interface ContextMaterializedSkillFileV2 {
  readonly component: string;
  readonly componentRevision: string;
  readonly identity: string;
  readonly skillName: string;
  readonly skillRoot: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ContextMaterializedRuntimeFileV2 {
  readonly component: string;
  readonly componentRevision: string;
  readonly identity: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export type ContextMaterializedFileV2 =
  | ContextMaterializedSkillFileV2
  | ContextMaterializedRuntimeFileV2;

export interface ContextMaterializationReceiptV2 {
  readonly schemaVersion: typeof CONTEXT_MATERIALIZATION_SCHEMA_VERSION;
  readonly kind: typeof CONTEXT_MATERIALIZATION_KIND;
  readonly registryRevision: string;
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly files: readonly ContextMaterializedFileV2[];
}

export interface ContextMaterializationConflict {
  readonly targetPath: string;
  readonly detail: string;
}

export type ContextMaterializationPlan =
  | {
      readonly status: "ready";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV2;
      readonly previousReceipt: ContextMaterializationReceiptV2 | null;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "current";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV2;
      readonly previousReceipt: ContextMaterializationReceiptV2;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "blocked";
      readonly projectRoot: string;
      readonly receipt: ContextMaterializationReceiptV2;
      readonly previousReceipt: ContextMaterializationReceiptV2 | null;
      readonly conflicts: readonly ContextMaterializationConflict[];
    };

export interface ContextMaterializationResult {
  readonly status: "materialized" | "current" | "blocked";
  readonly projectRoot: string;
  readonly receipt: ContextMaterializationReceiptV2;
  readonly conflicts: readonly ContextMaterializationConflict[];
  readonly writtenPaths: readonly string[];
}

export type ContextMaterializationOptions = ContextTransactionOptions;

interface DesiredMaterializedFile {
  readonly receipt: ContextMaterializedFileV2;
  readonly content: Buffer;
}

export async function planContextCapsuleMaterialization(
  capsule: BuiltContextCapsule,
  projectRoot: string,
): Promise<ContextMaterializationPlan> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const desiredFiles = desiredMaterializedFiles(capsule);
  const desiredReceipt = createReceipt(capsule, desiredFiles.map((file) => file.receipt));
  const transaction = await inspectContextTransaction(resolvedProjectRoot);
  if (transaction.status !== "none") {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      previousReceipt: null,
      conflicts: [{
        targetPath: ".codex/acf/state/transaction.json",
        detail: `Context transaction recovery is required before materialization: ${transaction.detail}`,
      }],
    };
  }
  const ignoreConflicts = await findUnignoredMaterializationPaths(
    resolvedProjectRoot,
    [
      CONTEXT_MATERIALIZATION_PATH,
      ...desiredReceipt.files.map((file) => file.targetPath),
    ],
  );
  if (ignoreConflicts.length > 0) {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      previousReceipt: null,
      conflicts: ignoreConflicts,
    };
  }
  const storedReceipt = await readStoredReceipt(resolvedProjectRoot);

  if (storedReceipt.status === "invalid") {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      previousReceipt: null,
      conflicts: [{ targetPath: CONTEXT_MATERIALIZATION_PATH, detail: storedReceipt.detail }],
    };
  }

  if (storedReceipt.receipt === null) {
    const conflicts = [
      ...await findUnexpectedDesiredTargets(resolvedProjectRoot, desiredReceipt.files),
      ...await findUnownedAcfSkillRoots(resolvedProjectRoot, new Set()),
      ...await findUnexpectedRuntimeRoots(resolvedProjectRoot),
    ];
    return conflicts.length === 0
      ? {
          status: "ready",
          projectRoot: resolvedProjectRoot,
          receipt: desiredReceipt,
          previousReceipt: null,
          conflicts: [],
        }
      : {
          status: "blocked",
          projectRoot: resolvedProjectRoot,
          receipt: desiredReceipt,
          previousReceipt: null,
          conflicts,
        };
  }

  const storedConflicts = [
    ...await verifyReceiptFiles(resolvedProjectRoot, storedReceipt.receipt),
    ...await findUnownedAcfSkillRoots(
      resolvedProjectRoot,
      new Set(materializedSkillRoots(storedReceipt.receipt.files)),
    ),
    ...await findUnexpectedRuntimeRoots(resolvedProjectRoot),
  ];
  if (storedConflicts.length > 0) {
    return {
      status: "blocked",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      previousReceipt: storedReceipt.receipt,
      conflicts: storedConflicts,
    };
  }
  if (serializeReceipt(storedReceipt.receipt) !== serializeReceipt(desiredReceipt)) {
    return {
      status: "ready",
      projectRoot: resolvedProjectRoot,
      receipt: desiredReceipt,
      previousReceipt: storedReceipt.receipt,
      conflicts: [],
    };
  }
  return {
    status: "current",
    projectRoot: resolvedProjectRoot,
    receipt: desiredReceipt,
    previousReceipt: storedReceipt.receipt,
    conflicts: [],
  };
}

export async function materializeContextCapsule(
  capsule: BuiltContextCapsule,
  projectRoot: string,
  options: ContextMaterializationOptions = {},
): Promise<ContextMaterializationResult> {
  const plan = await planContextCapsuleMaterialization(
    capsule,
    projectRoot,
  );
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      projectRoot: plan.projectRoot,
      receipt: plan.receipt,
      conflicts: plan.conflicts,
      writtenPaths: [],
    };
  }
  if (plan.status === "current") {
    const retiredRuntimeRoots = await retireObsoleteRuntimeRoots(
      plan.projectRoot,
      plan.receipt.treeSha256,
    );
    return {
      status: retiredRuntimeRoots.length === 0 ? "current" : "materialized",
      projectRoot: plan.projectRoot,
      receipt: plan.receipt,
      conflicts: [],
      writtenPaths: retiredRuntimeRoots,
    };
  }

  const desiredFiles = desiredMaterializedFiles(capsule);
  const desiredTargets = new Set(desiredFiles.map((file) => file.receipt.targetPath));
  const obsoleteTargets = plan.previousReceipt === null
    ? []
    : plan.previousReceipt.files
      .map((file) => file.targetPath)
      .filter((targetPath) => !desiredTargets.has(targetPath))
      .sort(compareStrings);
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
    ...obsoleteTargets.map((targetPath) => ({
      operation: "delete" as const,
      targetPath,
    })),
  ];
  const writtenPaths = await applyContextTransaction(
    plan.projectRoot,
    "sync",
    capsule.payload.registry.revision,
    mutations,
    options.afterMutation === undefined
      ? {}
      : { afterMutation: options.afterMutation },
  );
  const verified = await planContextCapsuleMaterialization(
    capsule,
    plan.projectRoot,
  );
  if (verified.status !== "current") {
    throw new Error("Context capsule materialization did not verify after publication.");
  }
  const retiredRuntimeRoots = await retireObsoleteRuntimeRoots(
    plan.projectRoot,
    plan.receipt.treeSha256,
  );
  return {
    status: "materialized",
    projectRoot: plan.projectRoot,
    receipt: plan.receipt,
    conflicts: [],
    writtenPaths: [...writtenPaths, ...retiredRuntimeRoots],
  };
}

export function decodeContextMaterializationReceipt(
  value: unknown,
): ContextMaterializationReceiptV2 {
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
    throw new Error("Context materialization receipt schemaVersion must be 2.");
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
  for (const skillRoot of materializedSkillRoots(files)) {
    if (!files.some((file) =>
      isSkillFile(file) &&
      file.skillRoot === skillRoot &&
      file.targetPath === `${skillRoot}/SKILL.md`)) {
      throw new Error(`Context materialization receipt skill root is missing SKILL.md: ${skillRoot}.`);
    }
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

export function contextCapsuleSkillActivation(
  capsule: BuiltContextCapsule,
): readonly ContextCapsuleActivationLock[] {
  return desiredMaterializedFiles(capsule).filter((file) => isSkillFile(file.receipt)).map((file) => ({
    identity: file.receipt.identity,
    targetPath: file.receipt.targetPath,
    installedSha256: file.receipt.sha256,
  })).sort((left, right) => compareStrings(left.identity, right.identity));
}

export function contextCapsuleRuntimeActivation(
  capsule: BuiltContextCapsule,
): readonly ContextCapsuleActivationLock[] {
  return desiredMaterializedFiles(capsule)
    .filter((file) => !isSkillFile(file.receipt))
    .map((file) => ({
      identity: file.receipt.identity,
      targetPath: file.receipt.targetPath,
      installedSha256: file.receipt.sha256,
    }))
    .sort((left, right) => compareStrings(left.identity, right.identity));
}

export function contextCapsuleMaterializationActivation(
  capsule: BuiltContextCapsule,
): readonly ContextCapsuleActivationLock[] {
  return [
    ...contextCapsuleSkillActivation(capsule),
    ...contextCapsuleRuntimeActivation(capsule),
  ].sort((left, right) => compareStrings(left.identity, right.identity));
}

function desiredMaterializedFiles(capsule: BuiltContextCapsule): readonly DesiredMaterializedFile[] {
  const files: DesiredMaterializedFile[] = [];
  const targets = new Set<string>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      if (artifact.targetPath.startsWith(EXPANDED_RUNTIME_PREFIX)) {
        if (artifact.operation !== "file" && artifact.operation !== "runtime-workspace") {
          throw new Error(
            `Context capsule runtime artifact ${artifact.targetPath} must use a whole-file operation.`,
          );
        }
        const content = contextCapsuleEntryBytes(capsule, artifact.sourcePath);
        if (sha256(content) !== artifact.sourceSha256) {
          throw new Error(`Context capsule materialization source drifted for ${artifact.sourcePath}.`);
        }
        const targetPath = `${MATERIALIZED_RUNTIME_PREFIX}${capsule.treeSha256}/${artifact.targetPath.slice(EXPANDED_RUNTIME_PREFIX.length)}`;
        if (targets.has(targetPath)) {
          throw new Error(`Context capsule resolves duplicate materialized target ${targetPath}.`);
        }
        targets.add(targetPath);
        files.push({
          content,
          receipt: {
            component: component.name,
            componentRevision: component.revision,
            identity: artifactIdentity(artifact),
            sourcePath: artifact.sourcePath,
            targetPath,
            sha256: artifact.sourceSha256,
            bytes: content.length,
          },
        });
        continue;
      }
      if (!artifact.targetPath.startsWith(EXPANDED_SKILL_PREFIX)) continue;
      if (artifact.operation !== "file") {
        throw new Error(
          `Context capsule skill artifact ${artifact.targetPath} must use the file operation.`,
        );
      }
      const suffix = artifact.targetPath.slice(EXPANDED_SKILL_PREFIX.length);
      const [skillName, ...skillPath] = suffix.split("/");
      if (skillName === undefined || skillPath.length === 0) {
        throw new Error(`Context capsule skill artifact has no skill-relative file: ${artifact.targetPath}.`);
      }
      const componentDigest = componentRevisionDigest(component.revision);
      const skillRoot = `${MATERIALIZED_SKILL_PREFIX}acf--${skillName}--${componentDigest}`;
      const targetPath = `${skillRoot}/${skillPath.join("/")}`;
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
          componentRevision: component.revision,
          identity: artifactIdentity(artifact),
          skillName,
          skillRoot,
          sourcePath: artifact.sourcePath,
          targetPath,
          sha256: artifact.sourceSha256,
          bytes: content.length,
        },
      });
    }
  }
  files.sort((left, right) => compareStrings(left.receipt.targetPath, right.receipt.targetPath));
  return files;
}

function createReceipt(
  capsule: BuiltContextCapsule,
  files: readonly ContextMaterializedFileV2[],
): ContextMaterializationReceiptV2 {
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
  | { readonly status: "valid"; readonly receipt: ContextMaterializationReceiptV2 | null }
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
  files: readonly ContextMaterializedFileV2[],
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
  for (const file of files.filter((candidate) => !isSkillFile(candidate))) {
    try {
      const current = await readOptionalProjectFile(projectRoot, file.targetPath);
      if (current !== null && (current.length !== file.bytes || sha256(current) !== file.sha256)) {
        conflicts.push({
          targetPath: file.targetPath,
          detail: "A runtime target exists without a receipt and differs from the capsule.",
        });
      }
    } catch (error) {
      conflicts.push({ targetPath: file.targetPath, detail: errorMessage(error) });
    }
  }
  return conflicts;
}

async function findUnexpectedRuntimeRoots(
  projectRoot: string,
): Promise<readonly ContextMaterializationConflict[]> {
  const runtimePath = path.join(projectRoot, ...MATERIALIZED_RUNTIME_PREFIX.slice(0, -1).split("/"));
  let runtimeState;
  try {
    runtimeState = await lstat(runtimePath);
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
  if (!runtimeState.isDirectory() || runtimeState.isSymbolicLink()) {
    return [{
      targetPath: MATERIALIZED_RUNTIME_PREFIX.slice(0, -1),
      detail: "ACF materialization requires the runtime path to be a real directory.",
    }];
  }
  const conflicts: ContextMaterializationConflict[] = [];
  for (const entry of await readdir(runtimePath, { withFileTypes: true })) {
    if (/^[a-f0-9]{64}$/u.test(entry.name) && entry.isDirectory()) continue;
    conflicts.push({
      targetPath: `${MATERIALIZED_RUNTIME_PREFIX}${entry.name}`,
      detail: "The ACF runtime directory contains an unexpected entry.",
    });
  }
  return conflicts;
}

async function retireObsoleteRuntimeRoots(
  projectRoot: string,
  currentTreeSha256: string,
): Promise<readonly string[]> {
  const runtimePath = path.join(projectRoot, ...MATERIALIZED_RUNTIME_PREFIX.slice(0, -1).split("/"));
  let entries;
  try {
    entries = await readdir(runtimePath, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
  const retired: string[] = [];
  for (const entry of entries.sort((left, right) => compareStrings(left.name, right.name))) {
    if (entry.name === currentTreeSha256) continue;
    if (!/^[a-f0-9]{64}$/u.test(entry.name) || !entry.isDirectory()) {
      throw new Error(`Cannot retire unexpected ACF runtime entry ${entry.name}.`);
    }
    const relativePath = `${MATERIALIZED_RUNTIME_PREFIX}${entry.name}`;
    await rm(path.join(runtimePath, entry.name), { recursive: true });
    retired.push(relativePath);
  }
  return retired;
}

async function findUnignoredMaterializationPaths(
  projectRoot: string,
  targetPaths: readonly string[],
): Promise<readonly ContextMaterializationConflict[]> {
  const ignored = await gitIgnoredPaths(projectRoot, targetPaths);
  return targetPaths.filter((targetPath) => !ignored.has(targetPath)).map((targetPath) => ({
    targetPath,
    detail: "Generated materialization path is not ignored by Git.",
  }));
}

async function gitIgnoredPaths(
  projectRoot: string,
  targetPaths: readonly string[],
): Promise<ReadonlySet<string>> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["check-ignore", "--no-index", "-z", "--stdin"], {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      reject(new Error("Git could not inspect materialization ignore rules.", { cause: error }));
    });
    child.once("close", (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(
          `Git check-ignore failed with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
        ));
        return;
      }
      resolve(new Set(
        Buffer.concat(stdout).toString("utf8").split("\0").filter((value) => value.length > 0),
      ));
    });
    child.stdin.end(`${targetPaths.join("\0")}\0`, "utf8");
  });
}

async function verifyReceiptFiles(
  projectRoot: string,
  receipt: ContextMaterializationReceiptV2,
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

async function findUnownedAcfSkillRoots(
  projectRoot: string,
  ownedRoots: ReadonlySet<string>,
): Promise<readonly ContextMaterializationConflict[]> {
  const skillsPath = path.resolve(projectRoot, MATERIALIZED_SKILL_PREFIX);
  let skillsState;
  try {
    skillsState = await lstat(skillsPath);
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
  if (skillsState.isSymbolicLink()) {
    return [{
      targetPath: MATERIALIZED_SKILL_PREFIX.slice(0, -1),
      detail: "ACF materialization cannot inspect a symbolic-link skills directory.",
    }];
  }
  if (!skillsState.isDirectory()) {
    return [{
      targetPath: MATERIALIZED_SKILL_PREFIX.slice(0, -1),
      detail: "ACF materialization requires the skills path to be a directory.",
    }];
  }
  const conflicts: ContextMaterializationConflict[] = [];
  for (const entry of await readdir(skillsPath, { withFileTypes: true })) {
    if (!/^acf--[a-z0-9]+(?:-[a-z0-9]+)*--[a-f0-9]{64}$/u.test(entry.name)) continue;
    const skillRoot = `${MATERIALIZED_SKILL_PREFIX}${entry.name}`;
    if (ownedRoots.has(skillRoot)) continue;
    if (entry.isSymbolicLink()) {
      conflicts.push({
        targetPath: skillRoot,
        detail: "Unowned ACF materialized skill root is a symbolic link.",
      });
      continue;
    }
    if (!entry.isDirectory()) {
      conflicts.push({
        targetPath: skillRoot,
        detail: "Unowned ACF materialized skill root is not a directory.",
      });
      continue;
    }
    if (await projectPathExists(projectRoot, `${skillRoot}/SKILL.md`)) {
      conflicts.push({
        targetPath: skillRoot,
        detail: "Unowned ACF materialized skill root contains SKILL.md.",
      });
    }
  }
  return conflicts;
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
  files: readonly ContextMaterializedFileV2[],
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
  files: readonly ContextMaterializedFileV2[],
): readonly string[] {
  return [...new Set(files.filter(isSkillFile).map((file) => file.skillRoot))].sort(compareStrings);
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

function decodeMaterializedFile(value: unknown, index: number): ContextMaterializedFileV2 {
  const label = `Context materialization receipt files[${index}]`;
  const record = requiredRecord(value, label);
  const targetPath = portableRelativePath(record.targetPath, `${label}.targetPath`);
  if (targetPath.startsWith(MATERIALIZED_RUNTIME_PREFIX)) {
    requireKeys(record, [
      "component",
      "componentRevision",
      "identity",
      "sourcePath",
      "targetPath",
      "sha256",
      "bytes",
    ], label);
    return {
      component: requiredString(record.component, `${label}.component`),
      componentRevision: requiredComponentRevision(
        record.componentRevision,
        `${label}.componentRevision`,
      ),
      identity: requiredString(record.identity, `${label}.identity`),
      sourcePath: portableRelativePath(record.sourcePath, `${label}.sourcePath`),
      targetPath,
      sha256: requiredSha256(record.sha256, `${label}.sha256`),
      bytes: requiredNonnegativeSafeInteger(record.bytes, `${label}.bytes`),
    };
  }
  requireKeys(record, [
    "component",
    "componentRevision",
    "identity",
    "skillName",
    "skillRoot",
    "sourcePath",
    "targetPath",
    "sha256",
    "bytes",
  ], label);
  const componentRevision = requiredComponentRevision(
    record.componentRevision,
    `${label}.componentRevision`,
  );
  const skillName = requiredSkillName(record.skillName, `${label}.skillName`);
  const skillRoot = portableRelativePath(record.skillRoot, `${label}.skillRoot`);
  const expectedRoot = `${MATERIALIZED_SKILL_PREFIX}acf--${skillName}--${componentRevision.slice(7)}`;
  if (skillRoot !== expectedRoot) {
    throw new Error(`${label}.skillRoot does not match its skill and component revision.`);
  }
  const sourcePath = portableRelativePath(record.sourcePath, `${label}.sourcePath`);
  requireMaterializedTargetPath(targetPath);
  const relativeSkillPath = targetPath.slice(skillRoot.length + 1);
  if (relativeSkillPath.length === 0) {
    throw new Error(`${label}.targetPath must name a file below its skill root.`);
  }
  const expandedTarget = `${EXPANDED_SKILL_PREFIX}${skillName}/${relativeSkillPath}`;
  if (record.identity !== `file:${expandedTarget}`) {
    throw new Error(`${label}.identity does not match its expanded skill target.`);
  }
  return {
    component: requiredString(record.component, `${label}.component`),
    componentRevision,
    identity: record.identity,
    skillName,
    skillRoot,
    sourcePath,
    targetPath,
    sha256: requiredSha256(record.sha256, `${label}.sha256`),
    bytes: requiredNonnegativeSafeInteger(record.bytes, `${label}.bytes`),
  };
}

function isSkillFile(
  file: ContextMaterializedFileV2,
): file is ContextMaterializedSkillFileV2 {
  return "skillRoot" in file;
}

function requireMaterializedTargetPath(targetPath: string): void {
  if (!targetPath.startsWith(MATERIALIZED_SKILL_PREFIX) || targetPath === MATERIALIZED_SKILL_PREFIX) {
    throw new Error(`Materialized skill target must be below ${MATERIALIZED_SKILL_PREFIX}.`);
  }
}

function componentRevisionDigest(revision: string): string {
  const match = /^sha256:([a-f0-9]{64})$/u.exec(revision);
  if (match?.[1] === undefined) {
    throw new Error("Materialized skill component revision must be a SHA-256 identity.");
  }
  return match[1];
}

function requiredComponentRevision(value: unknown, label: string): string {
  const revision = requiredString(value, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(revision)) {
    throw new Error(`${label} must be a SHA-256 component revision.`);
  }
  return revision;
}

function requiredSkillName(value: unknown, label: string): string {
  const skillName = requiredString(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(skillName)) {
    throw new Error(`${label} must be a lowercase hyphenated skill name.`);
  }
  return skillName;
}

function serializeReceipt(receipt: ContextMaterializationReceiptV2): string {
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
