import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ChangeSet {
  readonly base: string;
  readonly files: readonly string[];
}

export interface WorktreeStatus {
  readonly entries: readonly string[];
}

export async function collectTaskChangedFiles(root: string): Promise<ChangeSet> {
  return {
    base: "HEAD",
    files: await collectFiles(root, [
      ["diff", "--name-only", "--diff-filter=ACMRD", "HEAD"],
      ["ls-files", "--others", "--exclude-standard"],
    ]),
  };
}

export async function collectBranchChangedFiles(
  root: string,
  requestedBase?: string,
): Promise<ChangeSet> {
  const base = requestedBase ?? (await resolveDefaultBase(root));
  return {
    base,
    files: await collectFiles(root, [
      ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`],
      ["diff", "--name-only", "--diff-filter=ACMRD", "HEAD"],
      ["ls-files", "--others", "--exclude-standard"],
    ]),
  };
}

export async function collectWorktreeStatus(root: string): Promise<WorktreeStatus> {
  const output = await git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  return {
    entries: output
      .split("\0")
      .filter((entry) => entry.length > 0)
      .sort(),
  };
}

export function worktreeMutationDiagnostics(
  initial: WorktreeStatus,
  final: WorktreeStatus,
): readonly string[] {
  const initialEntries = new Set(initial.entries);
  const finalEntries = new Set(final.entries);
  const added = final.entries.filter((entry) => !initialEntries.has(entry));
  const removed = initial.entries.filter((entry) => !finalEntries.has(entry));

  return [
    ...added.map((entry) => `Verification created or changed Git state: ${entry}`),
    ...removed.map((entry) => `Verification removed or reverted Git state: ${entry}`),
  ];
}

async function collectFiles(
  root: string,
  commands: readonly (readonly string[])[],
): Promise<readonly string[]> {
  const files = new Set<string>();

  for (const args of commands) {
    const output = await git(root, args);
    for (const line of output.split(/\r?\n/u)) {
      const normalized = line.trim().replaceAll("\\", "/");
      if (normalized.length > 0) {
        files.add(normalized);
      }
    }
  }

  return [...files].sort();
}

async function resolveDefaultBase(root: string): Promise<string> {
  const configured = process.env.CONTROL_TOWER_BASE;
  if (configured !== undefined && configured.trim().length > 0) {
    return configured;
  }

  for (const args of [
    ["merge-base", "HEAD", "development"],
    ["merge-base", "HEAD", "origin/development"],
    ["rev-parse", "HEAD^"],
    ["rev-parse", "HEAD"],
  ] as const) {
    try {
      const result = (await git(root, args)).trim();
      if (result.length > 0) {
        return result;
      }
    } catch {
      // Try the next deterministic fallback.
    }
  }

  throw new Error("Cannot resolve a verification base. Pass --base <revision>.");
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}
