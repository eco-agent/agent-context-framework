import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  addComponent,
  initProject,
  inspectProject,
  loadContextRegistry,
  type ContextOperationResult,
} from "./context-installer.js";
import {
  parseSetupInstallCommand,
  type SetupComponentSummary,
  type SetupInstallOutcome,
  type SetupSnapshot,
} from "./setup-contract.js";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = 64 * 1024;

export interface SetupServerOptions {
  readonly projectRoot: string;
  readonly frameworkRoot: string;
  readonly port: number;
  readonly openBrowser: boolean;
  readonly token?: string;
  readonly clientRoot?: string;
}

export interface RunningSetupServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

export async function readSetupSnapshot(
  projectRoot: string,
  frameworkRoot: string,
): Promise<SetupSnapshot> {
  const [inspection, registry] = await Promise.all([
    inspectProject(projectRoot, frameworkRoot),
    loadContextRegistry(frameworkRoot),
  ]);
  const components: readonly SetupComponentSummary[] = registry.components.map((component) => ({
    name: component.name,
    dependencies: component.dependencies,
    capabilities: component.capabilities,
    licenseCount: component.licenses.length,
  }));
  return {
    status: "ready",
    projectRoot: inspection.projectRoot,
    initialized: inspection.initialized,
    registryRevision: inspection.registryRevision,
    selectedComponents: inspection.selectedComponents,
    components,
  };
}

export async function installSetupComponents(
  projectRoot: string,
  frameworkRoot: string,
  input: unknown,
): Promise<SetupInstallOutcome> {
  let snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  const command = parseSetupInstallCommand(
    input,
    new Set(snapshot.components.map((component) => component.name)),
  );
  const writtenPaths = new Set<string>();

  if (!snapshot.initialized) {
    const initialized = await initProject(projectRoot, frameworkRoot);
    const blocked = await blockedOutcome(initialized, projectRoot, frameworkRoot);
    if (blocked !== null) return blocked;
    for (const writtenPath of initialized.writtenPaths) writtenPaths.add(writtenPath);
    snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  }

  for (const component of command.components) {
    if (snapshot.selectedComponents.includes(component)) continue;
    const result = await addComponent(projectRoot, frameworkRoot, component);
    const blocked = await blockedOutcome(result, projectRoot, frameworkRoot);
    if (blocked !== null) return blocked;
    for (const writtenPath of result.writtenPaths) writtenPaths.add(writtenPath);
    snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  }

  return {
    status: "applied",
    snapshot,
    writtenPaths: [...writtenPaths],
  };
}

export async function startSetupServer(options: SetupServerOptions): Promise<RunningSetupServer> {
  const projectRoot = await realpath(options.projectRoot);
  const frameworkRoot = await realpath(options.frameworkRoot);
  const clientRoot = await realpath(
    options.clientRoot ?? path.join(frameworkRoot, "tools", "setup-ui", "dist", "client"),
  ).catch((error: unknown) => {
    throw new Error(
      "Setup UI assets are missing. Run pnpm --filter @agent-context/setup-ui build first.",
      { cause: error },
    );
  });
  const token = options.token ?? randomBytes(32).toString("base64url");
  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      projectRoot,
      frameworkRoot,
      clientRoot,
      token,
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Setup server did not bind a TCP address.");
  }
  const url = `http://${LOOPBACK_HOST}:${address.port}/?token=${encodeURIComponent(token)}`;
  if (options.openBrowser) openSetupBrowser(url);
  return {
    url,
    port: address.port,
    close: async () => await closeServer(server),
  };
}

interface RequestContext {
  readonly projectRoot: string;
  readonly frameworkRoot: string;
  readonly clientRoot: string;
  readonly token: string;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
): Promise<void> {
  try {
    setSecurityHeaders(response);
    const requestUrl = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (requestUrl.pathname === "/api/setup" && request.method === "GET") {
      requireApiToken(request, context.token);
      sendJson(response, 200, await readSetupSnapshot(context.projectRoot, context.frameworkRoot));
      return;
    }
    if (requestUrl.pathname === "/api/install" && request.method === "POST") {
      requireApiToken(request, context.token);
      const outcome = await installSetupComponents(
        context.projectRoot,
        context.frameworkRoot,
        await readJsonBody(request),
      );
      sendJson(response, outcome.status === "blocked" ? 409 : 200, outcome);
      return;
    }
    if (request.method !== "GET") {
      sendText(response, 405, "Method not allowed.");
      return;
    }
    if (requestUrl.pathname === "/") {
      if (!tokensEqual(requestUrl.searchParams.get("token") ?? "", context.token)) {
        sendText(response, 403, "Invalid setup launch token.");
        return;
      }
      await sendFile(response, path.join(context.clientRoot, "index.html"));
      return;
    }
    if (requestUrl.pathname.startsWith("/assets/")) {
      const assetPath = safeAssetPath(context.clientRoot, requestUrl.pathname);
      await sendFile(response, assetPath);
      return;
    }
    sendText(response, 404, "Not found.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Invalid setup") ? 403 :
      message.startsWith("Setup install request") || message.startsWith("Unknown setup") ? 400 :
      message === "Request body is too large." ? 413 : 500;
    sendText(response, status, message);
  }
}

async function blockedOutcome(
  result: ContextOperationResult,
  projectRoot: string,
  frameworkRoot: string,
): Promise<SetupInstallOutcome | null> {
  if (result.plan.status !== "blocked") return null;
  return {
    status: "blocked",
    snapshot: await readSetupSnapshot(projectRoot, frameworkRoot),
    conflicts: result.plan.conflicts.map((conflict) => ({
      targetPath: conflict.targetPath,
      status: conflict.status,
      detail: conflict.detail,
    })),
  };
}

function requireApiToken(request: IncomingMessage, expected: string): void {
  const supplied = request.headers["x-agent-context-token"];
  if (typeof supplied !== "string" || !tokensEqual(supplied, expected)) {
    throw new Error("Invalid setup API token.");
  }
}

function tokensEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("Setup install request must be valid JSON.", { cause: error });
  }
}

function safeAssetPath(clientRoot: string, pathname: string): string {
  const relative = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(clientRoot, relative);
  const inside = path.relative(clientRoot, resolved);
  if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    throw new Error("Invalid setup asset path.");
  }
  return resolved;
}

async function sendFile(response: ServerResponse, filePath: string): Promise<void> {
  const content = await readFile(filePath);
  const extension = path.extname(filePath);
  const contentType = extension === ".html" ? "text/html; charset=utf-8" :
    extension === ".css" ? "text/css; charset=utf-8" :
    extension === ".js" ? "text/javascript; charset=utf-8" :
    "application/octet-stream";
  response.writeHead(200, { "content-type": contentType, "content-length": content.byteLength });
  response.end(content);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": body.byteLength });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, value: string): void {
  if (response.headersSent) return;
  const body = Buffer.from(`${value}\n`);
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": body.byteLength });
  response.end(body);
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function openSetupBrowser(url: string): void {
  const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}
