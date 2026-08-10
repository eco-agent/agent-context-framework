import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeSetupInstallOutcome,
  decodeSetupSnapshot,
  parseSetupInstallCommand,
} from "../src/setup-contract.js";
import { startSetupServer } from "../src/setup-server.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("setup contract excludes empty duplicate and unknown component requests", () => {
  const available = new Set(["core", "codex-runtime"]);
  assert.deepEqual(parseSetupInstallCommand({ components: ["codex-runtime"] }, available), {
    components: ["codex-runtime"],
  });
  assert.throws(() => parseSetupInstallCommand({ components: [] }, available), /non-empty/u);
  assert.throws(
    () => parseSetupInstallCommand({ components: ["core", "core"] }, available),
    /duplicates/u,
  );
  assert.throws(
    () => parseSetupInstallCommand({ components: ["objective-kernel"] }, available),
    /Unknown setup component/u,
  );
});

test("loopback setup server requires its token and installs through the real materializer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-setup-ui-"));
  const projectRoot = path.join(root, "project");
  const clientRoot = path.join(root, "client");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(path.join(clientRoot, "assets"), { recursive: true });
  await writeFile(path.join(clientRoot, "index.html"), "<!doctype html><title>Setup fixture</title>\n");
  await writeFile(path.join(clientRoot, "assets", "fixture.js"), "export {};\n");

  const running = await startSetupServer({
    projectRoot,
    frameworkRoot,
    clientRoot,
    port: 0,
    openBrowser: false,
    token: "fixture-token",
  });
  const origin = `http://127.0.0.1:${running.port}`;
  try {
    assert.equal((await fetch(`${origin}/`)).status, 403);
    assert.equal((await fetch(`${origin}/?token=fixture-token`)).status, 200);
    assert.equal((await fetch(`${origin}/api/setup`)).status, 403);

    const setupResponse = await fetch(`${origin}/api/setup`, {
      headers: { "x-agent-context-token": "fixture-token" },
    });
    assert.equal(setupResponse.status, 200);
    const initial = decodeSetupSnapshot(await setupResponse.json());
    assert.equal(initial.initialized, false);
    assert.equal(initial.registryRevision, "0.5.2");
    assert.ok(initial.components.some((component) => component.name === "codex-runtime"));

    const rejected = await fetch(`${origin}/api/install`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["objective-kernel"] }),
    });
    assert.equal(rejected.status, 400);

    const malformed = await fetch(`${origin}/api/install`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: "{",
    });
    assert.equal(malformed.status, 400);

    const installResponse = await fetch(`${origin}/api/install`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["core"] }),
    });
    assert.equal(installResponse.status, 200);
    const outcome = decodeSetupInstallOutcome(await installResponse.json());
    assert.equal(outcome.status, "applied");
    assert.deepEqual(outcome.snapshot.selectedComponents, ["core"]);
    assert.match(await readFile(path.join(projectRoot, "AGENTS.md"), "utf8"), /agent-context:core/u);
  } finally {
    await running.close();
    await rm(root, { recursive: true, force: true });
  }
});
