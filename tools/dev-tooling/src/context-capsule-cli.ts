import { spawn } from "node:child_process";
import path from "node:path";

import {
  CONTEXT_CAPSULE_PATH,
} from "@agent-context/repo-policy";

import {
  buildContextCapsuleForProject,
  diffContextCapsules,
  extractContextCapsule,
  inspectContextCapsule,
  readContextCapsuleFile,
  writeContextCapsuleFile,
  type ContextCapsuleDiff,
  type ContextCapsuleInspection,
} from "./context-capsule.js";
import {
  verifyContextCapsuleInstallation,
  type ContextCapsuleInstallationVerification,
} from "./context-capsule-installation.js";
import {
  materializeContextCapsuleSkills,
  type ContextMaterializationResult,
} from "./context-capsule-materialization.js";

export type ContextCapsuleCliArguments =
  | {
      readonly command: "build";
      readonly projectRoot: string;
      readonly capsulePath: string;
      readonly json: boolean;
    }
  | {
      readonly command: "list" | "inspect";
      readonly capsulePath: string;
      readonly json: boolean;
    }
  | {
      readonly command: "verify" | "materialize";
      readonly projectRoot: string;
      readonly capsulePath: string;
      readonly json: boolean;
    }
  | {
      readonly command: "diff";
      readonly beforePath: string;
      readonly afterPath: string;
      readonly json: boolean;
    }
  | {
      readonly command: "extract";
      readonly capsulePath: string;
      readonly outputRoot: string;
      readonly json: boolean;
    };

export interface ContextCapsuleCliResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

export const CONTEXT_CAPSULE_HELP = `Agent Context Framework capsule v1

Usage:
  pnpm agent-context capsule build [--cwd PROJECT] [--output CAPSULE] [--json]
  pnpm agent-context capsule list [--cwd PROJECT] [--capsule CAPSULE] [--json]
  pnpm agent-context capsule inspect [--cwd PROJECT] [--capsule CAPSULE] [--json]
  pnpm agent-context capsule verify [--cwd PROJECT] [--capsule CAPSULE] [--json]
  pnpm agent-context capsule materialize [--cwd PROJECT] [--capsule CAPSULE] [--json]
  pnpm agent-context capsule diff --before CAPSULE --after CAPSULE [--json]
  pnpm agent-context capsule extract --capsule CAPSULE --output DIRECTORY [--json]

build writes a new capsule and refuses replacement. verify compares a capsule
with the current expanded installation without writing. materialize writes a
repository skill projection and receipt, reuses an exact projection, and
blocks replacement until lock v3 proves prior ownership. extract writes verified
registry source paths to a new directory outside the framework worktree.`;

export function parseContextCapsuleArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextCapsuleCliArguments {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const command = values[0];
  if (
    command !== "build" &&
    command !== "list" &&
    command !== "inspect" &&
    command !== "verify" &&
    command !== "materialize" &&
    command !== "diff" &&
    command !== "extract"
  ) {
    throw new Error(CONTEXT_CAPSULE_HELP);
  }
  let projectRoot = path.resolve(currentDirectory);
  let capsuleValue: string | null = null;
  let outputValue: string | null = null;
  let beforeValue: string | null = null;
  let afterValue: string | null = null;
  let json = false;
  for (let index = 1; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--cwd") {
      const value = values[index + 1];
      if (value === undefined) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, value);
      index += 1;
    } else if (argument === "--capsule") {
      capsuleValue = uniqueOption(capsuleValue, values[index + 1], "--capsule");
      index += 1;
    } else if (argument === "--output") {
      outputValue = uniqueOption(outputValue, values[index + 1], "--output");
      index += 1;
    } else if (argument === "--before") {
      beforeValue = uniqueOption(beforeValue, values[index + 1], "--before");
      index += 1;
    } else if (argument === "--after") {
      afterValue = uniqueOption(afterValue, values[index + 1], "--after");
      index += 1;
    } else if (argument === "--json") {
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else if (argument === "--help" || argument === "-h") {
      throw new Error(CONTEXT_CAPSULE_HELP);
    } else {
      throw new Error(`Unknown capsule argument ${argument ?? ""}.`);
    }
  }
  const capsulePath = path.resolve(
    currentDirectory,
    capsuleValue ?? path.join(projectRoot, CONTEXT_CAPSULE_PATH),
  );
  if (command === "build") {
    rejectOptions(command, { capsuleValue, beforeValue, afterValue });
    return {
      command,
      projectRoot,
      capsulePath: path.resolve(
        currentDirectory,
        outputValue ?? path.join(projectRoot, CONTEXT_CAPSULE_PATH),
      ),
      json,
    };
  }
  if (command === "list" || command === "inspect") {
    rejectOptions(command, { outputValue, beforeValue, afterValue });
    return { command, capsulePath, json };
  }
  if (command === "verify" || command === "materialize") {
    rejectOptions(command, { outputValue, beforeValue, afterValue });
    return { command, projectRoot, capsulePath, json };
  }
  if (command === "diff") {
    rejectOptions(command, { capsuleValue, outputValue });
    if (beforeValue === null || afterValue === null) {
      throw new Error("capsule diff requires --before and --after.");
    }
    return {
      command,
      beforePath: path.resolve(currentDirectory, beforeValue),
      afterPath: path.resolve(currentDirectory, afterValue),
      json,
    };
  }
  rejectOptions(command, { beforeValue, afterValue });
  if (capsuleValue === null || outputValue === null) {
    throw new Error("capsule extract requires --capsule and --output.");
  }
  return {
    command,
    capsulePath,
    outputRoot: path.resolve(currentDirectory, outputValue),
    json,
  };
}

export async function runContextCapsuleCli(
  arguments_: readonly string[],
  currentDirectory: string,
  frameworkRoot: string,
): Promise<ContextCapsuleCliResult> {
  const request = parseContextCapsuleArguments(arguments_, currentDirectory);
  if (request.command === "build") {
    const capsule = await buildContextCapsuleForProject(
      frameworkRoot,
      request.projectRoot,
      await readGitRevision(frameworkRoot),
    );
    await writeContextCapsuleFile(request.capsulePath, capsule);
    const inspection = inspectContextCapsule(capsule);
    return {
      exitCode: 0,
      output: request.json
        ? JSON.stringify({ command: "build", capsulePath: request.capsulePath, ...inspection }, null, 2)
        : formatBuild(request.capsulePath, inspection),
    };
  }
  if (request.command === "list") {
    const inspection = inspectContextCapsule(await readContextCapsuleFile(request.capsulePath));
    const result = {
      command: "list",
      capsulePath: request.capsulePath,
      directComponents: inspection.directComponents,
      resolvedComponents: inspection.resolvedComponents,
    };
    return {
      exitCode: 0,
      output: request.json
        ? JSON.stringify(result, null, 2)
        : [
            `capsule: ${request.capsulePath}`,
            `direct: ${inspection.directComponents.join(", ")}`,
            ...inspection.resolvedComponents.map((component) =>
              `${component.name} ${component.revision}`),
          ].join("\n"),
    };
  }
  if (request.command === "inspect") {
    const inspection = inspectContextCapsule(await readContextCapsuleFile(request.capsulePath));
    return {
      exitCode: 0,
      output: request.json
        ? JSON.stringify({ command: "inspect", capsulePath: request.capsulePath, ...inspection }, null, 2)
        : formatInspection(request.capsulePath, inspection),
    };
  }
  if (request.command === "verify") {
    const capsule = await readContextCapsuleFile(request.capsulePath);
    const verification = await verifyContextCapsuleInstallation(capsule, request.projectRoot);
    return {
      exitCode: verification.ok ? 0 : 1,
      output: request.json
        ? JSON.stringify({ command: "verify", capsulePath: request.capsulePath, ...verification }, null, 2)
        : formatVerification(request.capsulePath, verification),
    };
  }
  if (request.command === "materialize") {
    const materialization = await materializeContextCapsuleSkills(
      await readContextCapsuleFile(request.capsulePath),
      request.projectRoot,
    );
    return {
      exitCode: materialization.status === "blocked" ? 1 : 0,
      output: request.json
        ? JSON.stringify({
            command: "materialize",
            capsulePath: request.capsulePath,
            ...materialization,
          }, null, 2)
        : formatMaterialization(request.capsulePath, materialization),
    };
  }
  if (request.command === "diff") {
    const difference = diffContextCapsules(
      await readContextCapsuleFile(request.beforePath),
      await readContextCapsuleFile(request.afterPath),
    );
    return {
      exitCode: difference.equal ? 0 : 1,
      output: request.json
        ? JSON.stringify({
            command: "diff",
            beforePath: request.beforePath,
            afterPath: request.afterPath,
            ...difference,
          }, null, 2)
        : formatDifference(request.beforePath, request.afterPath, difference),
    };
  }
  if (request.command !== "extract") {
    throw new Error(`Unsupported capsule command ${request.command}.`);
  }
  requireOutsideFramework(request.outputRoot, frameworkRoot);
  const capsule = await readContextCapsuleFile(request.capsulePath);
  const extractedPaths = await extractContextCapsule(capsule, request.outputRoot);
  const result = {
    command: "extract",
    capsulePath: request.capsulePath,
    outputRoot: request.outputRoot,
    extractedPaths,
  };
  return {
    exitCode: 0,
    output: request.json
      ? JSON.stringify(result, null, 2)
      : `extracted ${extractedPaths.length} source file(s) to ${request.outputRoot}`,
  };
}

function formatBuild(capsulePath: string, inspection: ContextCapsuleInspection): string {
  return [
    `built: ${capsulePath}`,
    `capsule sha256: ${inspection.capsuleSha256}`,
    `tree sha256: ${inspection.treeSha256}`,
    `components: ${inspection.resolvedComponents.length}`,
    `entries: ${inspection.entries.length}`,
    `capsule bytes: ${inspection.capsuleBytes}`,
    `payload bytes: ${inspection.payloadBytes}`,
  ].join("\n");
}

function formatInspection(capsulePath: string, inspection: ContextCapsuleInspection): string {
  return [
    `capsule: ${capsulePath}`,
    `format: ${inspection.format}`,
    `registry: ${inspection.registryRevision}`,
    `framework: ${inspection.frameworkRevision}`,
    `capsule sha256: ${inspection.capsuleSha256}`,
    `tree sha256: ${inspection.treeSha256}`,
    `direct: ${inspection.directComponents.join(", ")}`,
    `resolved: ${inspection.resolvedComponents.map((component) => component.name).join(", ")}`,
    `entries: ${inspection.entries.length}`,
    `capsule bytes: ${inspection.capsuleBytes}`,
    `payload bytes: ${inspection.payloadBytes}`,
  ].join("\n");
}

function formatVerification(
  capsulePath: string,
  verification: ContextCapsuleInstallationVerification,
): string {
  return [
    `capsule: ${capsulePath}`,
    `project: ${verification.projectRoot}`,
    `status: ${verification.ok ? "verified" : "mismatch"}`,
    `artifacts: ${verification.artifactCount}`,
    ...verification.mismatches.map((mismatch) =>
      `mismatch ${mismatch.identity}: ${mismatch.detail}`),
  ].join("\n");
}

function formatDifference(
  beforePath: string,
  afterPath: string,
  difference: ContextCapsuleDiff,
): string {
  return [
    `before: ${beforePath}`,
    `after: ${afterPath}`,
    `status: ${difference.equal ? "equal" : "different"}`,
    ...(difference.directSelectionChanged
      ? [`direct: ${difference.beforeDirectComponents.join(", ")} -> ${difference.afterDirectComponents.join(", ")}`]
      : []),
    ...difference.addedComponents.map((name) => `component added: ${name}`),
    ...difference.removedComponents.map((name) => `component removed: ${name}`),
    ...difference.changedComponents.map((component) =>
      `component changed: ${component.name} ${component.beforeRevision} -> ${component.afterRevision}`),
    ...difference.addedEntries.map((sourcePath) => `entry added: ${sourcePath}`),
    ...difference.removedEntries.map((sourcePath) => `entry removed: ${sourcePath}`),
    ...difference.changedEntries.map((entry) =>
      `entry changed: ${entry.sourcePath} ${entry.beforeSha256} -> ${entry.afterSha256}`),
  ].join("\n");
}

function formatMaterialization(
  capsulePath: string,
  materialization: ContextMaterializationResult,
): string {
  return [
    `capsule: ${capsulePath}`,
    `project: ${materialization.projectRoot}`,
    `status: ${materialization.status}`,
    `files: ${materialization.receipt.files.length}`,
    ...materialization.conflicts.map((conflict) =>
      `conflict ${conflict.targetPath}: ${conflict.detail}`),
  ].join("\n");
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

function uniqueOption(current: string | null, next: string | undefined, option: string): string {
  if (next === undefined) throw new Error(`${option} requires a path.`);
  if (current !== null) throw new Error(`${option} may be specified only once.`);
  return next;
}

function rejectOptions(command: string, options: Readonly<Record<string, string | null>>): void {
  const used = Object.entries(options).find(([, value]) => value !== null);
  if (used !== undefined) throw new Error(`--${used[0].replace(/Value$/u, "")} is not valid for capsule ${command}.`);
}

function requireOutsideFramework(outputRoot: string, frameworkRoot: string): void {
  const output = path.resolve(outputRoot);
  const framework = path.resolve(frameworkRoot);
  if (containsPath(framework, output) || containsPath(output, framework)) {
    throw new Error("Context capsule extraction output must be outside the framework worktree.");
  }
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(normalizePath(parent), normalizePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
