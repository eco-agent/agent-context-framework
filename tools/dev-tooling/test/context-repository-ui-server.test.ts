import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { buildContextCapsule } from "../src/context-capsule.js";
import { startContextRepositoryUiServer } from "../src/context-repository-ui-server.js";

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
    assert.match(await page.text(), /ACF repositories/u);

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
