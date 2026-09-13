import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diffContextCapsules, readContextCapsuleFile } from "./context-capsule.js";
import { packContextCapsule, syncContextCapsule } from "./context-capsule-workflow.js";
import { classifyContextCapsuleRestart } from "./context-capsule-restart.js";
import { checkContextRegistry } from "./context-registry-builder.js";
import { loadContextRegistry } from "./context-installer.js";
import {
  forgetContextRepository,
  inspectContextRepositories,
  listContextRepositories,
  registerContextRepository,
  resolveContextRepositoryCatalogRoot,
  syncContextRepositories,
  type ContextRepositoryObservation,
} from "./context-repository-catalog.js";
import { startContextRepositoryUiServer } from "./context-repository-ui-server.js";

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
  | { readonly command: "sync-all"; readonly json: boolean }
  | {
      readonly command: "diff";
      readonly beforePath: string;
      readonly afterPath: string;
      readonly json: boolean;
    }
  | {
      readonly command: "repo-register";
      readonly projectRoot: string;
      readonly json: boolean;
    }
  | { readonly command: "repo-forget"; readonly id: string; readonly json: boolean }
  | { readonly command: "repo-list"; readonly json: boolean }
  | { readonly command: "repo-status"; readonly id: string | null; readonly json: boolean }
  | { readonly command: "repo-ui"; readonly port: number; readonly openBrowser: boolean };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const CONTEXT_INSTALLER_HELP = `Agent Context Framework

Usage:
  acf pack [COMPONENT...] [--cwd PROJECT] [--json]
  acf sync [--cwd PROJECT] [--json]
  acf sync --all [--json]
  acf diff --before CAPSULE --after CAPSULE [--json]
  acf repo register [--cwd PROJECT] [--json]
  acf repo forget ID [--json]
  acf repo list [--json]
  acf repo status [ID] [--json]
  acf repo ui [--port PORT] [--no-open]
  acf help

pack writes one tracked .codex/acf/capsule.acf and reconciles its tracked
activation files. With no component arguments it preserves the current capsule
selection, or selects core for a new project. sync verifies that capsule and
reconciles only ignored runtime and skill projections. diff compares two valid
capsules and reports whether Codex must restart. repo manages the machine-level
repository catalog below $CODEX_HOME/acf/repositories, defaulting to
~/.codex/acf/repositories. No command merges a branch.`;

export function parseContextInstallerArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextCliArguments {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const command = values[0];
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command === "repo") {
    return parseRepositoryArguments(values.slice(1), currentDirectory);
  }
  if (command !== "pack" && command !== "sync" && command !== "diff") {
    throw new Error(CONTEXT_INSTALLER_HELP);
  }
  let projectRoot = path.resolve(currentDirectory);
  let json = false;
  let beforePath: string | null = null;
  let afterPath: string | null = null;
  let all = false;
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
    } else if (value === "--all") {
      if (all) throw new Error("--all may be specified only once.");
      all = true;
    } else if (value?.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${value}.`);
    } else if (value !== undefined) {
      components.push(value);
    }
  }
  if (command === "pack") {
    if (beforePath !== null || afterPath !== null || all) {
      throw new Error("pack does not accept --before, --after, or --all.");
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
    if (all) return { command: "sync-all", json };
    return { command, projectRoot, json };
  }
  if (all) throw new Error("diff does not accept --all.");
  if (beforePath === null || afterPath === null) {
    throw new Error("diff requires --before and --after.");
  }
  return { command, beforePath, afterPath, json };
}

function parseRepositoryArguments(
  values: readonly string[],
  currentDirectory: string,
): ContextCliArguments {
  const action = values[0];
  if (action !== "register" && action !== "forget" && action !== "list" && action !== "status" && action !== "ui") {
    throw new Error(CONTEXT_INSTALLER_HELP);
  }
  let projectRoot = path.resolve(currentDirectory);
  let cwdSpecified = false;
  let json = false;
  let port = 0;
  let portSpecified = false;
  let openBrowser = true;
  const positional: string[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cwd") {
      if (cwdSpecified) throw new Error("--cwd may be specified only once.");
      const next = values[index + 1];
      if (next === undefined) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, next);
      cwdSpecified = true;
      index += 1;
    } else if (value === "--json") {
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else if (value === "--port") {
      if (portSpecified) throw new Error("--port may be specified only once.");
      const next = values[index + 1];
      if (next === undefined || !/^\d+$/u.test(next)) throw new Error("--port requires an integer from 0 to 65535.");
      port = Number(next);
      if (port > 65_535) throw new Error("--port requires an integer from 0 to 65535.");
      portSpecified = true;
      index += 1;
    } else if (value === "--no-open") {
      if (!openBrowser) throw new Error("--no-open may be specified only once.");
      openBrowser = false;
    } else if (value?.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${value}.`);
    } else if (value !== undefined) {
      positional.push(value);
    }
  }
  if (action === "ui") {
    if (cwdSpecified || json || positional.length > 0) {
      throw new Error("repo ui accepts only --port and --no-open.");
    }
    return { command: "repo-ui", port, openBrowser };
  }
  if (portSpecified || !openBrowser) {
    throw new Error(`repo ${action} does not accept --port or --no-open.`);
  }
  if (action === "register") {
    if (positional.length > 0) throw new Error("repo register does not accept a repository id.");
    return { command: "repo-register", projectRoot, json };
  }
  if (cwdSpecified) throw new Error(`repo ${action} does not accept --cwd.`);
  if (action === "forget") {
    if (positional.length !== 1) throw new Error("repo forget requires one repository id.");
    return { command: "repo-forget", id: repositorySelector(positional[0]!), json };
  }
  if (action === "list") {
    if (positional.length > 0) throw new Error("repo list does not accept a repository id.");
    return { command: "repo-list", json };
  }
  if (positional.length > 1) throw new Error("repo status accepts at most one repository id.");
  return { command: "repo-status", id: positional[0] === undefined ? null : repositorySelector(positional[0]), json };
}

function repositorySelector(value: string): string {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Repository id must be a lowercase SHA-256 value.");
  }
  return value;
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
  if (request.command === "sync-all") {
    const catalogRoot = resolveContextRepositoryCatalogRoot();
    const results = await syncContextRepositories(catalogRoot);
    const failed = results.some((result) => result.status === "blocked" || result.status === "failed");
    const output = {
      command: "sync" as const,
      scope: "registered" as const,
      status: failed ? "attention" as const : "complete" as const,
      catalogRoot,
      results,
    };
    process.stdout.write(`${request.json ? JSON.stringify(output, null, 2) : formatSyncAll(output)}\n`);
    if (failed) process.exitCode = 1;
    return;
  }
  if (request.command === "repo-register") {
    const result = await registerContextRepository(request.projectRoot);
    process.stdout.write(`${request.json ? JSON.stringify(result, null, 2) : formatRepositoryRegistration(result)}\n`);
    return;
  }
  if (request.command === "repo-forget") {
    const result = await forgetContextRepository(request.id);
    process.stdout.write(`${request.json ? JSON.stringify(result, null, 2) : `status: ${result.status}\nid: ${result.id}`}\n`);
    return;
  }
  if (request.command === "repo-list") {
    const catalogRoot = resolveContextRepositoryCatalogRoot();
    const repositories = await listContextRepositories(catalogRoot);
    const result = { command: "repo list" as const, catalogRoot, repositories };
    process.stdout.write(`${request.json ? JSON.stringify(result, null, 2) : formatRepositoryList(catalogRoot, repositories)}\n`);
    return;
  }
  if (request.command === "repo-status") {
    const catalogRoot = resolveContextRepositoryCatalogRoot();
    const registry = await loadContextRegistry(frameworkRoot);
    const observations = await inspectContextRepositories(catalogRoot, registry.revision);
    const selected = request.id === null
      ? observations
      : observations.filter((observation) => observation.id === request.id);
    if (request.id !== null && selected.length === 0) {
      throw new Error(`Repository ${request.id} is not registered.`);
    }
    const result = {
      command: "repo status" as const,
      catalogRoot,
      status: selected.every((observation) => observation.status === "current")
        ? "current" as const
        : "attention" as const,
      repositories: selected,
    };
    process.stdout.write(`${request.json ? JSON.stringify(result, null, 2) : formatRepositoryStatus(result)}\n`);
    if (result.status === "attention") process.exitCode = 1;
    return;
  }
  if (request.command === "repo-ui") {
    const server = await startContextRepositoryUiServer({
      frameworkRoot,
      port: request.port,
      openBrowser: request.openBrowser,
    });
    process.stdout.write(`repository UI: ${server.url}\n`);
    if (server.browserLaunchIssue !== null) {
      process.stderr.write(
        `warning: default browser did not open: ${server.browserLaunchIssue}\n`,
      );
    }
    await waitForShutdown();
    await server.close();
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

async function waitForShutdown(): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

function formatSyncAll(result: {
  readonly status: "complete" | "attention";
  readonly catalogRoot: string;
  readonly results: readonly {
    readonly root: string | null;
    readonly recordPath?: string;
    readonly status: string;
  }[];
}): string {
  return [
    `status: ${result.status}`,
    `catalog: ${result.catalogRoot}`,
    ...result.results.map((entry) =>
      `${entry.status}\t${entry.root ?? entry.recordPath ?? "unknown"}`),
  ].join("\n");
}

function formatRepositoryRegistration(result: Awaited<ReturnType<typeof registerContextRepository>>): string {
  return [
    `status: ${result.status}`,
    `id: ${result.record.id}`,
    `root: ${result.record.root}`,
    `catalog: ${result.catalogRoot}`,
  ].join("\n");
}

function formatRepositoryList(
  catalogRoot: string,
  repositories: readonly { readonly id: string; readonly root: string }[],
): string {
  return [
    `catalog: ${catalogRoot}`,
    `repositories: ${repositories.length}`,
    ...repositories.map((repository) => `${repository.id}\t${repository.root}`),
  ].join("\n");
}

function formatRepositoryStatus(result: {
  readonly status: "current" | "attention";
  readonly catalogRoot: string;
  readonly repositories: readonly ContextRepositoryObservation[];
}): string {
  return [
    `status: ${result.status}`,
    `catalog: ${result.catalogRoot}`,
    ...result.repositories.flatMap((repository) => [
      `${repository.status}\t${repository.id}\t${repository.root}`,
      ...repository.issues.map((issue) => `  ${issue}`),
    ]),
  ].join("\n");
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
