import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";
import { parse as parseToml } from "smol-toml";

import { unsafeReferenceDiagnostics } from "../src/codex-interface.js";
import {
  addComponent,
  diffProject,
  doctorProject,
  initProject,
  removeComponent,
} from "../src/context-installer.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("codex-runtime is dependency-only with the exact Wave 4 closure", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.equal(registry.revision, "0.5.0");
  assert.equal(registry.components.length, 28);
  const component = registry.components.find((candidate) => candidate.name === "codex-runtime");
  assert.ok(component);
  assert.deepEqual(component.dependencies, ["codex-agents", "codex-hooks", "codex-repo-context"]);
  assert.deepEqual(component.artifacts, []);
  assert.deepEqual(
    resolveContextComponents(registry, ["codex-runtime"]).map((candidate) => candidate.name),
    ["core", "codex-agents", "runtime-base", "codex-hooks", "codex-repo-context", "codex-runtime"],
  );
  assert.equal(
    resolveContextComponents(registry, ["codex-runtime"])
      .some((candidate) => candidate.name === "repository-policy"),
    false,
  );
});

test("Wave 4 local-reference rules reject host-coupled entrypoints", () => {
  for (const source of [
    'command = "D:\\\\dev\\\\framework\\\\server.js"',
    'command = "tools/server.ts"',
    'command = "tsx"',
    'args = ["--filter", "@host/server"]',
    'command = "~/.codex/server.js"',
    'command = ".agent-context/runtime/../server.js"',
  ]) {
    assert.equal(unsafeReferenceDiagnostics(source).length > 0, true, source);
  }
  assert.deepEqual(
    unsafeReferenceDiagnostics('command = "node"\nargs = [".agent-context/runtime/packages/repo-context/dist/src/mcp-cli.js"]'),
    [],
  );
});

test("codex-runtime installs, diagnoses, and removes only its owned project configuration", { timeout: 40_000 }, async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-runtime-"));
  try {
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    await writeFile(path.join(projectRoot, "README.md"), "Wave 4 fixture\n", "utf8");
    await writeFile(
      path.join(projectRoot, ".codex", "config.toml"),
      '[mcp_servers.local]\ncommand = "local-server"\n',
      "utf8",
    );
    await writeFile(
      path.join(projectRoot, ".codex", "hooks.json"),
      '{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[{"type":"command","command":"local"}]}]}}\n',
      "utf8",
    );
    await initProject(projectRoot, frameworkRoot);
    const added = await addComponent(projectRoot, frameworkRoot, "codex-runtime");
    assert.equal(added.plan.status, "ready");
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    const installed = parseToml(await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8")) as {
      mcp_servers: { local: { command: string }; repo_context: { command: string } };
    };
    assert.equal(installed.mcp_servers.local.command, "local-server");
    assert.equal(installed.mcp_servers.repo_context.command, "node");
    const hooks = JSON.parse(await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    assert.deepEqual(hooks.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$", "^apply_patch$"]);

    const bootstrap = await bootstrapRuntime({ projectRoot, mode: "install-and-build" });
    assert.equal(bootstrap.status, "operational");
    const doctor = await doctorProject(projectRoot, frameworkRoot);
    assert.equal(doctor.health, "healthy");
    assert.equal(doctor.codexInterface?.status, "ready");
    assert.equal(doctor.codexInterface?.trustRequired, true);
    assert.match(doctor.diagnostics.join("\n"), /trust this project/u);

    const removed = await removeComponent(projectRoot, frameworkRoot, "codex-runtime");
    assert.equal(removed.plan.status, "ready");
    const retained = parseToml(await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8")) as {
      mcp_servers: { local: { command: string }; repo_context?: unknown };
      agents?: unknown;
    };
    assert.equal(retained.mcp_servers.local.command, "local-server");
    assert.equal(retained.mcp_servers.repo_context, undefined);
    assert.equal(retained.agents, undefined);
    const retainedHooks = JSON.parse(await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    assert.deepEqual(retainedHooks.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
