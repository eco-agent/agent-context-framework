import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

test("repository-context MCP initializes, lists, reads, and fixed-string searches over stdio", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-mcp-"));
  const cli = fileURLToPath(new URL("../src/mcp-cli.js", import.meta.url));
  await writeFile(path.join(root, "source.txt"), "alpha\nneedle\nomega\n", "utf8");
  const session = startMcp(cli, root);
  try {
    const initialized = await session.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "agent-context-test", version: "1.0.0" },
    });
    assert.equal(initialized.error, undefined);
    assert.equal(record(initialized.result).protocolVersion, "2025-11-25");
    session.notify("notifications/initialized", {});

    const listed = await session.request("tools/list", {});
    const tools = array(record(listed.result).tools);
    assert.equal(tools.length, 1);
    assert.equal(record(tools[0]).name, "repo_context");

    const read = await session.request("tools/call", {
      name: "repo_context",
      arguments: { operation: "read", path: "source.txt" },
    });
    assert.equal(read.error, undefined);
    assert.match(toolText(read.result), /alpha\nneedle\nomega/u);
    assert.match(toolText(read.result), /outcome=success/u);

    const search = await session.request("tools/call", {
      name: "repo_context",
      arguments: {
        operation: "search",
        path: ".",
        query: "needle",
        maxMatches: 50,
        contextLines: 10,
      },
    });
    assert.equal(search.error, undefined);
    assert.match(toolText(search.result), /source\.txt:2:needle/u);

    const unbounded = await session.request("tools/call", {
      name: "repo_context",
      arguments: { operation: "read", path: "source.txt", all: true },
    });
    assert.equal(record(unbounded.result).isError, true);
  } finally {
    await session.close();
    await rm(root, { recursive: true, force: true });
  }
});

function startMcp(
  cli: string,
  root: string,
): {
  readonly request: (method: string, params: unknown) => Promise<JsonRpcResponse>;
  readonly notify: (method: string, params: unknown) => void;
  readonly close: () => Promise<void>;
} {
  const child = spawn(process.execPath, [cli, "--root", root], {
    cwd: root,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, (response: JsonRpcResponse) => void>();
  const stderr: Buffer[] = [];
  let nextId = 1;
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const response = decodeResponse(line);
    pending.get(response.id)?.(response);
    pending.delete(response.id);
  });
  const send = (message: unknown): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  return {
    request: async (method, params) => {
      const id = nextId;
      nextId += 1;
      const response = new Promise<JsonRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for MCP response ${id}: ${Buffer.concat(stderr).toString("utf8")}`));
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

function decodeResponse(source: string): JsonRpcResponse {
  const value: unknown = JSON.parse(source);
  const response = record(value);
  if (response.jsonrpc !== "2.0" || typeof response.id !== "number") {
    throw new Error("MCP response is not a JSON-RPC response.");
  }
  return {
    jsonrpc: "2.0",
    id: response.id,
    ...(Object.hasOwn(response, "result") ? { result: response.result } : {}),
    ...(Object.hasOwn(response, "error") ? { error: response.error } : {}),
  };
}

function toolText(result: unknown): string {
  const content = array(record(result).content);
  const first = record(content[0]);
  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error("MCP tool result does not contain text content.");
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
