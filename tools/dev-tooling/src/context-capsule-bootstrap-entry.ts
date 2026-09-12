import { spawn } from "node:child_process";
import path from "node:path";

import { bootstrapContextCapsule } from "./context-capsule-bootstrap.js";

type BootstrapExecutable = "hook" | "policy" | "repo-context";

type BootstrapArguments =
  | { readonly command: "sync"; readonly projectRoot: string; readonly json: boolean }
  | {
      readonly command: "exec";
      readonly executable: "hook" | "repo-context";
      readonly projectRoot: string;
      readonly json: false;
      readonly arguments: readonly [];
    }
  | {
      readonly command: "exec";
      readonly executable: "policy";
      readonly projectRoot: string;
      readonly json: false;
      readonly arguments: readonly string[];
    };

function parseArguments(values: readonly string[]): BootstrapArguments {
  const command = values[0];
  const executable = values[1];
  if (
    command !== "sync" &&
    !(command === "exec" &&
      (executable === "hook" || executable === "policy" || executable === "repo-context"))
  ) {
    throw new Error(
      "Usage: node .codex/acf/bootstrap.mjs sync [--cwd PROJECT] [--json]\n" +
      "       node .codex/acf/bootstrap.mjs exec hook|repo-context [--cwd PROJECT]\n" +
      "       node .codex/acf/bootstrap.mjs exec policy [--cwd PROJECT] -- <policy arguments>",
    );
  }
  let projectRoot = process.cwd();
  let projectRootSet = false;
  let json = false;
  let forwardedArguments: readonly string[] | null = null;
  for (let index = command === "exec" ? 2 : 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cwd") {
      if (projectRootSet) throw new Error("--cwd may be specified only once.");
      const next = values[index + 1];
      if (next === undefined) throw new Error("--cwd requires a project path.");
      projectRoot = next;
      projectRootSet = true;
      index += 1;
    } else if (value === "--json") {
      if (command === "exec") throw new Error("exec does not write bootstrap JSON to stdout.");
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else if (value === "--") {
      if (command !== "exec" || executable !== "policy") {
        throw new Error("Only exec policy accepts forwarded arguments.");
      }
      forwardedArguments = values.slice(index + 1);
      if (forwardedArguments.length === 0) {
        throw new Error("exec policy requires at least one forwarded argument.");
      }
      break;
    } else {
      throw new Error(`Unknown bootstrap argument ${value ?? ""}.`);
    }
  }
  if (command === "sync") return { command, projectRoot, json };
  if (executable === "policy") {
    if (forwardedArguments === null) {
      throw new Error("exec policy requires -- followed by policy arguments.");
    }
    return {
      command,
      executable,
      projectRoot,
      json: false,
      arguments: forwardedArguments,
    };
  }
  if (executable === "hook" || executable === "repo-context") {
    return { command, executable, projectRoot, json: false, arguments: [] };
  }
  throw new Error("Unknown bootstrap executable.");
}

try {
  const request = parseArguments(process.argv.slice(2));
  if (request.command === "exec") {
    const result = await bootstrapContextCapsule(request.projectRoot);
    if (result.materialization.status === "blocked") {
      throw new Error(
        result.materialization.conflicts.map((conflict) =>
          `${conflict.targetPath}: ${conflict.detail}`).join("\n"),
      );
    }
    const suffix = executableSuffix(request.executable);
    const candidates = result.materialization.receipt.files.filter((file) =>
      file.targetPath.endsWith(suffix));
    if (candidates.length !== 1) {
      throw new Error(`The capsule must materialize exactly one ${request.executable} entrypoint.`);
    }
    const entrypoint = path.resolve(result.projectRoot, candidates[0]!.targetPath);
    process.exitCode = await runEntrypoint(
      entrypoint,
      result.projectRoot,
      request.executable,
      request.arguments,
    );
  } else {
    const result = await bootstrapContextCapsule(request.projectRoot);
    const output = request.json
      ? JSON.stringify(result, null, 2)
      : [
          `project: ${result.projectRoot}`,
          `capsule: ${result.capsulePath}`,
          `recovery: ${result.recovery.status}`,
          `materialization: ${result.materialization.status}`,
          ...result.materialization.conflicts.map((conflict) =>
            `conflict ${conflict.targetPath}: ${conflict.detail}`),
        ].join("\n");
    process.stdout.write(`${output}\n`);
    if (result.materialization.status === "blocked") process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function executableSuffix(executable: BootstrapExecutable): string {
  switch (executable) {
    case "hook":
      return "/packages/hooks/dist/src/codex-cli.js";
    case "policy":
      return "/packages/policy/dist/src/cli.js";
    case "repo-context":
      return "/packages/repo-context/dist/src/mcp-cli.js";
  }
}

async function runEntrypoint(
  entrypoint: string,
  projectRoot: string,
  executable: BootstrapExecutable,
  forwardedArguments: readonly string[],
): Promise<number> {
  return await new Promise((resolve, reject) => {
    const childArguments = executable === "policy"
      ? [entrypoint, ...forwardedArguments, "--root", projectRoot]
      : [entrypoint, "--root", projectRoot];
    const child = spawn(process.execPath, childArguments, {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`${executable} terminated by signal ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}
