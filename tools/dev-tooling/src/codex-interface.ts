import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ContextRegistryV2 } from "@agent-context/repo-policy";
import { parse as parseToml } from "smol-toml";

const WAVE_FOUR_COMPONENTS = new Set([
  "codex-agents",
  "codex-hooks",
  "codex-repo-context",
  "codex-runtime",
]);

export interface CodexInterfaceHealth {
  readonly status: "ready" | "invalid";
  readonly ok: boolean;
  readonly trustRequired: true;
  readonly diagnostics: readonly string[];
}

export interface ContextActivationDisclosure {
  readonly id: "codex-project-trust" | "codex-hooks-session-binding";
  readonly status: "required" | "dormant";
  readonly message: string;
}

export function codexInterfaceSelectionDisclosures(
  resolvedComponents: readonly string[],
): readonly ContextActivationDisclosure[] {
  const selected = new Set(resolvedComponents);
  const disclosures: ContextActivationDisclosure[] = [];
  if ([...selected].some((component) => WAVE_FOUR_COMPONENTS.has(component))) {
    disclosures.push({
      id: "codex-project-trust",
      status: "required",
      message: "Codex must trust this repository before it loads project-scoped configuration.",
    });
  }
  if (selected.has("codex-hooks") || selected.has("codex-runtime")) {
    disclosures.push({
      id: "codex-hooks-session-binding",
      status: "dormant",
      message: "Hooks emit no decision until a valid scoped session binding exists; no binding producer is distributed.",
    });
  }
  return disclosures;
}

export async function validateWaveFourRegistryReferences(
  frameworkRoot: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const artifacts = registry.components
    .filter((component) => WAVE_FOUR_COMPONENTS.has(component.name))
    .flatMap((component) => component.artifacts.map((artifact) => ({ component: component.name, artifact })));
  for (const { component, artifact } of artifacts) {
    if (artifact.operation === "runtime-workspace") continue;
    const source = await readFile(path.join(frameworkRoot, artifact.sourcePath), "utf8");
    const diagnostics = unsafeReferenceDiagnostics(source);
    if (diagnostics.length > 0) {
      throw new Error(`Wave 4 source ${artifact.sourcePath} is not project-local: ${diagnostics.join(" ")}`);
    }
    if (artifact.targetPath === ".codex/config.toml") {
      const parsed = record(parseToml(source));
      if (Object.hasOwn(parsed, "hooks")) {
        throw new Error(`Wave 4 source ${artifact.sourcePath} declares duplicate inline hooks.`);
      }
    }
    if (component === "codex-hooks" && artifact.targetPath === ".codex/hooks.json") {
      validateHookDocument(JSON.parse(source) as unknown, artifact.sourcePath);
    }
  }
}

export async function inspectInstalledCodexInterface(
  projectRoot: string,
  selectedComponents: readonly string[],
): Promise<CodexInterfaceHealth | null> {
  const selected = new Set(selectedComponents);
  if (![...selected].some((component) => WAVE_FOUR_COMPONENTS.has(component))) return null;
  const diagnostics: string[] = [];
  const includes = (component: string): boolean => selected.has(component) || selected.has("codex-runtime");

  try {
    const configSource = await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8");
    diagnostics.push(...unsafeReferenceDiagnostics(configSource));
    const config = record(parseToml(configSource));
    if (Object.hasOwn(config, "hooks")) diagnostics.push("Codex hooks must exist only in .codex/hooks.json, not inline config.");
    if (includes("codex-agents")) validateInstalledAgents(config, diagnostics);
    if (includes("codex-repo-context")) validateInstalledRepoContext(config, diagnostics);
  } catch (error) {
    diagnostics.push(`Codex config is unreadable: ${message(error)}`);
  }

  if (includes("codex-hooks")) {
    try {
      const hooksSource = await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8");
      diagnostics.push(...unsafeReferenceDiagnostics(hooksSource));
      validateHookDocument(JSON.parse(hooksSource) as unknown, ".codex/hooks.json");
    } catch (error) {
      diagnostics.push(`Codex hooks are invalid: ${message(error)}`);
    }
  }

  if (includes("codex-agents")) {
    const expected = new Map([
      ["default", ["gpt-5.6-sol", "high"]],
      ["scout", ["gpt-5.6-luna", "max"]],
      ["worker", ["gpt-5.6-luna", "max"]],
    ] as const);
    for (const [name, [model, effort]] of expected) {
      try {
        const profile = record(parseToml(await readFile(
          path.join(projectRoot, ".codex", "agents", `${name}.toml`),
          "utf8",
        )));
        if (profile.model !== model || profile.model_reasoning_effort !== effort) {
          diagnostics.push(`Agent ${name} must explicitly select ${model} with ${effort} reasoning.`);
        }
      } catch (error) {
        diagnostics.push(`Agent ${name} profile is unreadable: ${message(error)}`);
      }
    }
  }

  return {
    status: diagnostics.length === 0 ? "ready" : "invalid",
    ok: diagnostics.length === 0,
    trustRequired: true,
    diagnostics: [
      "Codex must trust this project before it loads project-scoped configuration.",
      ...diagnostics,
    ],
  };
}

export function unsafeReferenceDiagnostics(source: string): readonly string[] {
  const diagnostics: string[] = [];
  const rules: readonly [RegExp, string][] = [
    [/(?:^|[\s"'])(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|opt|srv|var|tmp)\/)/u, "Absolute framework or host paths are forbidden."],
    [/(?:^|[\s"'])~[\\/]?\.codex(?:[\\/]|\b)/u, "User-global ~/.codex configuration is forbidden."],
    [/(?:^|[\s"'])tools[\\/]/u, "Host tools/ workspace entrypoints are forbidden."],
    [/\btsx\b/u, "tsx entrypoints are forbidden."],
    [/--filter\b/u, "Host workspace package filters are forbidden."],
  ];
  for (const [pattern, diagnostic] of rules) if (pattern.test(source)) diagnostics.push(diagnostic);
  for (const match of source.matchAll(/\.agent-context[\\/]runtime[\\/][^\s"']*/gu)) {
    if (match[0].split(/[\\/]/u).includes("..")) {
      diagnostics.push("Runtime references may not escape .agent-context/runtime.");
      break;
    }
  }
  return diagnostics;
}

function validateInstalledAgents(config: Readonly<Record<string, unknown>>, diagnostics: string[]): void {
  const agents = record(config.agents);
  if (agents.max_concurrent_threads_per_session !== 2) diagnostics.push("Codex agent concurrency must be 2.");
  for (const name of ["default", "scout", "worker"] as const) {
    const role = record(agents[name]);
    if (role.config_file !== `./agents/${name}.toml`) {
      diagnostics.push(`Agent ${name} config_file must remain project-local.`);
    }
  }
}

function validateInstalledRepoContext(config: Readonly<Record<string, unknown>>, diagnostics: string[]): void {
  const server = record(record(config.mcp_servers).repo_context);
  const args = array(server.args);
  if (
    server.command !== "node" ||
    args[0] !== ".agent-context/runtime/packages/repo-context/dist/src/mcp-cli.js" ||
    args[1] !== "--root" || args[2] !== "." || args.length !== 3 ||
    server.cwd !== "." || server.required !== true ||
    JSON.stringify(server.enabled_tools) !== JSON.stringify(["repo_context"]) ||
    typeof server.startup_timeout_sec !== "number" || typeof server.tool_timeout_sec !== "number"
  ) {
    diagnostics.push("Repository-context MCP configuration must use the bounded project-local entrypoint and allowlist.");
  }
}

function validateHookDocument(value: unknown, label: string): void {
  const hooks = record(record(value).hooks);
  for (const [event, matcher] of [["PreToolUse", "^apply_patch$"], ["SessionStart", "^compact$"]] as const) {
    const matches = array(hooks[event]).filter((candidate) => record(candidate).matcher === matcher);
    if (matches.length !== 1) throw new Error(`${label} must contain exactly one ${event} matcher ${matcher}.`);
    for (const hook of array(record(matches[0]).hooks)) {
      const command = record(hook);
      for (const key of ["command", "commandWindows"] as const) {
        const value = command[key];
        if (typeof value !== "string" || !value.includes(".agent-context/runtime/packages/hooks/dist/src/codex-cli.js")) {
          throw new Error(`${label} ${event} ${key} must use the project-local installed hook entrypoint.`);
        }
      }
    }
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
