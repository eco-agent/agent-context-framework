import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diffContextCapsules, readContextCapsuleFile } from "./context-capsule.js";
import { packContextCapsule, syncContextCapsule } from "./context-capsule-workflow.js";
import { classifyContextCapsuleRestart } from "./context-capsule-restart.js";
import { checkContextRegistry } from "./context-registry-builder.js";

type ContextCliArguments =
  | { readonly command: "help" }
  | {
      readonly command: "pack";
      readonly projectRoot: string;
      readonly components: readonly string[];
      readonly json: boolean;
    }
  | {
      readonly command: "sync";
      readonly projectRoot: string;
      readonly json: boolean;
    }
  | {
      readonly command: "diff";
      readonly beforePath: string;
      readonly afterPath: string;
      readonly json: boolean;
    };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const CONTEXT_INSTALLER_HELP = `Agent Context Framework

Usage:
  pnpm agent-context pack [COMPONENT...] [--cwd PROJECT] [--json]
  pnpm agent-context sync [--cwd PROJECT] [--json]
  pnpm agent-context diff --before CAPSULE --after CAPSULE [--json]
  pnpm agent-context help

pack writes one tracked .codex/acf/capsule.acf and reconciles its tracked
activation files. With no component arguments it preserves the current capsule
selection, or selects core for a new project. sync verifies that capsule and
reconciles only ignored runtime and skill projections. diff compares two valid
capsules and reports whether Codex must restart. No command merges a branch.`;

export function parseContextInstallerArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextCliArguments {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const command = values[0];
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command !== "pack" && command !== "sync" && command !== "diff") {
    throw new Error(CONTEXT_INSTALLER_HELP);
  }
  let projectRoot = path.resolve(currentDirectory);
  let json = false;
  let beforePath: string | null = null;
  let afterPath: string | null = null;
  const components: string[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cwd") {
      const next = values[index + 1];
      if (next === undefined) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, next);
      index += 1;
    } else if (value === "--before") {
      beforePath = uniquePath(beforePath, values[index + 1], "--before", currentDirectory);
      index += 1;
    } else if (value === "--after") {
      afterPath = uniquePath(afterPath, values[index + 1], "--after", currentDirectory);
      index += 1;
    } else if (value === "--json") {
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else if (value?.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${value}.`);
    } else if (value !== undefined) {
      components.push(value);
    }
  }
  if (command === "pack") {
    if (beforePath !== null || afterPath !== null) {
      throw new Error("pack does not accept --before or --after.");
    }
    const duplicate = components.find((component, index) => components.indexOf(component) !== index);
    if (duplicate !== undefined) throw new Error(`pack contains duplicate component ${duplicate}.`);
    return { command, projectRoot, components, json };
  }
  if (components.length > 0) throw new Error(`${command} does not accept component arguments.`);
  if (command === "sync") {
    if (beforePath !== null || afterPath !== null) {
      throw new Error("sync does not accept --before or --after.");
    }
    return { command, projectRoot, json };
  }
  if (beforePath === null || afterPath === null) {
    throw new Error("diff requires --before and --after.");
  }
  return { command, beforePath, afterPath, json };
}

async function main(): Promise<void> {
  const request = parseContextInstallerArguments(process.argv.slice(2), process.cwd());
  if (request.command === "help") {
    process.stdout.write(`${CONTEXT_INSTALLER_HELP}\n`);
    return;
  }
  if (request.command === "pack") {
    await checkContextRegistry(frameworkRoot);
    const result = await packContextCapsule(
      frameworkRoot,
      request.projectRoot,
      await readGitRevision(frameworkRoot),
      request.components,
    );
    process.stdout.write(`${request.json ? JSON.stringify(packSummary(result), null, 2) : formatPack(result)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
    return;
  }
  if (request.command === "sync") {
    const result = await syncContextCapsule(request.projectRoot);
    process.stdout.write(`${request.json ? JSON.stringify(syncSummary(result), null, 2) : formatSync(result)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
    return;
  }
  const before = await readContextCapsuleFile(request.beforePath);
  const after = await readContextCapsuleFile(request.afterPath);
  const difference = diffContextCapsules(before, after);
  const restart = classifyContextCapsuleRestart(before, after);
  const result = {
    command: "diff" as const,
    beforePath: request.beforePath,
    afterPath: request.afterPath,
    ...difference,
    restart,
  };
  process.stdout.write(`${request.json ? JSON.stringify(result, null, 2) : formatDiff(result)}\n`);
}

function packSummary(result: Awaited<ReturnType<typeof packContextCapsule>>) {
  return {
    command: "pack",
    status: result.status,
    projectRoot: result.projectRoot,
    capsulePath: result.capsulePath,
    capsuleSha256: result.capsuleSha256,
    treeSha256: result.treeSha256,
    directComponents: result.directComponents,
    resolvedComponents: result.resolvedComponents,
    changedPathCount: result.writtenPaths.length,
    materializedPathCount: result.sync?.writtenPaths.length ?? 0,
    conflicts: result.conflicts,
  };
}

function syncSummary(result: Awaited<ReturnType<typeof syncContextCapsule>>) {
  return {
    command: "sync",
    status: result.status,
    projectRoot: result.projectRoot,
    capsulePath: result.capsulePath,
    capsuleSha256: result.capsuleSha256,
    treeSha256: result.treeSha256,
    activationCount: result.verification.artifactCount,
    materializedPathCount: result.materialization?.writtenPaths.length ?? 0,
    recovery: result.recovery.status,
    conflicts: result.conflicts,
  };
}

function formatPack(result: Awaited<ReturnType<typeof packContextCapsule>>): string {
  return [
    `status: ${result.status}`,
    `capsule: ${result.capsulePath}`,
    `components: ${result.directComponents.join(", ")}`,
    `tracked changes: ${result.writtenPaths.length}`,
    `generated changes: ${result.sync?.writtenPaths.length ?? 0}`,
    ...result.conflicts.map((conflict) => `conflict ${conflict.targetPath}: ${conflict.detail}`),
  ].join("\n");
}

function formatSync(result: Awaited<ReturnType<typeof syncContextCapsule>>): string {
  return [
    `status: ${result.status}`,
    `capsule: ${result.capsulePath}`,
    `activation: ${result.verification.artifactCount}`,
    `generated changes: ${result.materialization?.writtenPaths.length ?? 0}`,
    `recovery: ${result.recovery.status}`,
    ...result.conflicts.map((conflict) => `conflict ${conflict.targetPath}: ${conflict.detail}`),
  ].join("\n");
}

function formatDiff(result: {
  readonly beforePath: string;
  readonly afterPath: string;
  readonly equal: boolean;
  readonly addedComponents: readonly string[];
  readonly removedComponents: readonly string[];
  readonly changedComponents: readonly { readonly name: string }[];
  readonly addedEntries: readonly string[];
  readonly removedEntries: readonly string[];
  readonly changedEntries: readonly { readonly sourcePath: string }[];
  readonly restart: ReturnType<typeof classifyContextCapsuleRestart>;
}): string {
  return [
    `before: ${result.beforePath}`,
    `after: ${result.afterPath}`,
    `status: ${result.equal ? "equal" : "different"}`,
    `restart required: ${result.restart.required ? "yes" : "no"}`,
    `components added: ${result.addedComponents.join(", ") || "none"}`,
    `components removed: ${result.removedComponents.join(", ") || "none"}`,
    `components changed: ${result.changedComponents.map((entry) => entry.name).join(", ") || "none"}`,
    `entries added: ${result.addedEntries.length}`,
    `entries removed: ${result.removedEntries.length}`,
    `entries changed: ${result.changedEntries.length}`,
  ].join("\n");
}

function uniquePath(
  current: string | null,
  value: string | undefined,
  option: string,
  currentDirectory: string,
): string {
  if (current !== null) throw new Error(`${option} may be specified only once.`);
  if (value === undefined) throw new Error(`${option} requires a capsule path.`);
  return path.resolve(currentDirectory, value);
}

async function readGitRevision(repositoryRoot: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      shell: false,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Git could not resolve the framework revision: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      const revision = Buffer.concat(stdout).toString("utf8").trim();
      if (!/^[a-f0-9]{40}$/u.test(revision)) {
        reject(new Error("Git did not return a full framework revision."));
        return;
      }
      resolve(revision);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
