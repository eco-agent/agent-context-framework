import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const ignoredRelativeDirectories = new Set([
  ".codex/acf/runtime",
  ".codex/acf/runtime-source",
  ".codex/work",
]);

export async function findFiles(
  root: string,
  predicate: (relativePath: string) => boolean,
): Promise<readonly string[]> {
  const matches: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue;
      }

      const absolute = path.join(directory, entry.name);
      const relative = normalizeRelative(root, absolute);
      if (entry.isDirectory()) {
        if (ignoredRelativeDirectories.has(relative)) continue;
        await visit(absolute);
      } else if (entry.isFile() && predicate(relative)) {
        matches.push(relative);
      }
    }
  }

  await visit(root);
  return matches.sort();
}

export async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export function normalizeRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function resolvesInside(root: string, candidate: string): Promise<boolean> {
  const rootReal = await realpath(root);
  const absolute = path.resolve(root, candidate);
  if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${path.sep}`)) {
    return false;
  }

  if (!(await pathExists(absolute))) {
    return true;
  }

  const candidateReal = await realpath(absolute);
  return candidateReal === rootReal || candidateReal.startsWith(`${rootReal}${path.sep}`);
}
