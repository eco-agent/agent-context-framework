import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addComponent,
  diffProject,
  initProject,
  type ArtifactAssessment,
  type ContextDiffResult,
  type ContextOperationResult,
} from "./context-installer.js";

interface ContextInstallerArguments {
  readonly command: "init" | "add" | "diff";
  readonly projectRoot: string;
  readonly component: string | null;
}

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function parseContextInstallerArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextInstallerArguments {
  const positionals: string[] = [];
  let projectRoot = currentDirectory;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--cwd") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, value);
      index += 1;
      continue;
    }
    if (!argument || argument.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${argument ?? ""}.`);
    }
    positionals.push(argument);
  }
  const command = positionals[0];
  if (command !== "init" && command !== "add" && command !== "diff") {
    throw new Error("Usage: pnpm agent-context <init|add COMPONENT|diff> [--cwd PROJECT].");
  }
  const component = positionals[1] ?? null;
  if (command === "add" && component === null) {
    throw new Error("agent-context add requires a component name.");
  }
  if (command !== "add" && component !== null) {
    throw new Error(`agent-context ${command} does not accept a component name.`);
  }
  if (positionals.length > (command === "add" ? 2 : 1)) {
    throw new Error(`agent-context ${command} received too many arguments.`);
  }
  return { command, projectRoot, component };
}

export function formatContextResult(result: ContextOperationResult | ContextDiffResult): string {
  const lines = [`${result.command}: ${result.projectRoot}`];
  for (const assessment of result.plan.assessments) lines.push(formatAssessment(assessment));
  if (result.command === "diff") {
    lines.push(result.current ? "current: no installation differences" : "different: installation differs");
  } else if (result.plan.status === "blocked") {
    lines.push("blocked: no files were written");
  } else if (result.writtenPaths.length === 0) {
    lines.push("current: no files were written");
  } else {
    lines.push(`written: ${result.writtenPaths.join(", ")}`);
  }
  if (result.plan.status === "ready" && result.plan.lockChanged && result.command === "diff") {
    lines.push("lock: update required");
  }
  return lines.join("\n");
}

function formatAssessment(assessment: ArtifactAssessment): string {
  return `${assessment.status}: ${assessment.targetPath} (${assessment.detail})`;
}

async function main(): Promise<void> {
  const arguments_ = parseContextInstallerArguments(process.argv.slice(2), process.cwd());
  const result = arguments_.command === "init"
    ? await initProject(arguments_.projectRoot, frameworkRoot)
    : arguments_.command === "add"
      ? await addComponent(arguments_.projectRoot, frameworkRoot, arguments_.component as string)
      : await diffProject(arguments_.projectRoot, frameworkRoot);
  console.log(formatContextResult(result));
  if (result.plan.status === "blocked" || (result.command === "diff" && !result.current)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
