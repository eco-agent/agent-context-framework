import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import { parse as parseToml } from "smol-toml";

import { inspectInstalledCodexInterface } from "./codex-interface.js";
import { bootstrapRuntime } from "./runtime-bootstrap.js";

export interface InstalledCodexRuntimeVerification {
  readonly schemaVersion: 1;
  readonly references: "project-local";
  readonly trustRequired: true;
  readonly runtime: "operational";
  readonly hooks: "inert-without-binding";
  readonly mcp: "initialize-list-read-search";
}

export async function verifyInstalledCodexRuntime(
  projectRoot: string,
): Promise<InstalledCodexRuntimeVerification> {
  const health = await inspectInstalledCodexInterface(projectRoot, ["codex-runtime"]);
  if (!health?.ok) throw new Error(health?.diagnostics.join(" ") ?? "Codex runtime is not installed.");
  const runtime = await bootstrapRuntime({ projectRoot, mode: "no-install" });
  if (!runtime.operational) throw new Error(`Installed runtime is not operational: ${runtime.message}`);

  const hooks = JSON.parse(await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string; commandWindows: string }> }> };
  };
  const owned = hooks.hooks.PreToolUse.find((candidate) => candidate.matcher === "^apply_patch$")?.hooks[0];
  if (!owned) throw new Error("Installed apply_patch hook is missing.");
  const command = process.platform === "win32" ? owned.commandWindows : owned.command;
  const input = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    session_id: "wave-four-verification-missing-binding",
    tool_input: { command: "*** Update File: README.md" },
  });
  for (const cwd of [projectRoot, path.join(projectRoot, ".agent-context")]) {
    const result = await runShell(command, cwd, input);
    if (result.code !== 0 || result.stdout.trim() !== "") {
      throw new Error(`Installed hook was not inert from ${cwd}: ${result.stderr || result.stdout}`);
    }
  }

  const config = record(parseToml(await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8")));
  const server = record(record(config.mcp_servers).repo_context);
  const args = array(server.args).map(String);
  const entrypoint = path.join(projectRoot, args[0] ?? "");
  const session = startMcp(entrypoint, args.slice(1), projectRoot);
  try {
    await requireRpcSuccess(session.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "wave-four-verifier", version: "1.0.0" },
    }), "initialize");
    session.notify("notifications/initialized", {});
    const listed = await requireRpcSuccess(session.request("tools/list", {}), "tools/list");
    if (array(record(listed).tools).map((tool) => record(tool).name).join(",") !== "repo_context") {
      throw new Error("Installed MCP did not expose only repo_context.");
    }
    await requireRpcSuccess(session.request("tools/call", {
      name: "repo_context",
      arguments: { operation: "read", path: "README.md" },
    }), "read");
    await requireRpcSuccess(session.request("tools/call", {
      name: "repo_context",
      arguments: { operation: "search", query: "Wave 4" },
    }), "search");
  } finally {
    await session.close();
  }

  return {
    schemaVersion: 1,
    references: "project-local",
    trustRequired: true,
    runtime: "operational",
    hooks: "inert-without-binding",
    mcp: "initialize-list-read-search",
  };
}

async function runShell(command: string, cwd: string, input: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({
      code: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

interface RpcResponse { readonly result?: unknown; readonly error?: unknown }

function startMcp(entrypoint: string, args: readonly string[], cwd: string): {
  request(method: string, params: unknown): Promise<RpcResponse>;
  notify(method: string, params: unknown): void;
  close(): Promise<void>;
} {
  const child = spawn(process.execPath, [entrypoint, ...args], { cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map<number, (response: RpcResponse) => void>();
  const stderr: Buffer[] = [];
  let nextId = 1;
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const response = record(JSON.parse(line) as unknown);
    if (typeof response.id !== "number") return;
    pending.get(response.id)?.({ result: response.result, error: response.error });
    pending.delete(response.id);
  });
  const send = (value: unknown): void => { child.stdin.write(`${JSON.stringify(value)}\n`); };
  return {
    request: async (method, params) => {
      const id = nextId++;
      const response = new Promise<RpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for installed MCP: ${Buffer.concat(stderr).toString("utf8")}`));
        }, 10_000);
        pending.set(id, (value) => { clearTimeout(timer); resolve(value); });
      });
      send({ jsonrpc: "2.0", id, method, params });
      return await response;
    },
    notify: (method, params) => send({ jsonrpc: "2.0", method, params }),
    close: async () => await closeChild(child),
  };
}

async function requireRpcSuccess(response: Promise<RpcResponse>, label: string): Promise<unknown> {
  const resolved = await response;
  if (resolved.error !== undefined) throw new Error(`Installed MCP ${label} failed: ${JSON.stringify(resolved.error)}`);
  return resolved.result;
}

async function closeChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 5_000);
  await closed;
  clearTimeout(timer);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : {};
}

function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
