import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findFiles, pathExists, readJsonFile } from "../filesystem.js";

interface PreservedInstruction {
  readonly path: string;
  readonly start: string;
  readonly end?: string;
  readonly sha256: string;
}

export async function checkAgents(root: string): Promise<readonly string[]> {
  const diagnostics: string[] = [];
  const packageJson = await readJsonFile(path.join(root, "package.json"));
  const scripts =
    isRecord(packageJson) && isRecord(packageJson.scripts)
      ? new Set(Object.keys(packageJson.scripts))
      : new Set<string>();

  const agentFiles = await findFiles(root, (relativePath) => relativePath.endsWith("AGENTS.md"));
  for (const relativePath of agentFiles) {
    const content = await readFile(path.join(root, relativePath), "utf8");
    for (const command of content.matchAll(/`pnpm ([a-z][a-z0-9:-]*)/giu)) {
      const script = command[1];
      if (script !== undefined && !scripts.has(script)) {
        diagnostics.push(`${relativePath} references missing package script: ${script}`);
      }
    }

    for (const target of markdownTargets(content)) {
      if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
        continue;
      }
      const withoutFragment = target.split("#", 1)[0]?.split("?", 1)[0];
      if (withoutFragment === undefined || withoutFragment.length === 0) {
        continue;
      }
      const resolved = path.resolve(root, path.dirname(relativePath), decodeURIComponent(withoutFragment));
      if (!(await pathExists(resolved))) {
        diagnostics.push(`${relativePath} references missing path: ${target}`);
      }
    }
  }

  for (const required of [
    "docs/AGENTS.md",
    "tools/codex-workflows/AGENTS.md",
  ]) {
    const content = await readFile(path.join(root, required), "utf8");
    for (const heading of ["## Scope", "## Commands", "## Constraints", "## References"]) {
      if (!content.includes(heading)) {
        diagnostics.push(`${required} is missing ${heading}.`);
      }
    }
  }

  diagnostics.push(...(await checkPreservedInstructions(root)));
  return diagnostics;
}

async function checkPreservedInstructions(root: string): Promise<readonly string[]> {
  const configuration = await readJsonFile(
    path.join(root, "tools/repo-policy/config/preserved-instructions.json"),
  );
  if (!Array.isArray(configuration)) {
    return ["Preserved instruction configuration must be an array."];
  }

  const diagnostics: string[] = [];
  for (const candidate of configuration) {
    if (!isPreservedInstruction(candidate)) {
      diagnostics.push("Preserved instruction configuration contains an invalid entry.");
      continue;
    }

    const content = await readFile(path.join(root, candidate.path), "utf8");
    const start = content.indexOf(candidate.start);
    const end =
      candidate.end === undefined ? content.length : content.indexOf(candidate.end, start + candidate.start.length);
    if (start < 0 || end < 0) {
      diagnostics.push(`${candidate.path} no longer contains a preserved instruction block.`);
      continue;
    }

    const block = content.slice(start, end).trimEnd().replaceAll("\r\n", "\n");
    const digest = createHash("sha256").update(block).digest("hex");
    if (digest !== candidate.sha256) {
      diagnostics.push(`${candidate.path} changed a verbatim preserved instruction block.`);
    }
  }
  return diagnostics;
}

function markdownTargets(content: string): readonly string[] {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
    .map((match) => match[1])
    .filter((target): target is string => target !== undefined);
}

function isPreservedInstruction(value: unknown): value is PreservedInstruction {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.start === "string" &&
    (value.end === undefined || typeof value.end === "string") &&
    typeof value.sha256 === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
