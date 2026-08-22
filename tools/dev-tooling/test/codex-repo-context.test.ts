import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";
import { parse as parseToml } from "smol-toml";

import {
  addComponent,
  diffProject,
  initProject,
  removeComponent,
} from "../src/context-installer.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

interface RepoContextConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly required: boolean;
  readonly enabled_tools: readonly string[];
  readonly startup_timeout_sec: number;
  readonly tool_timeout_sec: number;
}

test("codex-repo-context resolves the isolated bounded package and local MCP table", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(
    resolveContextComponents(registry, ["codex-repo-context"]).map((component) => component.name),
    ["core", "runtime-base", "codex-repo-context"],
  );
  const component = registry.components.find((candidate) => candidate.name === "codex-repo-context");
  assert.ok(component);
  assert.deepEqual(component.capabilities, [
    { kind: "runtime", name: "ripgrep", requirement: "required" },
  ]);
  const configArtifact = component.artifacts.find((artifact) => artifact.operation === "toml-tables");
  assert.ok(configArtifact?.operation === "toml-tables");
  assert.deepEqual(configArtifact.ownedTables, ["mcp_servers.repo_context"]);
  const config = parseToml(await readFile(
    path.join(frameworkRoot, "registry", "sources", "codex", "repo-context.toml"),
    "utf8",
  ));
  const repoContextConfig = decodeRepoContextConfig(
    record(record(config).mcp_servers).repo_context,
  );
  assert.deepEqual(repoContextConfig, {
    command: "node",
    args: [".agent-context/runtime/packages/repo-context/dist/src/mcp-cli.js", "--root", "."],
    required: true,
    enabled_tools: ["repo_context"],
    startup_timeout_sec: 20,
    tool_timeout_sec: 15,
  });
  assert.equal(Object.hasOwn(record(record(record(config).mcp_servers).repo_context), "cwd"), false);
  const serialized = JSON.stringify(repoContextConfig);
  assert.equal(serialized.includes("tools/"), false);
  assert.equal(serialized.includes("tsx"), false);
  assert.equal(serialized.includes("--all"), false);
  assert.equal(/[A-Za-z]:\\/u.test(serialized), false);
});

test("installed repository-context MCP stays host-neutral and serves the configured entrypoint", { timeout: 90_000 }, async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-repo-"));
  try {
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".codex", "config.toml"),
      '[mcp_servers.local]\ncommand = "local-server"\n',
      "utf8",
    );
    await writeFile(path.join(projectRoot, "README.md"), "bounded fixture context\n", "utf8");
    await initProject(projectRoot, frameworkRoot);
    const added = await addComponent(projectRoot, frameworkRoot, "codex-repo-context");
    assert.equal(added.plan.status, "ready");
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    assert.deepEqual(
      (await readdir(path.join(projectRoot, ".agent-context", "runtime", "packages"))).sort(),
      ["repo-context", "shared"],
    );
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);
    const bootstrapped = await bootstrapRuntime({ projectRoot, mode: "install-and-build" });
    assert.equal(bootstrapped.status, "operational");
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);

    const installedConfig = parseToml(
      await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8"),
    );
    const installedServers = record(record(installedConfig).mcp_servers);
    assert.equal(record(installedServers.local).command, "local-server");
    const configured = decodeRepoContextConfig(installedServers.repo_context);
    const entrypoint = path.join(projectRoot, configured.args[0] ?? "");
    const session = startMcp(entrypoint, configured.args.slice(1), projectRoot);
    try {
      const initialized = await session.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "installed-fixture", version: "1.0.0" },
      });
      assert.equal(initialized.error, undefined);
      session.notify("notifications/initialized", {});
      const listed = await session.request("tools/list", {});
      const tools = array(record(listed.result).tools);
      assert.deepEqual(tools.map((tool) => record(tool).name), ["repo_context"]);
      const called = await session.request("tools/call", {
        name: "repo_context",
        arguments: { operation: "read", path: "README.md" },
      });
      assert.match(toolText(called.result), /bounded fixture context/u);
    } finally {
      await session.close();
    }

    const removed = await removeComponent(projectRoot, frameworkRoot, "codex-repo-context");
    assert.equal(removed.plan.status, "ready");
    const retained = parseToml(
      await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8"),
    );
    const retainedServers = record(record(retained).mcp_servers);
    assert.equal(record(retainedServers.local).command, "local-server");
    assert.equal(retainedServers.repo_context, undefined);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

interface RpcResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

function startMcp(
  entrypoint: string,
  arguments_: readonly string[],
  cwd: string,
): {
  readonly request: (method: string, params: unknown) => Promise<RpcResponse>;
  readonly notify: (method: string, params: unknown) => void;
  readonly close: () => Promise<void>;
} {
  const child = spawn(process.execPath, [entrypoint, ...arguments_], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, (response: RpcResponse) => void>();
  const stderr: Buffer[] = [];
  let nextId = 1;
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const value: unknown = JSON.parse(line);
    const response = record(value);
    if (typeof response.id !== "number") return;
    pending.get(response.id)?.({
      id: response.id,
      ...(Object.hasOwn(response, "result") ? { result: response.result } : {}),
      ...(Object.hasOwn(response, "error") ? { error: response.error } : {}),
    });
    pending.delete(response.id);
  });
  const send = (message: unknown): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  return {
    request: async (method, params) => {
      const id = nextId;
      nextId += 1;
      const response = new Promise<RpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for installed MCP: ${Buffer.concat(stderr).toString("utf8")}`));
        }, 10_000);
        pending.set(id, (value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
      send({ jsonrpc: "2.0", id, method, params });
      return await response;
    },
    notify: (method, params) => send({ jsonrpc: "2.0", method, params }),
    close: async () => await closeChild(child),
  };
}

async function closeChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 5_000);
  await closed;
  clearTimeout(timer);
}

function toolText(result: unknown): string {
  const content = array(record(result).content);
  const first = record(content[0]);
  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Installed MCP tool result does not contain text.");
  }
  return first.text;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function decodeRepoContextConfig(value: unknown): RepoContextConfig {
  const config = record(value);
  const args = array(config.args);
  const enabledTools = array(config.enabled_tools);
  if (
    typeof config.command !== "string" ||
    args.some((item) => typeof item !== "string") ||
    typeof config.required !== "boolean" ||
    enabledTools.some((item) => typeof item !== "string") ||
    typeof config.startup_timeout_sec !== "number" ||
    typeof config.tool_timeout_sec !== "number"
  ) {
    throw new Error("Repository-context MCP config is invalid.");
  }
  return {
    command: config.command,
    args: args.map((item) => String(item)),
    required: config.required,
    enabled_tools: enabledTools.map((item) => String(item)),
    startup_timeout_sec: config.startup_timeout_sec,
    tool_timeout_sec: config.tool_timeout_sec,
  };
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
