import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addComponent,
  diffProject,
  doctorProject,
  initProject,
  inspectProject,
  removeComponent,
  updateProject,
  type ArtifactAssessment,
  type ContextDiffResult,
  type ContextDoctorResult,
  type ContextInspection,
  type ContextOperationResult,
} from "./context-installer.js";

type ContextInstallerArguments =
  | {
      readonly command: "inspect" | "diff" | "doctor";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text" | "json";
    }
  | {
      readonly command: "init";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text";
    }
  | {
      readonly command: "add" | "remove";
      readonly projectRoot: string;
      readonly component: string;
      readonly output: "text";
    }
  | {
      readonly command: "update";
      readonly projectRoot: string;
      readonly component: string | null;
      readonly output: "text";
    };

type ContextCommandResult =
  | ContextOperationResult
  | ContextDiffResult
  | ContextInspection
  | ContextDoctorResult;

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function parseContextInstallerArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextInstallerArguments {
  const positionals: string[] = [];
  let projectRoot = currentDirectory;
  let json = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--cwd") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, value);
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else if (!argument || argument.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${argument ?? ""}.`);
    } else {
      positionals.push(argument);
    }
  }

  const command = positionals[0];
  if (
    command !== "inspect" &&
    command !== "init" &&
    command !== "add" &&
    command !== "diff" &&
    command !== "update" &&
    command !== "remove" &&
    command !== "doctor"
  ) {
    throw new Error(
      "Usage: pnpm agent-context <inspect|init|add COMPONENT|diff|update [COMPONENT]|remove COMPONENT|doctor> [--cwd PROJECT] [--json].",
    );
  }
  if (json && command !== "inspect" && command !== "diff" && command !== "doctor") {
    throw new Error(`--json is read-only and cannot be used with agent-context ${command}.`);
  }
  if (command === "add" || command === "remove") {
    const component = positionals[1];
    if (!component) throw new Error(`agent-context ${command} requires a component name.`);
    if (positionals.length > 2) throw new Error(`agent-context ${command} received too many arguments.`);
    return { command, projectRoot, component, output: "text" };
  }
  if (command === "update") {
    if (positionals.length > 2) throw new Error("agent-context update received too many arguments.");
    return { command, projectRoot, component: positionals[1] ?? null, output: "text" };
  }
  if (positionals[1]) throw new Error(`agent-context ${command} does not accept a component name.`);
  if (command === "init") return { command, projectRoot, component: null, output: "text" };
  return { command, projectRoot, component: null, output: json ? "json" : "text" };
}

export function formatContextResult(result: ContextCommandResult): string {
  const lines = [`${result.command}: ${result.projectRoot}`];
  if (result.command === "inspect") {
    lines.push(`initialized: ${result.initialized ? "yes" : "no"}`);
    lines.push(`registry: ${result.registryRevision}`);
    lines.push(`components: ${result.selectedComponents.join(", ") || "none"}`);
    lines.push(`AGENTS.md: ${result.hasAgents ? "present" : "absent"}`);
    lines.push(`Codex config: ${result.hasCodexConfig ? "present" : "absent"}`);
    lines.push(`Codex hooks: ${result.hasCodexHooks ? "present" : "absent"}`);
    return lines.join("\n");
  }
  if (result.command === "doctor") {
    lines.push(`health: ${result.health}`);
    lines.push(...result.diagnostics.map((diagnostic) => `- ${diagnostic}`));
    return lines.join("\n");
  }
  for (const assessment of result.plan.assessments) lines.push(formatAssessment(assessment));
  if (result.command === "diff") {
    lines.push(result.current ? "current: no installation differences" : "different: installation differs");
  } else if (result.plan.status === "blocked") {
    lines.push("blocked: no files were written");
  } else if (result.writtenPaths.length === 0) {
    lines.push("unchanged: no files were written");
  } else {
    lines.push(`written: ${result.writtenPaths.join(", ")}`);
  }
  return lines.join("\n");
}

function formatAssessment(assessment: ArtifactAssessment): string {
  const lines = [
    `${assessment.status}: ${assessment.targetPath} [${assessment.component}] (${assessment.detail})`,
  ];
  if (assessment.difference) lines.push(indent(assessment.difference));
  return lines.join("\n");
}

function indent(value: string): string {
  return value.split("\n").map((line) => `  ${line}`).join("\n").trimEnd();
}

async function execute(arguments_: ContextInstallerArguments): Promise<ContextCommandResult> {
  switch (arguments_.command) {
    case "inspect":
      return await inspectProject(arguments_.projectRoot, frameworkRoot);
    case "init":
      return await initProject(arguments_.projectRoot, frameworkRoot);
    case "add":
      return await addComponent(arguments_.projectRoot, frameworkRoot, arguments_.component);
    case "diff":
      return await diffProject(arguments_.projectRoot, frameworkRoot);
    case "update":
      return await updateProject(arguments_.projectRoot, frameworkRoot, arguments_.component);
    case "remove":
      return await removeComponent(arguments_.projectRoot, frameworkRoot, arguments_.component);
    case "doctor":
      return await doctorProject(arguments_.projectRoot, frameworkRoot);
  }
}

async function main(): Promise<void> {
  const arguments_ = parseContextInstallerArguments(process.argv.slice(2), process.cwd());
  const result = await execute(arguments_);
  console.log(arguments_.output === "json" ? JSON.stringify(result, null, 2) : formatContextResult(result));
  if (
    ("plan" in result && result.plan.status === "blocked") ||
    (result.command === "diff" && !result.current) ||
    (result.command === "doctor" && result.health === "attention")
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
