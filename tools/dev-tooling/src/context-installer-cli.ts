import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addComponent,
  diffProject,
  doctorProject,
  initProject,
  inspectProject,
  planProjectSelection,
  recoverProject,
  removeComponent,
  updateProject,
  type ArtifactAssessment,
  type ContextDiffResult,
  type ContextDoctorResult,
  type ContextInspection,
  type ContextOperationResult,
  type ContextRecoveryResult,
  type ContextSelectionPreview,
  type ContextUpdateMode,
} from "./context-installer.js";
import {
  bootstrapRuntime,
  type RuntimeBootstrapMode,
  type RuntimeBootstrapResult,
} from "./runtime-bootstrap.js";
import { startSetupServer } from "./setup-server.js";
import { checkContextRegistry } from "./context-registry-builder.js";
import {
  CONTEXT_CAPSULE_HELP,
  runContextCapsuleCli,
} from "./context-capsule-cli.js";

type ContextInstallerArguments =
  | {
      readonly command: "help";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text";
    }
  | {
      readonly command: "inspect" | "diff" | "doctor";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text" | "json";
    }
  | {
      readonly command: "plan";
      readonly projectRoot: string;
      readonly component: null;
      readonly components: readonly string[];
      readonly output: "text" | "json";
    }
  | {
      readonly command: "init" | "recover";
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
      readonly mode: ContextUpdateMode;
    }
  | {
      readonly command: "bootstrap-runtime";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text";
      readonly mode: RuntimeBootstrapMode;
    }
  | {
      readonly command: "setup";
      readonly projectRoot: string;
      readonly component: null;
      readonly output: "text";
      readonly port: number;
      readonly openBrowser: boolean;
      readonly exitAfterInstall: boolean;
    };

type ExecutableContextArguments = Exclude<
  ContextInstallerArguments,
  { readonly command: "help" | "setup" }
>;

type ContextCommandResult =
  | ContextOperationResult
  | ContextDiffResult
  | ContextInspection
  | ContextDoctorResult
  | ContextRecoveryResult
  | ContextSelectionPreview
  | RuntimeBootstrapResult;

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const CONTEXT_INSTALLER_HELP = `Agent Context Framework

Usage:
  pnpm agent-context init [--cwd PROJECT]
  pnpm agent-context inspect [--cwd PROJECT] [--json]
  pnpm agent-context plan [COMPONENT...] [--cwd PROJECT] [--json]
  pnpm agent-context diff [--cwd PROJECT] [--json]
  pnpm agent-context add COMPONENT [--cwd PROJECT]
  pnpm agent-context update [COMPONENT] [--overwrite] [--cwd PROJECT]
  pnpm agent-context remove COMPONENT [--cwd PROJECT]
  pnpm agent-context doctor [--cwd PROJECT] [--json]
  pnpm agent-context recover [--cwd PROJECT]
  pnpm agent-context bootstrap-runtime [--no-install] [--cwd PROJECT]
  pnpm agent-context setup [--port PORT] [--no-open] [--exit-after-install] [--cwd PROJECT]
  pnpm agent-context capsule <build|list|inspect|verify|diff|extract> [OPTIONS]
  pnpm agent-context help

Behavior:
  inspect, plan, diff, and doctor are read-only. plan resolves proposed additions
  through the real installer planner without writing. setup starts a token-protected
  loopback UI and installs through the same transactional materializer.
  --exit-after-install closes setup after a successful installation response.
  Normal update preserves local managed edits; --overwrite replaces only the
  selected registry-owned scopes. The CLI never pushes or deploys.`;

export function parseContextInstallerArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ContextInstallerArguments {
  const positionals: string[] = [];
  let projectRoot = currentDirectory;
  let json = false;
  let noInstall = false;
  let updateMode: ContextUpdateMode = "preserve-local";
  let setupPort: number | null = null;
  let openBrowser = true;
  let noOpen = false;
  let exitAfterInstall = false;
  let help = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--cwd") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--cwd requires a project path.");
      projectRoot = path.resolve(currentDirectory, value);
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else if (argument === "--no-install") {
      noInstall = true;
    } else if (argument === "--overwrite") {
      if (updateMode === "overwrite-selected") throw new Error("--overwrite may be specified only once.");
      updateMode = "overwrite-selected";
    } else if (argument === "--port") {
      const value = arguments_[index + 1];
      if (value === undefined) throw new Error("--port requires a number.");
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
        throw new Error("--port must be an integer from 0 through 65535.");
      }
      setupPort = parsed;
      index += 1;
    } else if (argument === "--no-open") {
      openBrowser = false;
      noOpen = true;
    } else if (argument === "--exit-after-install") {
      if (exitAfterInstall) throw new Error("--exit-after-install may be specified only once.");
      exitAfterInstall = true;
    } else if (!argument || argument.startsWith("-")) {
      throw new Error(`Unknown agent-context argument ${argument ?? ""}.`);
    } else {
      positionals.push(argument);
    }
  }

  const command = positionals[0];
  if (help || command === "help") {
    return { command: "help", projectRoot, component: null, output: "text" };
  }
  if (
    command !== "inspect" &&
    command !== "plan" &&
    command !== "init" &&
    command !== "add" &&
    command !== "diff" &&
    command !== "update" &&
    command !== "remove" &&
    command !== "doctor" &&
    command !== "recover" &&
    command !== "bootstrap-runtime" &&
    command !== "setup"
  ) {
    throw new Error(
      "Usage: pnpm agent-context <inspect|plan [COMPONENT...]|init|add COMPONENT|diff|update [COMPONENT] [--overwrite]|remove COMPONENT|doctor|recover|bootstrap-runtime [--no-install]|setup [--port PORT] [--no-open] [--exit-after-install]> [--cwd PROJECT] [--json].",
    );
  }
  if (json && command !== "inspect" && command !== "plan" && command !== "diff" && command !== "doctor") {
    throw new Error(`--json is read-only and cannot be used with agent-context ${command}.`);
  }
  if (noInstall && command !== "bootstrap-runtime") {
    throw new Error("--no-install is valid only with agent-context bootstrap-runtime.");
  }
  if (updateMode === "overwrite-selected" && command !== "update") {
    throw new Error("--overwrite is valid only with agent-context update.");
  }
  if (setupPort !== null && command !== "setup") {
    throw new Error("--port is valid only with agent-context setup.");
  }
  if (noOpen && command !== "setup") {
    throw new Error("--no-open is valid only with agent-context setup.");
  }
  if (exitAfterInstall && command !== "setup") {
    throw new Error("--exit-after-install is valid only with agent-context setup.");
  }
  if (command === "add" || command === "remove") {
    const component = positionals[1];
    if (!component) throw new Error(`agent-context ${command} requires a component name.`);
    if (positionals.length > 2) throw new Error(`agent-context ${command} received too many arguments.`);
    return { command, projectRoot, component, output: "text" };
  }
  if (command === "plan") {
    const components = positionals.slice(1);
    const duplicate = components.find((component, index) => components.indexOf(component) !== index);
    if (duplicate !== undefined) {
      throw new Error(`agent-context plan contains duplicate component ${duplicate}.`);
    }
    return {
      command,
      projectRoot,
      component: null,
      components,
      output: json ? "json" : "text",
    };
  }
  if (command === "update") {
    if (positionals.length > 2) throw new Error("agent-context update received too many arguments.");
    return { command, projectRoot, component: positionals[1] ?? null, output: "text", mode: updateMode };
  }
  if (positionals[1]) throw new Error(`agent-context ${command} does not accept a component name.`);
  if (command === "init" || command === "recover") {
    return { command, projectRoot, component: null, output: "text" };
  }
  if (command === "bootstrap-runtime") {
    return {
      command,
      projectRoot,
      component: null,
      output: "text",
      mode: noInstall ? "no-install" : "install-and-build",
    };
  }
  if (command === "setup") {
    return {
      command,
      projectRoot,
      component: null,
      output: "text",
      port: setupPort ?? 0,
      openBrowser,
      exitAfterInstall,
    };
  }
  return { command, projectRoot, component: null, output: json ? "json" : "text" };
}

export function formatContextResult(result: ContextCommandResult): string {
  const lines = [`${result.command}: ${result.projectRoot}`];
  if (result.command === "inspect") {
    lines.push(`initialized: ${result.initialized ? "yes" : "no"}`);
    lines.push(`registry: ${result.registryRevision}`);
    lines.push(...formatSelectionSummary(result.selection));
    lines.push(`AGENTS.md: ${result.hasAgents ? "present" : "absent"}`);
    lines.push(`Codex config: ${result.hasCodexConfig ? "present" : "absent"}`);
    lines.push(`Codex hooks: ${result.hasCodexHooks ? "present" : "absent"}`);
    return lines.join("\n");
  }
  if (result.command === "plan") {
    lines.push(...formatSelectionSummary(result));
    return lines.join("\n");
  }
  if (result.command === "bootstrap-runtime") {
    lines.push(`mode: ${result.mode}`);
    lines.push(`status: ${result.status}`);
    lines.push(`operational: ${result.operational ? "yes" : "no"}`);
    lines.push(result.message);
    return lines.join("\n");
  }
  if (result.command === "doctor") {
    lines.push(`health: ${result.health}`);
    if (result.runtime) {
      lines.push(`runtime: ${result.runtime.status}`);
    }
    if (result.repositoryPolicy) {
      lines.push(`repository policy: ${result.repositoryPolicy.status}`);
    }
    if (result.codexInterface) {
      lines.push(`Codex interface: ${result.codexInterface.status} (trusted project required)`);
    }
    lines.push(...result.diagnostics.map((diagnostic) => `- ${diagnostic}`));
    return lines.join("\n");
  }
  if (result.command === "recover") {
    lines.push(`status: ${result.status}`);
    if (result.recoveredPaths.length > 0) lines.push(`recovered: ${result.recoveredPaths.join(", ")}`);
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

function formatSelectionSummary(selection: ContextSelectionPreview): readonly string[] {
  const capabilities = selection.capabilities.map((capability) =>
    `${capability.requirement} ${capability.kind}:${capability.name}`);
  const licenses = selection.licenses.map((license) =>
    license.kind === "project"
      ? `${license.spdx} project notice ${license.noticePath}`
      : `${license.spdx} ${license.source}@${license.revision} notice ${license.noticePath}`);
  return [
    `selection: ${selection.status}`,
    `direct components: ${selection.directComponents.join(", ") || "none"}`,
    `requested additions: ${selection.requestedComponents.join(", ") || "none"}`,
    `resolved components: ${selection.resolvedComponents.join(", ") || "none"}`,
    `transitive components: ${selection.transitiveComponents.join(", ") || "none"}`,
    `bundles: ${selection.bundleComponents.join(", ") || "none"}`,
    `footprint: ${selection.footprint.componentCount} components, ${selection.footprint.artifactCount} artifacts, ` +
      `${selection.footprint.targetCount} targets, ${selection.footprint.skillTargetCount} skill targets, ` +
      `${selection.footprint.runtimeTargetCount} runtime targets`,
    `capabilities (${selection.capabilityAvailability}): ${capabilities.join(", ") || "none"}`,
    `licenses: ${licenses.join(", ") || "none"}`,
    `planned writes: ${selection.drift.plannedWritePaths.join(", ") || "none"}`,
    ...selection.drift.assessmentCounts.map((entry) => `assessment ${entry.status}: ${entry.count}`),
    ...selection.activations.map((activation) => `${activation.status} ${activation.id}: ${activation.message}`),
    ...selection.drift.conflicts.map((conflict) =>
      `conflict: ${conflict.targetPath} [${conflict.component}] (${conflict.detail})`),
  ];
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

async function execute(arguments_: ExecutableContextArguments): Promise<ContextCommandResult> {
  switch (arguments_.command) {
    case "inspect":
      return await inspectProject(arguments_.projectRoot, frameworkRoot);
    case "plan":
      return await planProjectSelection(
        arguments_.projectRoot,
        frameworkRoot,
        arguments_.components,
      );
    case "init":
      return await initProject(arguments_.projectRoot, frameworkRoot);
    case "add":
      return await addComponent(arguments_.projectRoot, frameworkRoot, arguments_.component);
    case "diff":
      return await diffProject(arguments_.projectRoot, frameworkRoot);
    case "update":
      return await updateProject(arguments_.projectRoot, frameworkRoot, arguments_.component, arguments_.mode);
    case "remove":
      return await removeComponent(arguments_.projectRoot, frameworkRoot, arguments_.component);
    case "doctor":
      return await doctorProject(arguments_.projectRoot, frameworkRoot);
    case "recover":
      return await recoverProject(arguments_.projectRoot);
    case "bootstrap-runtime":
      return await bootstrapRuntime({
        projectRoot: arguments_.projectRoot,
        mode: arguments_.mode,
      });
  }
}

async function main(): Promise<void> {
  const rawArguments = process.argv.slice(2);
  if (rawArguments[0] === "capsule") {
    if (rawArguments[1] === "help" || rawArguments[1] === "--help" || rawArguments[1] === "-h") {
      console.log(CONTEXT_CAPSULE_HELP);
      return;
    }
    if (rawArguments[1] === "build") await checkContextRegistry(frameworkRoot);
    const result = await runContextCapsuleCli(
      rawArguments.slice(1),
      process.cwd(),
      frameworkRoot,
    );
    console.log(result.output);
    process.exitCode = result.exitCode;
    return;
  }
  const arguments_ = parseContextInstallerArguments(rawArguments, process.cwd());
  if (arguments_.command === "help") {
    console.log(CONTEXT_INSTALLER_HELP);
    return;
  }
  if (arguments_.command === "setup") {
    await checkContextRegistry(frameworkRoot);
    const running = await startSetupServer({
      projectRoot: arguments_.projectRoot,
      frameworkRoot,
      port: arguments_.port,
      openBrowser: arguments_.openBrowser,
    });
    console.log(`Agent Context Setup: ${running.url}`);
    console.log(arguments_.exitAfterInstall
      ? "The setup server will close after a successful installation response."
      : "Press Ctrl+C to stop the local setup server.");
    await waitForSetupCompletion(running, arguments_.exitAfterInstall);
    return;
  }
  if (arguments_.command !== "recover" && arguments_.command !== "bootstrap-runtime") {
    await checkContextRegistry(frameworkRoot);
  }
  const result = await execute(arguments_);
  console.log(arguments_.output === "json" ? JSON.stringify(result, null, 2) : formatContextResult(result));
  if (
    ("plan" in result && result.plan.status === "blocked") ||
    (result.command === "diff" && !result.current) ||
    (result.command === "doctor" && result.health === "attention")
    || (result.command === "plan" && result.status === "blocked")
  ) {
    process.exitCode = 1;
  }
}

async function waitForSetupCompletion(
  running: { readonly applied: Promise<void>; close(): Promise<void> },
  exitAfterInstall: boolean,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void running.close().then(resolve, reject);
    };
    const shutdown = () => {
      finish();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    if (exitAfterInstall) void running.applied.then(finish, reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
