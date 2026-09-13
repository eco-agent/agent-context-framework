import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { buildContextCapsule } from "../src/context-capsule.js";
import { resolveCurrentWallpaperPath, startContextRepositoryUiServer } from "../src/context-repository-ui-server.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const clientRoot = path.join(frameworkRoot, "tools", "dev-tooling", "repository-ui");

test("repository UI is loopback-only, token-protected, and delegates catalog changes", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-ui-"));
  const projectRoot = path.join(parent, "project");
  const catalogRoot = path.join(parent, "codex-home", "acf", "repositories");
  const capsule = await buildContextCapsule({
    frameworkRoot,
    frameworkRevision: "a".repeat(40),
    directComponents: ["core"],
  });
  await mkdir(path.join(projectRoot, ".codex", "acf"), { recursive: true });
  await writeFile(path.join(projectRoot, CONTEXT_CAPSULE_PATH), capsule.bytes);
  const server = await startContextRepositoryUiServer({
    frameworkRoot,
    catalogRoot,
    clientRoot,
    openBrowser: false,
    token: "test-token",
  });
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/u);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 403);
    const page = await fetch(server.url);
    assert.equal(page.status, 200);
    const pageText = await page.text();
    assert.match(pageText, /ACF repositories/u);
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'sha256-/u);
    assert.doesNotMatch(page.headers.get("content-security-policy") ?? "", /unsafe-inline/u);
    const assetPath = /src="(\/assets\/[^"]+\.js)"/u.exec(pageText)?.[1];
    assert.ok(assetPath);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}${assetPath}`)).status, 200);

    const apiRoot = `http://127.0.0.1:${server.port}/api/repositories`;
    assert.equal((await fetch(apiRoot)).status, 403);
    const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
    const initial = await fetch(apiRoot, { headers });
    assert.deepEqual((await initial.json() as { repositories: unknown[] }).repositories, []);

    const registered = await fetch(apiRoot, {
      method: "POST",
      headers,
      body: JSON.stringify({ root: projectRoot }),
    });
    assert.equal(registered.status, 200);
    const snapshot = await registered.json() as { repositories: { id: string; root: string }[] };
    assert.equal(snapshot.repositories.length, 1);
    assert.equal(snapshot.repositories[0]?.root, projectRoot);

    const removed = await fetch(`${apiRoot}/${snapshot.repositories[0]!.id}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(removed.status, 200);
    assert.deepEqual((await removed.json() as { repositories: unknown[] }).repositories, []);
  } finally {
    await server.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository UI rejects widened registration payloads", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-ui-input-"));
  const server = await startContextRepositoryUiServer({
    frameworkRoot,
    catalogRoot: path.join(parent, "catalog"),
    clientRoot,
    openBrowser: false,
    token: "test-token",
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/repositories`, {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ root: parent, recursive: true }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /must contain only root/u);
  } finally {
    await server.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository UI reports browser launch failure and closes the server", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-ui-launch-"));
  try {
    await assert.rejects(
      startContextRepositoryUiServer({
        frameworkRoot,
        catalogRoot: path.join(parent, "catalog"),
        clientRoot,
        launchBrowser: async () => {
          throw new Error("Browser command is unavailable.");
        },
      }),
      /could not open the default browser/u,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository UI serves the current extensionless wallpaper without exposing its path", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-ui-wallpaper-"));
  const wallpaperPath = path.join(parent, "TranscodedWallpaper");
  await writeFile(wallpaperPath, Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]));
  const server = await startContextRepositoryUiServer({
    frameworkRoot,
    catalogRoot: path.join(parent, "catalog"),
    clientRoot,
    openBrowser: false,
    token: "test-token",
    getWallpaperPath: async () => wallpaperPath,
  });
  try {
    const url = `http://127.0.0.1:${server.port}/api/wallpaper`;
    assert.equal((await fetch(url)).status, 403);
    const response = await fetch(url, { headers: { Authorization: "Bearer test-token" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-disposition"), "inline");
    assert.equal(response.headers.get("x-wallpaper-path"), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]));
  } finally {
    await server.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository UI treats an unavailable wallpaper as an optional visual", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-ui-no-wallpaper-"));
  const server = await startContextRepositoryUiServer({
    frameworkRoot,
    catalogRoot: path.join(parent, "catalog"),
    clientRoot,
    openBrowser: false,
    token: "test-token",
    getWallpaperPath: async () => { throw new Error("No wallpaper configured."); },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/wallpaper`, {
      headers: { Authorization: "Bearer test-token" },
    });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /unavailable/u);
  } finally {
    await server.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test("current wallpaper resolution falls back to the Windows cache", async () => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "acf-wallpaper-appdata-"));
  const cachedWallpaper = path.join(appData, "Microsoft", "Windows", "Themes", "TranscodedWallpaper");
  await mkdir(path.dirname(cachedWallpaper), { recursive: true });
  await writeFile(cachedWallpaper, Buffer.from([0xff, 0xd8, 0xff]));
  try {
    assert.equal(await resolveCurrentWallpaperPath(
      { APPDATA: appData },
      "win32",
      async () => { throw new Error("Wallpaper helper failed."); },
    ), cachedWallpaper);
  } finally {
    await rm(appData, { recursive: true, force: true });
  }
});
