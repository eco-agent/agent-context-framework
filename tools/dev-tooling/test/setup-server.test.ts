import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeSetupComponentDetail,
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
  assert.deepEqual(parseSetupPlanCommand({ components: [], overrides: [] }, available), {
    components: [], overrides: [],
  });
  assert.deepEqual(parseSetupPlanCommand({ components: ["codex-runtime"], overrides: [] }, available), {
    components: ["codex-runtime"],
    overrides: [],
  });
  assert.deepEqual(parseSetupInstallCommand({ components: ["codex-runtime"], overrides: [] }, available), {
    components: ["codex-runtime"],
    overrides: [],
  });
  assert.throws(() => parseSetupInstallCommand({ components: [], overrides: [] }, available), /non-empty/u);
  assert.throws(
    () => parseSetupInstallCommand({ components: ["core", "core"], overrides: [] }, available),
    /duplicates/u,
  );
  assert.throws(
    () => parseSetupInstallCommand({ components: ["objective-kernel"], overrides: [] }, available),
    /Unknown setup component/u,
  );
  assert.throws(
    () => parseSetupPlanCommand({ components: ["core", "core"], overrides: [] }, available),
    /duplicates/u,
  );
  assert.throws(
    () => parseSetupPlanCommand({ components: ["objective-kernel"], overrides: [] }, available),
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
    assert.equal(runtime.displayName, "Codex runtime");
    assert.equal(runtime.artifactCount, 0);
    assert.deepEqual(initial.installedDirectComponents, []);
    assert.deepEqual(initial.installedResolvedComponents, []);
    assert.deepEqual(initial.recommendedComponents, ["engineering"]);

    const skillDetailResponse = await fetch(
      `${origin}/api/components/skill-choose-react-animation`,
      { headers: { "x-agent-context-token": "fixture-token" } },
    );
    assert.equal(skillDetailResponse.status, 200);
    const skillDetail = decodeSetupComponentDetail(await skillDetailResponse.json());
    assert.equal(skillDetail.displayName, "Choose React animation");
    assert.match(skillDetail.description, /Animate React interfaces/u);
    assert.ok(skillDetail.artifacts.some((artifact) =>
      artifact.sourcePath.endsWith("/SKILL.md") && artifact.editable));

    const toolDetailResponse = await fetch(
      `${origin}/api/components/codex-repo-context`,
      { headers: { "x-agent-context-token": "fixture-token" } },
    );
    const toolDetail = decodeSetupComponentDetail(await toolDetailResponse.json());
    assert.deepEqual(toolDetail.tools.map((tool) => tool.name), ["repo_context"]);
    assert.deepEqual(toolDetail.tools[0]?.modes.map((mode) => mode.name), ["read", "search"]);
    assert.ok(toolDetail.tools[0]?.modes.some((mode) =>
      mode.arguments.some((argument) => argument.name === "maxMatches" && !argument.required)));
    const toolSource = await readFile(
      path.join(frameworkRoot, toolDetail.tools[0]?.sourcePath ?? "missing"),
      "utf8",
    );
    for (const argument of toolDetail.tools[0]?.modes.flatMap((mode) => mode.arguments) ?? []) {
      assert.match(toolSource, new RegExp(`\\b${argument.name}\\b`, "u"));
    }
    assert.match(toolSource, /lines:.*\.max\(200\)/u);
    assert.match(toolSource, /maxMatches:.*\.max\(50\)/u);
    assert.match(toolSource, /contextLines:.*\.max\(10\)/u);

    const emptyPlanResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: [], overrides: [] }),
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
      body: JSON.stringify({ components: ["codex-runtime"], overrides: [] }),
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
      body: JSON.stringify({ components: ["skill-orchestrate-codex-workflows"], overrides: [] }),
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
      body: JSON.stringify({ components: ["objective-kernel"], overrides: [] }),
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
      body: JSON.stringify({
        components: ["core"],
        overrides: [{
          sourcePath: "registry/sources/instructions/core.md",
          content: "# Custom core instructions\n\nUse the reviewed setup source.\n",
        }],
      }),
    });
    assert.equal(installResponse.status, 200);
    const outcome = decodeSetupInstallOutcome(await installResponse.json());
    assert.equal(outcome.status, "applied");
    await running.applied;
    assert.deepEqual(outcome.snapshot.installedDirectComponents, ["core"]);
    assert.deepEqual(outcome.snapshot.installedResolvedComponents, ["core"]);
    const agents = await readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(agents, /agent-context:core/u);
    assert.match(agents, /Custom core instructions/u);

    const currentPlanResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: [], overrides: [] }),
    });
    const currentPlan = decodeSetupSelectionPreview(await currentPlanResponse.json());
    assert.equal(currentPlan.status, "current");
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
      body: JSON.stringify({ components: [], overrides: [] }),
    });
    assert.equal(unauthorized.status, 403);

    const before = await readFile(conflictPath, "utf8");
    const blockedResponse = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-context-token": "fixture-token",
      },
      body: JSON.stringify({ components: ["codex-runtime"], overrides: [] }),
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
