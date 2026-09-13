import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

export const CONTEXT_TRANSACTION_PATH = ".codex/acf/state/transaction.json";
export const CONTEXT_TRANSACTION_STAGE_PATH = ".codex/acf/state/transaction-stage";
const CONTEXT_TRANSACTION_STAGED_JOURNAL = "journal.staged";
const WINDOWS_RENAME_RETRY_DELAYS_MS = [100, 200, 300] as const;

export type ContextMutation =
  | {
      readonly operation: "write";
      readonly targetPath: string;
      readonly content: string | Uint8Array;
    }
  | { readonly operation: "delete"; readonly targetPath: string };

export interface ContextTransactionJournal {
  readonly schemaVersion: 1;
  readonly command: "init" | "add" | "update" | "remove" | "pack" | "sync";
  readonly registryRevision: string;
  readonly mutations: readonly ContextTransactionJournalMutation[];
}

export interface ContextTransactionJournalMutation {
  readonly operation: "write" | "delete";
  readonly targetPath: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
}

export interface ContextTransactionMutationInspection extends ContextTransactionJournalMutation {
  readonly state: "pending" | "applied" | "blocked";
  readonly detail: string;
}

export interface ContextTransactionInspection {
  readonly status: "none" | "discardable" | "resumable" | "blocked";
  readonly journal: ContextTransactionJournal | null;
  readonly mutations: readonly ContextTransactionMutationInspection[];
  readonly detail: string;
}

export interface ContextTransactionRecoveryResult {
  readonly status: "none" | "discarded" | "resumed";
  readonly recoveredPaths: readonly string[];
}

export type ContextTransactionMutationBoundary =
  | { readonly kind: "stage-root-created" }
  | { readonly kind: "write-staged"; readonly index: number; readonly targetPath: string }
  | { readonly kind: "journal-staged" }
  | { readonly kind: "journal-published" }
  | { readonly kind: "target-parent-created"; readonly index: number; readonly targetPath: string }
  | { readonly kind: "target-written"; readonly index: number; readonly targetPath: string }
  | { readonly kind: "target-deleted"; readonly index: number; readonly targetPath: string }
  | { readonly kind: "stage-removed" }
  | { readonly kind: "journal-removed" };

export interface ContextTransactionOptions {
  readonly afterMutation?: (boundary: ContextTransactionMutationBoundary) => void | Promise<void>;
}

export async function applyContextTransaction(
  projectRoot: string,
  command: ContextTransactionJournal["command"],
  registryRevision: string,
  mutations: readonly ContextMutation[],
  options: ContextTransactionOptions = {},
): Promise<readonly string[]> {
  if (mutations.length === 0) return [];
  requireUniqueTargets(mutations);
  const resolvedProjectRoot = await realpath(projectRoot);
  const existing = await inspectContextTransaction(resolvedProjectRoot);
  if (existing.status !== "none") {
    throw new Error("An incomplete context transaction exists. Run agent-context sync before writing.");
  }

  const journalPath = await secureProjectPath(
    resolvedProjectRoot,
    CONTEXT_TRANSACTION_PATH,
    "Context transaction journal",
  );
  const stageRoot = await secureProjectPath(
    resolvedProjectRoot,
    CONTEXT_TRANSACTION_STAGE_PATH,
    "Context transaction staging",
  );
  let stageClaimed = false;
  try {
    await mkdir(path.dirname(stageRoot), { recursive: true });
    try {
      await mkdir(stageRoot);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new Error(
          "Another context transaction claimed project staging. Run agent-context sync before retrying.",
          { cause: error },
        );
      }
      throw error;
    }
    stageClaimed = true;
    await notifyMutation(options, { kind: "stage-root-created" });
    const journalMutations: ContextTransactionJournalMutation[] = [];
    for (const [index, mutation] of mutations.entries()) {
      const beforeSha256 = await readTargetHash(resolvedProjectRoot, mutation.targetPath);
      if (mutation.operation === "write") {
        const staged = await secureProjectPath(
          resolvedProjectRoot,
          stagedMutationPath(index),
          `Staged context write ${mutation.targetPath}`,
        );
        const content = mutationContentBytes(mutation.content);
        await writeFile(staged, content, { flag: "wx" });
        await notifyMutation(options, { kind: "write-staged", index, targetPath: mutation.targetPath });
        journalMutations.push({
          operation: "write",
          targetPath: mutation.targetPath,
          beforeSha256,
          afterSha256: contentHash(content),
        });
      } else {
        if (beforeSha256 === null) {
          throw new Error(`Context deletion target is missing: ${mutation.targetPath}.`);
        }
        journalMutations.push({
          operation: "delete",
          targetPath: mutation.targetPath,
          beforeSha256,
          afterSha256: null,
        });
      }
    }

    const journal: ContextTransactionJournal = {
      schemaVersion: 1,
      command,
      registryRevision,
      mutations: journalMutations,
    };
    const stagedJournalPath = await secureProjectPath(
      resolvedProjectRoot,
      `${CONTEXT_TRANSACTION_STAGE_PATH}/${CONTEXT_TRANSACTION_STAGED_JOURNAL}`,
      "Staged context transaction journal",
    );
    await writeFile(stagedJournalPath, serializeJson(journal), { encoding: "utf8", flag: "wx" });
    await notifyMutation(options, { kind: "journal-staged" });
    await secureProjectPath(resolvedProjectRoot, CONTEXT_TRANSACTION_PATH, "Context transaction journal");
    await rename(stagedJournalPath, journalPath);
    await notifyMutation(options, { kind: "journal-published" });

    for (const [index, mutation] of journal.mutations.entries()) {
      await promotePendingMutation(resolvedProjectRoot, index, mutation, options);
    }
    await completeTransactionCleanup(resolvedProjectRoot, options);
    return mutations.map((mutation) => mutation.targetPath);
  } catch (error) {
    if (stageClaimed && !(await pathExists(journalPath))) {
      await discardStageRoot(stageRoot);
    }
    throw error;
  }
}

export async function inspectContextTransaction(
  projectRoot: string,
): Promise<ContextTransactionInspection> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const journalPath = await secureProjectPath(
    resolvedProjectRoot,
    CONTEXT_TRANSACTION_PATH,
    "Context transaction journal",
  );
  const stageRoot = await secureProjectPath(
    resolvedProjectRoot,
    CONTEXT_TRANSACTION_STAGE_PATH,
    "Context transaction staging",
  );
  const hasJournal = await pathExists(journalPath);
  const hasStage = await pathExists(stageRoot);
  if (!hasJournal) {
    return hasStage
      ? {
          status: "discardable",
          journal: null,
          mutations: [],
          detail: "Uncommitted transaction staging exists; no target promotion could have started.",
        }
      : { status: "none", journal: null, mutations: [], detail: "No context transaction exists." };
  }

  const journal = await readJournalAt(journalPath);
  const mutations = await Promise.all(
    journal.mutations.map(async (mutation, index) =>
      await inspectJournalMutation(resolvedProjectRoot, mutation, index)),
  );
  const expectedStageEntries = new Set(
    mutations.flatMap((mutation, index) =>
      mutation.operation === "write" && mutation.state === "pending" ? [`${index}.staged`] : []),
  );
  let unexpectedStageEntries: readonly string[] = [];
  if (hasStage) {
    const stageState = await lstat(stageRoot);
    if (!stageState.isDirectory() || stageState.isSymbolicLink()) {
      unexpectedStageEntries = ["transaction-stage is not a regular directory"];
    } else {
      unexpectedStageEntries = (await readdir(stageRoot)).filter((entry) => !expectedStageEntries.has(entry));
    }
  } else if (expectedStageEntries.size > 0) {
    unexpectedStageEntries = ["transaction-stage is missing"];
  }
  const blocked = mutations.some((mutation) => mutation.state === "blocked") ||
    unexpectedStageEntries.length > 0;
  if (blocked) {
    const details = [
      ...mutations.filter((mutation) => mutation.state === "blocked").map((mutation) => mutation.detail),
      ...unexpectedStageEntries.map((entry) => `Unexpected transaction staging entry: ${entry}.`),
    ];
    return {
      status: "blocked",
      journal,
      mutations,
      detail: details.join(" "),
    };
  }
  const pending = mutations.filter((mutation) => mutation.state === "pending").length;
  const applied = mutations.length - pending;
  return {
    status: "resumable",
    journal,
    mutations,
    detail: `${applied} mutation(s) are applied and ${pending} mutation(s) are pending.`,
  };
}

export async function resumeContextTransaction(
  projectRoot: string,
  options: ContextTransactionOptions = {},
): Promise<ContextTransactionRecoveryResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const inspection = await inspectContextTransaction(resolvedProjectRoot);
  if (inspection.status === "none") return { status: "none", recoveredPaths: [] };
  if (inspection.status === "discardable") {
    const stageRoot = await secureProjectPath(
      resolvedProjectRoot,
      CONTEXT_TRANSACTION_STAGE_PATH,
      "Context transaction staging",
    );
    await discardStageRoot(stageRoot);
    await notifyMutation(options, { kind: "stage-removed" });
    return { status: "discarded", recoveredPaths: [] };
  }
  if (inspection.status === "blocked" || !inspection.journal) {
    throw new Error(`Context transaction cannot be resumed safely: ${inspection.detail}`);
  }

  for (const [index, mutation] of inspection.mutations.entries()) {
    if (mutation.state === "pending") {
      await promotePendingMutation(resolvedProjectRoot, index, mutation, options);
    } else {
      const current = await inspectJournalMutation(resolvedProjectRoot, mutation, index);
      if (current.state !== "applied") {
        throw new Error(`Context transaction changed during recovery: ${current.detail}`);
      }
    }
  }
  const completed = await inspectContextTransaction(resolvedProjectRoot);
  if (
    completed.status !== "resumable" ||
    completed.mutations.some((mutation) => mutation.state !== "applied")
  ) {
    throw new Error(`Context transaction could not be completed safely: ${completed.detail}`);
  }
  await completeTransactionCleanup(resolvedProjectRoot, options);
  return {
    status: "resumed",
    recoveredPaths: inspection.mutations.map((mutation) => mutation.targetPath),
  };
}

export async function readContextTransaction(
  projectRoot: string,
): Promise<ContextTransactionJournal | null> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const journalPath = await secureProjectPath(
    resolvedProjectRoot,
    CONTEXT_TRANSACTION_PATH,
    "Context transaction journal",
  );
  return (await pathExists(journalPath)) ? await readJournalAt(journalPath) : null;
}

async function inspectJournalMutation(
  projectRoot: string,
  mutation: ContextTransactionJournalMutation,
  index: number,
): Promise<ContextTransactionMutationInspection> {
  try {
    const currentSha256 = await readTargetHash(projectRoot, mutation.targetPath);
    if (mutation.operation === "write") {
      if (currentSha256 === mutation.afterSha256) {
        const stagedExists = await pathExists(await secureProjectPath(
          projectRoot,
          stagedMutationPath(index),
          `Staged context write ${mutation.targetPath}`,
        ));
        return stagedExists
          ? { ...mutation, state: "blocked", detail: `Applied write still has staged bytes: ${mutation.targetPath}.` }
          : { ...mutation, state: "applied", detail: `Write is already applied: ${mutation.targetPath}.` };
      }
      if (currentSha256 === mutation.beforeSha256) {
        const stagedSha256 = await readStagedHash(projectRoot, mutation.targetPath, index);
        return stagedSha256 === mutation.afterSha256
          ? { ...mutation, state: "pending", detail: `Write is staged and pending: ${mutation.targetPath}.` }
          : { ...mutation, state: "blocked", detail: `Staged write hash differs from the journal: ${mutation.targetPath}.` };
      }
      return {
        ...mutation,
        state: "blocked",
        detail: `Write target matches neither journal boundary: ${mutation.targetPath}.`,
      };
    }
    if (currentSha256 === null) {
      return { ...mutation, state: "applied", detail: `Deletion is already applied: ${mutation.targetPath}.` };
    }
    return currentSha256 === mutation.beforeSha256
      ? { ...mutation, state: "pending", detail: `Deletion is pending: ${mutation.targetPath}.` }
      : {
          ...mutation,
          state: "blocked",
          detail: `Deletion target differs from the journal boundary: ${mutation.targetPath}.`,
        };
  } catch (error) {
    return {
      ...mutation,
      state: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function promotePendingMutation(
  projectRoot: string,
  index: number,
  mutation: ContextTransactionJournalMutation,
  options: ContextTransactionOptions,
): Promise<void> {
  const currentSha256 = await readTargetHash(projectRoot, mutation.targetPath);
  if (currentSha256 !== mutation.beforeSha256) {
    throw new Error(`Context target changed before promotion: ${mutation.targetPath}.`);
  }
  if (mutation.operation === "write") {
    const stagedSha256 = await readStagedHash(projectRoot, mutation.targetPath, index);
    if (stagedSha256 !== mutation.afterSha256) {
      throw new Error(`Staged context write hash differs from the journal: ${mutation.targetPath}.`);
    }
    const target = await secureProjectPath(
      projectRoot,
      mutation.targetPath,
      `Context promotion target ${mutation.targetPath}`,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await notifyMutation(options, { kind: "target-parent-created", index, targetPath: mutation.targetPath });
    if (await readStagedHash(projectRoot, mutation.targetPath, index) !== mutation.afterSha256) {
      throw new Error(`Staged context write changed during promotion: ${mutation.targetPath}.`);
    }
    if (await readTargetHash(projectRoot, mutation.targetPath) !== mutation.beforeSha256) {
      throw new Error(`Context target changed during promotion: ${mutation.targetPath}.`);
    }
    await promoteStagedWriteWithWindowsRetry(
      projectRoot,
      index,
      mutation.targetPath,
      mutation.beforeSha256,
      mutation.afterSha256,
    );
    await notifyMutation(options, { kind: "target-written", index, targetPath: mutation.targetPath });
    return;
  }

  const target = await secureProjectPath(
    projectRoot,
    mutation.targetPath,
    `Context deletion target ${mutation.targetPath}`,
  );
  const state = await lstat(target);
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new Error(`Context deletion target is not a regular file: ${mutation.targetPath}.`);
  }
  if (await readTargetHash(projectRoot, mutation.targetPath) !== mutation.beforeSha256) {
    throw new Error(`Context deletion target changed during promotion: ${mutation.targetPath}.`);
  }
  await unlink(target);
  await notifyMutation(options, { kind: "target-deleted", index, targetPath: mutation.targetPath });
}

async function promoteStagedWriteWithWindowsRetry(
  projectRoot: string,
  index: number,
  targetPath: string,
  beforeSha256: string | null,
  afterSha256: string | null,
): Promise<void> {
  if (afterSha256 === null) {
    throw new Error(`Context transaction write has no after hash: ${targetPath}.`);
  }
  for (let attempt = 0; attempt <= WINDOWS_RENAME_RETRY_DELAYS_MS.length; attempt += 1) {
    const state = await inspectWritePromotionState(
      projectRoot,
      index,
      targetPath,
      beforeSha256,
      afterSha256,
    );
    if (state === "applied") return;
    if (state !== "pending") {
      throw new Error(`Context write state changed before promotion: ${targetPath}.`);
    }
    const staged = await secureProjectPath(
      projectRoot,
      stagedMutationPath(index),
      `Staged context write ${targetPath}`,
    );
    const target = await secureProjectPath(
      projectRoot,
      targetPath,
      `Context promotion target ${targetPath}`,
    );
    try {
      await rename(staged, target);
      return;
    } catch (error) {
      if (!isTransientWindowsRenameError(error)) throw error;
      const failureState = await inspectWritePromotionState(
        projectRoot,
        index,
        targetPath,
        beforeSha256,
        afterSha256,
      );
      if (failureState === "applied") return;
      if (failureState !== "pending") {
        throw new Error(`Context write state changed after Windows rename failure: ${targetPath}.`, {
          cause: error,
        });
      }
      const retryDelayMs = WINDOWS_RENAME_RETRY_DELAYS_MS[attempt];
      if (retryDelayMs === undefined) {
        throw new Error(
          `Context promotion target remained locked after 3 Windows EPERM retries over 600 ms: ${targetPath}. The published transaction can be resumed.`,
          { cause: error },
        );
      }
      await wait(retryDelayMs);
    }
  }
}

async function inspectWritePromotionState(
  projectRoot: string,
  index: number,
  targetPath: string,
  beforeSha256: string | null,
  afterSha256: string,
): Promise<"pending" | "applied" | "changed"> {
  await secureProjectPath(
    projectRoot,
    stagedMutationPath(index),
    `Staged context write ${targetPath}`,
  );
  await secureProjectPath(
    projectRoot,
    targetPath,
    `Context promotion target ${targetPath}`,
  );
  const stagedSha256 = await readStagedHash(projectRoot, targetPath, index);
  const targetSha256 = await readTargetHash(projectRoot, targetPath);
  if (stagedSha256 === null && targetSha256 === afterSha256) return "applied";
  if (stagedSha256 === afterSha256 && targetSha256 === beforeSha256) return "pending";
  return "changed";
}

async function completeTransactionCleanup(
  projectRoot: string,
  options: ContextTransactionOptions,
): Promise<void> {
  const stageRoot = await secureProjectPath(
    projectRoot,
    CONTEXT_TRANSACTION_STAGE_PATH,
    "Context transaction staging",
  );
  if (await pathExists(stageRoot)) {
    await rm(stageRoot, { recursive: true });
    await notifyMutation(options, { kind: "stage-removed" });
  }
  const journalPath = await secureProjectPath(
    projectRoot,
    CONTEXT_TRANSACTION_PATH,
    "Context transaction journal",
  );
  await unlink(journalPath);
  await notifyMutation(options, { kind: "journal-removed" });
}

async function readJournalAt(journalPath: string): Promise<ContextTransactionJournal> {
  const state = await lstat(journalPath);
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new Error("Context transaction journal must be a regular file.");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(journalPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error("Context transaction journal must contain valid JSON.", { cause: error });
  }
  return decodeJournal(value);
}

function decodeJournal(value: unknown): ContextTransactionJournal {
  const record = strictRecord(value, "Context transaction journal", [
    "schemaVersion",
    "command",
    "registryRevision",
    "mutations",
  ]);
  if (record.schemaVersion !== 1) throw new Error("Context transaction journal schemaVersion must be 1.");
  if (
    record.command !== "init" &&
    record.command !== "add" &&
    record.command !== "update" &&
    record.command !== "remove" &&
    record.command !== "pack" &&
    record.command !== "sync"
  ) {
    throw new Error("Context transaction command is invalid.");
  }
  if (typeof record.registryRevision !== "string" || record.registryRevision.length === 0) {
    throw new Error("Context transaction registryRevision must be a non-empty string.");
  }
  if (!Array.isArray(record.mutations)) throw new Error("Context transaction mutations must be an array.");
  const mutations = record.mutations.map(decodeJournalMutation);
  requireUniqueTargets(mutations);
  return {
    schemaVersion: 1,
    command: record.command,
    registryRevision: record.registryRevision,
    mutations,
  };
}

function decodeJournalMutation(value: unknown): ContextTransactionJournalMutation {
  const record = strictRecord(value, "Context transaction mutation", [
    "operation",
    "targetPath",
    "beforeSha256",
    "afterSha256",
  ]);
  if (record.operation !== "write" && record.operation !== "delete") {
    throw new Error("Context transaction mutation operation must be write or delete.");
  }
  const targetPath = portableRelativePath(record.targetPath);
  const beforeSha256 = nullableHash(record.beforeSha256, "beforeSha256");
  const afterSha256 = nullableHash(record.afterSha256, "afterSha256");
  if (record.operation === "write") {
    if (afterSha256 === null) throw new Error("Context transaction write afterSha256 must not be null.");
    if (beforeSha256 !== null && beforeSha256 === afterSha256) {
      throw new Error("Context transaction write must change the target hash.");
    }
  } else {
    if (beforeSha256 === null) throw new Error("Context transaction delete beforeSha256 must not be null.");
    if (afterSha256 !== null) throw new Error("Context transaction delete afterSha256 must be null.");
  }
  return { operation: record.operation, targetPath, beforeSha256, afterSha256 };
}

function requireUniqueTargets(
  mutations: readonly Pick<ContextMutation | ContextTransactionJournalMutation, "targetPath">[],
): void {
  const targets = mutations.map((mutation) => mutation.targetPath);
  const duplicate = targets.find((target, index) => targets.indexOf(target) !== index);
  if (duplicate) throw new Error(`Context transaction contains duplicate target ${duplicate}.`);
}

async function secureProjectPath(root: string, relativePath: string, label: string): Promise<string> {
  portableRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the project: ${relativePath}.`);
  }
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const state = await lstat(current);
      if (state.isSymbolicLink()) throw new Error(`${label} traverses symbolic link ${current}.`);
    } catch (error) {
      if (isMissingPathError(error)) break;
      throw error;
    }
  }
  return resolved;
}

async function readTargetHash(projectRoot: string, relativePath: string): Promise<string | null> {
  const target = await secureProjectPath(
    projectRoot,
    relativePath,
    `Context transaction target ${relativePath}`,
  );
  try {
    const state = await lstat(target);
    if (!state.isFile() || state.isSymbolicLink()) {
      throw new Error(`Context transaction target is not a regular file: ${relativePath}.`);
    }
    return contentHash(await readFile(target));
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

async function readStagedHash(
  projectRoot: string,
  targetPath: string,
  index: number,
): Promise<string | null> {
  const staged = await secureProjectPath(
    projectRoot,
    stagedMutationPath(index),
    `Staged context write ${targetPath}`,
  );
  try {
    const state = await lstat(staged);
    if (!state.isFile() || state.isSymbolicLink()) {
      throw new Error(`Staged context write is not a regular file: ${targetPath}.`);
    }
    return contentHash(await readFile(staged));
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function stagedMutationPath(index: number): string {
  return `${CONTEXT_TRANSACTION_STAGE_PATH}/${index}.staged`;
}

async function notifyMutation(
  options: ContextTransactionOptions,
  boundary: ContextTransactionMutationBoundary,
): Promise<void> {
  await options.afterMutation?.(boundary);
}

async function discardStageRoot(stageRoot: string): Promise<void> {
  if (!(await pathExists(stageRoot))) return;
  await rm(stageRoot, { recursive: true, force: true });
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

function portableRelativePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Context transaction targetPath must be a normalized repository-relative path.");
  }
  return value;
}

function nullableHash(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 hash or null.`);
  }
  return value;
}

function contentHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function mutationContentBytes(content: string | Uint8Array): Buffer {
  return typeof content === "string"
    ? Buffer.from(content, "utf8")
    : Buffer.from(content);
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}.`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isTransientWindowsRenameError(error: unknown): boolean {
  return process.platform === "win32" &&
    error instanceof Error &&
    "code" in error &&
    error.code === "EPERM" &&
    "syscall" in error &&
    error.syscall === "rename";
}
