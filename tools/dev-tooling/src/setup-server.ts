import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  addComponent,
  DEFAULT_CONTEXT_COMPONENT,
  initProject,
  inspectProject,
  loadContextRegistry,
  planProjectSelection,
  type ContextOperationResult,
  type ContextSelectionPreview,
} from "./context-installer.js";
import { checkContextRegistry } from "./context-registry-builder.js";
import {
  componentKind,
  readSetupComponentDetail as readComponentDetail,
  recommendSetupComponents,
  setupComponentDisplayName,
  validateSetupSourceOverrides,
} from "./setup-component-preview.js";
import {
  MAX_SETUP_OVERRIDE_TOTAL_BYTES,
  parseSetupPlanCommand,
  parseSetupInstallCommand,
  type SetupSelectionPreview,
  type SetupComponentSummary,
  type SetupInstallOutcome,
  type SetupSnapshot,
} from "./setup-contract.js";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = MAX_SETUP_OVERRIDE_TOTAL_BYTES + 256 * 1024;

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
  readonly applied: Promise<void>;
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
    displayName: setupComponentDisplayName(component.name),
    kind: componentKind(component),
    dependencies: component.dependencies,
    capabilities: component.capabilities,
    licenseCount: component.licenses.length,
    artifactCount: component.artifacts.length,
  }));
  const installedDirectComponents = inspection.initialized
    ? inspection.selection.currentDirectComponents
    : [];
  const installedResolvedComponents = inspection.initialized
    ? inspection.selection.resolvedComponents
    : [];
  const recommendedComponents = (await recommendSetupComponents(
    inspection.projectRoot,
    new Set(components.map((component) => component.name)),
  )).filter((component) => !installedResolvedComponents.includes(component));
  return {
    status: "ready",
    projectRoot: inspection.projectRoot,
    initialized: inspection.initialized,
    registryRevision: inspection.registryRevision,
    installedDirectComponents,
    installedResolvedComponents,
    recommendedComponents,
    components,
  };
}

export async function planSetupSelection(
  projectRoot: string,
  frameworkRoot: string,
  input: unknown,
): Promise<SetupSelectionPreview> {
  await checkContextRegistry(frameworkRoot);
  const snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  const command = parseSetupPlanCommand(
    input,
    new Set(snapshot.components.map((component) => component.name)),
  );
  const overrides = validateSetupSourceOverrides(
    registry,
    selectedDirectComponents(snapshot, command.components),
    command.overrides,
  );
  try {
    return projectSelectionToSetupPreview(await planProjectSelection(
      projectRoot,
      frameworkRoot,
      command.components,
      overrides,
    ));
  } catch (error) {
    if (overrides.size === 0) throw error;
    throw new Error(`Setup source override is invalid: ${errorMessage(error)}`, { cause: error });
  }
}

export async function installSetupComponents(
  projectRoot: string,
  frameworkRoot: string,
  input: unknown,
): Promise<SetupInstallOutcome> {
  await checkContextRegistry(frameworkRoot);
  let snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  const command = parseSetupInstallCommand(
    input,
    new Set(snapshot.components.map((component) => component.name)),
  );
  const overrides = validateSetupSourceOverrides(
    registry,
    selectedDirectComponents(snapshot, command.components),
    command.overrides,
  );
  let preview: ContextSelectionPreview;
  try {
    preview = await planProjectSelection(
      projectRoot,
      frameworkRoot,
      command.components,
      overrides,
    );
  } catch (error) {
    if (overrides.size === 0) throw error;
    throw new Error(`Setup source override is invalid: ${errorMessage(error)}`, { cause: error });
  }
  if (preview.status === "blocked") {
    return blockedSelectionOutcome(snapshot, preview);
  }
  const writtenPaths = new Set<string>();

  if (!snapshot.initialized) {
    const initialized = await initProject(projectRoot, frameworkRoot, overrides);
    const blocked = await blockedOutcome(initialized, projectRoot, frameworkRoot);
    if (blocked !== null) return blocked;
    for (const writtenPath of initialized.writtenPaths) writtenPaths.add(writtenPath);
    snapshot = await readSetupSnapshot(projectRoot, frameworkRoot);
  }

  for (const component of command.components) {
    if (snapshot.installedDirectComponents.includes(component)) continue;
    const result = await addComponent(projectRoot, frameworkRoot, component, overrides);
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
  await checkContextRegistry(options.frameworkRoot);
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
  let resolveApplied: (() => void) | undefined;
  const applied = new Promise<void>((resolve) => {
    resolveApplied = resolve;
  });
  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      projectRoot,
      frameworkRoot,
      clientRoot,
      token,
      onApplied: () => resolveApplied?.(),
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
  let closed = false;
  return {
    url,
    port: address.port,
    applied,
    close: async () => {
      if (closed) return;
      closed = true;
      await closeServer(server);
    },
  };
}

interface RequestContext {
  readonly projectRoot: string;
  readonly frameworkRoot: string;
  readonly clientRoot: string;
  readonly token: string;
  readonly onApplied: () => void;
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
      await sendJson(response, 200, await readSetupSnapshot(context.projectRoot, context.frameworkRoot));
      return;
    }
    if (requestUrl.pathname.startsWith("/api/components/") && request.method === "GET") {
      requireApiToken(request, context.token);
      const componentName = decodeURIComponent(requestUrl.pathname.slice("/api/components/".length));
      const registry = await loadContextRegistry(context.frameworkRoot);
      const component = registry.components.find((candidate) => candidate.name === componentName);
      if (component === undefined) {
        sendText(response, 404, `Unknown setup component ${componentName}.`);
        return;
      }
      await sendJson(
        response,
        200,
        await readComponentDetail(context.frameworkRoot, registry, component.name),
      );
      return;
    }
    if (requestUrl.pathname === "/api/plan" && request.method === "POST") {
      requireApiToken(request, context.token);
      const preview = await planSetupSelection(
        context.projectRoot,
        context.frameworkRoot,
        await readJsonBody(request, "Setup plan request"),
      );
      await sendJson(response, preview.status === "blocked" ? 409 : 200, preview);
      return;
    }
    if (requestUrl.pathname === "/api/install" && request.method === "POST") {
      requireApiToken(request, context.token);
      const outcome = await installSetupComponents(
        context.projectRoot,
        context.frameworkRoot,
        await readJsonBody(request, "Setup install request"),
      );
      await sendJson(response, outcome.status === "blocked" ? 409 : 200, outcome);
      if (outcome.status === "applied") context.onApplied();
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
      message.startsWith("Setup plan request") || message.startsWith("Setup install request") ||
        message.startsWith("Setup source override") || message.startsWith("Unknown setup") ? 400 :
      message === "Request body is too large." ? 413 : 500;
    sendText(response, status, message);
  }
}

function selectedDirectComponents(
  snapshot: SetupSnapshot,
  requestedComponents: readonly string[],
): readonly string[] {
  return [...new Set(snapshot.initialized
    ? [...snapshot.installedDirectComponents, ...requestedComponents]
    : [DEFAULT_CONTEXT_COMPONENT, ...requestedComponents])];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function blockedSelectionOutcome(
  snapshot: SetupSnapshot,
  preview: ContextSelectionPreview,
): SetupInstallOutcome {
  return {
    status: "blocked",
    snapshot,
    conflicts: preview.drift.conflicts.map((conflict) => ({
      targetPath: conflict.targetPath,
      status: conflict.status,
      detail: conflict.detail,
    })),
  };
}

function projectSelectionToSetupPreview(preview: ContextSelectionPreview): SetupSelectionPreview {
  return {
    ...preview,
    capabilities: preview.capabilities,
    licenses: preview.licenses.map((license) => license.kind === "project"
      ? { kind: license.kind, spdx: license.spdx, noticePath: license.noticePath }
      : {
          kind: license.kind,
          spdx: license.spdx,
          source: license.source,
          revision: license.revision,
          noticePath: license.noticePath,
        }),
    activations: preview.activations,
    drift: {
      ...preview.drift,
      conflicts: preview.drift.conflicts.map((conflict) => ({
        targetPath: conflict.targetPath,
        status: conflict.status,
        detail: conflict.detail,
      })),
    },
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

async function readJsonBody(request: IncomingMessage, label: string): Promise<unknown> {
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
    throw new Error(`${label} must be valid JSON.`, { cause: error });
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

async function sendJson(response: ServerResponse, status: number, value: unknown): Promise<void> {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": body.byteLength });
  await new Promise<void>((resolve) => {
    response.end(body, resolve);
  });
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
