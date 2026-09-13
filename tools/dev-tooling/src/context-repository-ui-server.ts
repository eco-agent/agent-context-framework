import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import { getWallpaper } from "wallpaper";

import {
  forgetContextRepository,
  inspectContextRepositories,
  registerContextRepository,
  resolveContextRepositoryCatalogRoot,
  syncContextRepositories,
  syncContextRepository,
} from "./context-repository-catalog.js";
import { loadContextRegistry } from "./context-installer.js";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = 64 * 1024;

export interface ContextRepositoryUiServerOptions {
  readonly frameworkRoot: string;
  readonly port?: number;
  readonly openBrowser?: boolean;
  readonly token?: string;
  readonly clientRoot?: string;
  readonly catalogRoot?: string;
  readonly getWallpaperPath?: () => Promise<string>;
  readonly launchBrowser?: (url: string) => Promise<void>;
}

export interface RunningContextRepositoryUiServer {
  readonly url: string;
  readonly port: number;
  readonly browserLaunchIssue: string | null;
  close(): Promise<void>;
}

export async function resolveCurrentWallpaperPath(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
  wallpaperReader: () => Promise<string> = getWallpaper,
): Promise<string> {
  try {
    return await wallpaperReader();
  } catch (error) {
    if (platform !== "win32") throw error;
    const appData = environment.APPDATA?.trim();
    if (appData === undefined || appData.length === 0 || !path.isAbsolute(appData)) throw error;
    const cachedWallpaper = path.join(appData, "Microsoft", "Windows", "Themes", "TranscodedWallpaper");
    try {
      const file = await stat(cachedWallpaper);
      if (file.isFile()) return cachedWallpaper;
    } catch {
      // Preserve the helper's original error when Windows has no readable cache.
    }
    throw error;
  }
}

interface RequestContext {
  readonly frameworkRoot: string;
  readonly clientRoot: string;
  readonly catalogRoot: string;
  readonly token: string;
  readonly mutations: MutationQueue;
  readonly getWallpaperPath: () => Promise<string>;
  readonly inlineScriptHashes: readonly string[];
}

class MutationQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export async function readContextRepositoryUiSnapshot(
  frameworkRoot: string,
  catalogRoot = resolveContextRepositoryCatalogRoot(),
) {
  const registry = await loadContextRegistry(frameworkRoot);
  const repositories = await inspectContextRepositories(catalogRoot, registry.revision);
  return {
    status: repositories.every((repository) => repository.status === "current")
      ? "current" as const
      : "attention" as const,
    catalogRoot,
    registryRevision: registry.revision,
    repositories,
  };
}

export async function startContextRepositoryUiServer(
  options: ContextRepositoryUiServerOptions,
): Promise<RunningContextRepositoryUiServer> {
  const frameworkRoot = await realpath(options.frameworkRoot);
  const clientRoot = await realpath(
    options.clientRoot ?? path.join(frameworkRoot, "tools", "dev-tooling", "repository-ui"),
  );
  const catalogRoot = path.resolve(options.catalogRoot ?? resolveContextRepositoryCatalogRoot());
  const inlineScriptHashes = await readInlineScriptHashes(path.join(clientRoot, "index.html"));
  const token = options.token ?? randomBytes(32).toString("base64url");
  const mutations = new MutationQueue();
  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      frameworkRoot,
      clientRoot,
      catalogRoot,
      token,
      mutations,
      getWallpaperPath: options.getWallpaperPath ?? resolveCurrentWallpaperPath,
      inlineScriptHashes,
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Repository UI server did not bind a TCP address.");
  }
  const url = `http://${LOOPBACK_HOST}:${address.port}/?token=${encodeURIComponent(token)}`;
  let browserLaunchIssue: string | null = null;
  if (options.openBrowser !== false) {
    try {
      await (options.launchBrowser ?? openBrowser)(url);
    } catch (error) {
      browserLaunchIssue = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    url,
    port: address.port,
    browserLaunchIssue,
    close: async () => await closeServer(server),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
): Promise<void> {
  try {
    setSecurityHeaders(response, context.inlineScriptHashes);
    const requestUrl = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      requireApiToken(request, context.token);
      await handleApiRequest(request, response, requestUrl, context);
      return;
    }
    if (request.method !== "GET") {
      sendText(response, 405, "Method not allowed.");
      return;
    }
    if (requestUrl.pathname === "/") {
      if (!tokensEqual(requestUrl.searchParams.get("token") ?? "", context.token)) {
        sendText(response, 403, "Invalid repository UI launch token.");
        return;
      }
      await sendFile(response, path.join(context.clientRoot, "index.html"));
      return;
    }
    await sendClientAsset(response, context.clientRoot, requestUrl.pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Invalid repository UI") ? 403
      : message.includes("must contain only") || message.includes("must be") ||
          message.includes("is not registered") ? 400
      : message === "Request body is too large." ? 413
      : 500;
    sendText(response, status, message);
  }
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  context: RequestContext,
): Promise<void> {
  if (requestUrl.pathname === "/api/wallpaper" && request.method === "GET") {
    await sendCurrentWallpaper(response, context.getWallpaperPath);
    return;
  }
  if (requestUrl.pathname === "/api/repositories" && request.method === "GET") {
    await sendJson(response, 200, await readContextRepositoryUiSnapshot(
      context.frameworkRoot,
      context.catalogRoot,
    ));
    return;
  }
  if (requestUrl.pathname === "/api/repositories" && request.method === "POST") {
    const body = requireExactObject(
      await readJsonBody(request),
      ["root"],
      "Repository registration request",
    );
    if (typeof body.root !== "string" || body.root.trim().length === 0) {
      throw new Error("Repository registration root must be a non-empty string.");
    }
    const snapshot = await context.mutations.run(async () => {
      await registerContextRepository(body.root as string, context.catalogRoot);
      return await readContextRepositoryUiSnapshot(context.frameworkRoot, context.catalogRoot);
    });
    await sendJson(response, 200, snapshot);
    return;
  }
  if (requestUrl.pathname === "/api/sync" && request.method === "POST") {
    const outcome = await context.mutations.run(async () => {
      const results = await syncContextRepositories(context.catalogRoot);
      const snapshot = await readContextRepositoryUiSnapshot(context.frameworkRoot, context.catalogRoot);
      return { results, snapshot };
    });
    await sendJson(response, 200, {
      results: outcome.results,
      snapshot: outcome.snapshot,
    });
    return;
  }
  const match = /^\/api\/repositories\/([a-f0-9]{64})(?:\/(sync))?$/u.exec(requestUrl.pathname);
  if (match !== null && request.method === "POST" && match[2] === "sync") {
    const outcome = await context.mutations.run(async () => {
      const result = await syncContextRepository(match[1]!, context.catalogRoot);
      const snapshot = await readContextRepositoryUiSnapshot(context.frameworkRoot, context.catalogRoot);
      return { result, snapshot };
    });
    await sendJson(response, 200, {
      result: outcome.result,
      snapshot: outcome.snapshot,
    });
    return;
  }
  if (match !== null && request.method === "DELETE" && match[2] === undefined) {
    const snapshot = await context.mutations.run(async () => {
      await forgetContextRepository(match[1]!, context.catalogRoot);
      return await readContextRepositoryUiSnapshot(context.frameworkRoot, context.catalogRoot);
    });
    await sendJson(response, 200, snapshot);
    return;
  }
  sendText(response, 404, "Not found.");
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error("Repository UI request must be valid JSON.", { cause: error });
  }
}

function requireExactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain only ${expected.join(", ")}.`);
  }
  return value as Record<string, unknown>;
}

function requireApiToken(request: IncomingMessage, expected: string): void {
  const authorization = request.headers.authorization ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!tokensEqual(supplied, expected)) {
    throw new Error("Invalid repository UI API token.");
  }
}

function tokensEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function sendFile(response: ServerResponse, filePath: string): Promise<void> {
  const file = await stat(filePath);
  if (!file.isFile()) {
    sendText(response, 404, "Not found.");
    return;
  }
  const contentType = contentTypeForPath(filePath);
  response.writeHead(200, { "content-type": contentType, "content-length": file.size });
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.once("end", resolve);
    response.once("close", resolve);
    stream.pipe(response);
  });
}

async function sendClientAsset(response: ServerResponse, clientRoot: string, requestPath: string): Promise<void> {
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  } catch {
    sendText(response, 400, "Invalid asset path.");
    return;
  }
  if (relativePath.length === 0 || relativePath.includes("\0")) {
    sendText(response, 404, "Not found.");
    return;
  }
  const candidate = path.resolve(clientRoot, relativePath);
  if (!isPathWithin(clientRoot, candidate)) {
    sendText(response, 404, "Not found.");
    return;
  }
  try {
    const resolved = await realpath(candidate);
    if (!isPathWithin(clientRoot, resolved)) {
      sendText(response, 404, "Not found.");
      return;
    }
    await sendFile(response, resolved);
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      sendText(response, 404, "Not found.");
      return;
    }
    throw error;
  }
}

async function sendCurrentWallpaper(
  response: ServerResponse,
  getWallpaperPath: () => Promise<string>,
): Promise<void> {
  let wallpaperPath: string;
  try {
    wallpaperPath = await realpath(await getWallpaperPath());
  } catch {
    sendText(response, 404, "Desktop wallpaper is unavailable.");
    return;
  }
  const file = await stat(wallpaperPath);
  if (!file.isFile()) {
    sendText(response, 404, "Desktop wallpaper is unavailable.");
    return;
  }
  const contentType = await detectImageContentType(wallpaperPath);
  if (contentType === undefined) {
    sendText(response, 404, "Desktop wallpaper format is unsupported.");
    return;
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": file.size,
    "content-disposition": "inline",
  });
  await pipeFile(response, wallpaperPath);
}

async function detectImageContentType(filePath: string): Promise<string | undefined> {
  const handle = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(16);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    const bytes = signature.subarray(0, bytesRead);
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    const ascii = bytes.toString("ascii");
    if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
    if (ascii.startsWith("BM")) return "image/bmp";
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
    return undefined;
  } finally {
    await handle.close();
  }
}

function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json" || extension === ".map") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function pipeFile(response: ServerResponse, filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.once("end", resolve);
    response.once("close", resolve);
    stream.pipe(response);
  });
}

async function sendJson(response: ServerResponse, status: number, value: unknown): Promise<void> {
  sendText(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8");
}

function sendText(
  response: ServerResponse,
  status: number,
  content: string,
  contentType = "text/plain; charset=utf-8",
): void {
  response.writeHead(status, { "content-type": contentType });
  response.end(content);
}

async function readInlineScriptHashes(indexPath: string): Promise<readonly string[]> {
  const html = await readFile(indexPath, "utf8");
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/giu)) {
    const content = match[1] ?? "";
    hashes.push(`'sha256-${createHash("sha256").update(content).digest("base64")}'`);
  }
  return hashes;
}

function setSecurityHeaders(response: ServerResponse, inlineScriptHashes: readonly string[]): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-security-policy", `default-src 'self'; script-src 'self' ${inlineScriptHashes.join(" ")}; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "win32" ? "cmd"
    : process.platform === "darwin" ? "open"
    : "xdg-open";
  const arguments_ = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];
  const child = spawn(command, arguments_, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  });
  child.unref();
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}
