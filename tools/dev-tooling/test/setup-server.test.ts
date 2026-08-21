import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeSetupInstallOutcome,
  decodeSetupSelectionPreview,
  decodeSetupSnapshot,
  parseSetupPlanCommand,
  parseSetupInstallCommand,
} from "../src/setup-contract.js";
import { startSetupServer } from "../src/setup-server.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("setup contract excludes empty duplicate and unknown component requests", () => {
  const available = new Set(["core", "codex-runtime"]);
  assert.deepEqual(parseSetupPlanCommand({ components: [] }, available), { components: [] });
  assert.deepEqual(parseSetupPlanCommand({ components: ["codex-runtime"] }, available), {
    components: ["codex-runtime"],
  });
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
  assert.throws(
    () => parseSetupPlanCommand({ components: ["core", "core"] }, available),
    /duplicates/u,
  );
  assert.throws(
    () => parseSetupPlanCommand({ components: ["objective-kernel"] }, available),
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
    assert.ok(initial.registryRevision.length > 0);
    const runtime = initial.components.find((component) => component.name === "codex-runtime");
    assert.ok(runtime);
    assert.equal(runtime.kind, "bundle");
    assert.equal(runtime.artifactCount, 0);
    assert.deepEqual(initial.installedDirectComponents, []);
    assert.deepEqual(initial.installedResolvedComponents, []);

    const emptyPlanResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: [] }),
    });
    assert.equal(emptyPlanResponse.status, 200);
    const emptyPlan = decodeSetupSelectionPreview(await emptyPlanResponse.json());
    assert.deepEqual(emptyPlan.requestedComponents, []);
    assert.deepEqual(emptyPlan.directComponents, ["core"]);
    assert.equal(emptyPlan.drift.plannedWritePaths.length > 0, true);
    assert.equal(emptyPlan.footprint.componentCount > 0, true);
    assert.equal(emptyPlan.trustRequired, false);
    assert.equal(await readFile(path.join(projectRoot, ".agent-context", "config.json"), "utf8").catch(() => null), null);

    const runtimePlanResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["codex-runtime"] }),
    });
    assert.equal(runtimePlanResponse.status, 200);
    const runtimePlan = decodeSetupSelectionPreview(await runtimePlanResponse.json());
    assert.ok(runtimePlan.resolvedComponents.includes("codex-runtime"));
    assert.ok(runtimePlan.footprint.runtimeTargetCount > 0);
    assert.equal(runtimePlan.trustRequired, true);
    assert.ok(runtimePlan.activations.some((activation) => activation.id === "codex-hooks-session-binding" && activation.status === "dormant"));
    assert.ok(runtimePlan.licenses.length > 0);

    const authoringPlanResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["skill-orchestrate-codex-workflows"] }),
    });
    assert.equal(authoringPlanResponse.status, 200);
    const authoringPlan = decodeSetupSelectionPreview(await authoringPlanResponse.json());
    assert.deepEqual(authoringPlan.requestedComponents, ["skill-orchestrate-codex-workflows"]);
    assert.deepEqual(authoringPlan.directComponents, ["core", "skill-orchestrate-codex-workflows"]);
    assert.deepEqual(authoringPlan.resolvedComponents, ["core", "skill-orchestrate-codex-workflows"]);
    assert.deepEqual(authoringPlan.transitiveComponents, []);
    assert.equal(authoringPlan.footprint.skillTargetCount > 0, true);
    assert.equal(authoringPlan.trustRequired, true);
    assert.equal(authoringPlan.capabilities.some((capability) =>
      capability.kind === "runtime" && capability.name === "codex-authentication"), true);
    assert.equal(authoringPlan.activations.some((activation) =>
      activation.id === "codex-authenticated-execution" && activation.status === "dormant"), true);
    assert.equal(authoringPlan.licenses.some((license) => license.spdx === "Apache-2.0"), true);

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
    await running.applied;
    assert.deepEqual(outcome.snapshot.installedDirectComponents, ["core"]);
    assert.deepEqual(outcome.snapshot.installedResolvedComponents, ["core"]);
    assert.match(await readFile(path.join(projectRoot, "AGENTS.md"), "utf8"), /agent-context:core/u);
  } finally {
    await running.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("setup plan is token-protected and a blocked preview performs zero writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-setup-plan-blocked-"));
  const projectRoot = path.join(root, "project");
  const clientRoot = path.join(root, "client");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(path.join(clientRoot, "assets"), { recursive: true });
  await writeFile(path.join(clientRoot, "index.html"), "<!doctype html><title>Setup fixture</title>\n");
  await writeFile(path.join(clientRoot, "assets", "fixture.js"), "export {};\n");
  const conflictPath = path.join(projectRoot, ".codex", "agents", "default.toml");
  await mkdir(path.dirname(conflictPath), { recursive: true });
  await writeFile(conflictPath, "model = \"project-owned\"\n", "utf8");

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
    const unauthorized = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ components: [] }),
    });
    assert.equal(unauthorized.status, 403);

    const before = await readFile(conflictPath, "utf8");
    const blockedResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["codex-runtime"] }),
    });
    assert.equal(blockedResponse.status, 409);
    const blocked = decodeSetupSelectionPreview(await blockedResponse.json());
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.drift.conflicts.length > 0);
    assert.equal(await readFile(conflictPath, "utf8"), before);
    assert.equal(await readFile(path.join(projectRoot, ".agent-context", "config.json"), "utf8").catch(() => null), null);
    assert.equal(await readFile(path.join(projectRoot, ".agent-context", "lock.json"), "utf8").catch(() => null), null);
    assert.equal((await fetch(`${origin}/?token=fixture-token`)).status, 200);
  } finally {
    await running.close();
    await rm(root, { recursive: true, force: true });
  }
});
