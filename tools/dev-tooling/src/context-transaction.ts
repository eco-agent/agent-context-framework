import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { exists } from "./workspace.js";

export const CONTEXT_TRANSACTION_PATH = ".agent-context/transaction.json";
const CONTEXT_TRANSACTION_STAGE_PATH = ".agent-context/transaction-stage";

export type ContextMutation =
  | { readonly operation: "write"; readonly targetPath: string; readonly content: string }
  | { readonly operation: "delete"; readonly targetPath: string };

export interface ContextTransactionJournal {
  readonly schemaVersion: 1;
  readonly command: "init" | "add" | "update" | "remove";
  readonly registryRevision: string;
  readonly mutations: readonly ContextTransactionJournalMutation[];
}

export interface ContextTransactionJournalMutation {
  readonly operation: "write" | "delete";
  readonly targetPath: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
}

export async function applyContextTransaction(
  projectRoot: string,
  command: ContextTransactionJournal["command"],
  registryRevision: string,
  mutations: readonly ContextMutation[],
): Promise<readonly string[]> {
  if (mutations.length === 0) return [];
  requireUniqueTargets(mutations);
  const journalPath = secureProjectPath(projectRoot, CONTEXT_TRANSACTION_PATH);
  const stageRoot = secureProjectPath(projectRoot, CONTEXT_TRANSACTION_STAGE_PATH);
  if (await exists(journalPath) || await exists(stageRoot)) {
    throw new Error("An incomplete context transaction exists. Run agent-context doctor before writing.");
  }

  await mkdir(stageRoot, { recursive: true });
  const journalMutations: ContextTransactionJournalMutation[] = [];
  try {
    for (const [index, mutation] of mutations.entries()) {
      const target = secureProjectPath(projectRoot, mutation.targetPath);
      const beforeSha256 = (await exists(target)) ? contentHash(await readFile(target)) : null;
      if (mutation.operation === "write") {
        const staged = path.join(stageRoot, `${index}.staged`);
        await writeFile(staged, mutation.content, { encoding: "utf8", flag: "wx" });
        journalMutations.push({
          operation: "write",
          targetPath: mutation.targetPath,
          beforeSha256,
          afterSha256: contentHash(Buffer.from(mutation.content, "utf8")),
        });
      } else {
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
    await writeFile(journalPath, serializeJson(journal), { encoding: "utf8", flag: "wx" });

    for (const [index, mutation] of mutations.entries()) {
      const target = secureProjectPath(projectRoot, mutation.targetPath);
      if (mutation.operation === "write") {
        await mkdir(path.dirname(target), { recursive: true });
        await rename(path.join(stageRoot, `${index}.staged`), target);
      } else if (await exists(target)) {
        const state = await lstat(target);
        if (!state.isFile()) throw new Error(`Context deletion target is not a regular file: ${mutation.targetPath}.`);
        await unlink(target);
      }
    }
    await unlink(journalPath);
    await rm(stageRoot, { recursive: true });
    return mutations.map((mutation) => mutation.targetPath);
  } catch (error) {
    if (!(await exists(journalPath))) {
      await rm(stageRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function readContextTransaction(
  projectRoot: string,
): Promise<ContextTransactionJournal | null> {
  const journalPath = secureProjectPath(projectRoot, CONTEXT_TRANSACTION_PATH);
  if (!(await exists(journalPath))) return null;
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
  if (record.command !== "init" && record.command !== "add" && record.command !== "update" && record.command !== "remove") {
    throw new Error("Context transaction command is invalid.");
  }
  if (typeof record.registryRevision !== "string" || record.registryRevision.length === 0) {
    throw new Error("Context transaction registryRevision must be a non-empty string.");
  }
  if (!Array.isArray(record.mutations)) throw new Error("Context transaction mutations must be an array.");
  return {
    schemaVersion: 1,
    command: record.command,
    registryRevision: record.registryRevision,
    mutations: record.mutations.map(decodeJournalMutation),
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
  return {
    operation: record.operation,
    targetPath,
    beforeSha256: nullableHash(record.beforeSha256, "beforeSha256"),
    afterSha256: nullableHash(record.afterSha256, "afterSha256"),
  };
}

function requireUniqueTargets(mutations: readonly ContextMutation[]): void {
  const targets = mutations.map((mutation) => mutation.targetPath);
  const duplicate = targets.find((target, index) => targets.indexOf(target) !== index);
  if (duplicate) throw new Error(`Context transaction contains duplicate target ${duplicate}.`);
}

function secureProjectPath(root: string, relativePath: string): string {
  portableRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Context transaction path escapes the project: ${relativePath}.`);
  }
  return resolved;
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
