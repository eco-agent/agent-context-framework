import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";
import { parse as parseToml } from "smol-toml";

import {
  addComponent,
  diffProject,
  doctorProject,
  initProject,
  removeComponent,
} from "../src/context-installer.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("codex-agents resolves the explicit authority-based model profile", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.equal(registry.revision, "0.13.0");
  assert.equal(registry.components.length, 36);
  assert.deepEqual(
    resolveContextComponents(registry, ["codex-agents"]).map((component) => component.name),
    ["core", "codex-agents"],
  );
  const component = registry.components.find((candidate) => candidate.name === "codex-agents");
  assert.ok(component);
  const configArtifact = component.artifacts.find((artifact) => artifact.operation === "toml-members");
  assert.ok(configArtifact?.operation === "toml-members");
  assert.deepEqual(configArtifact.ownedMembers, [
    "agents.default",
    "agents.interrupt_message",
    "agents.scout",
    "agents.worker",
  ]);

  const expectedProfile = new Map([
    ["default", { model: "gpt-5.6-sol", effort: "high" }],
    ["scout", { model: "gpt-5.6-luna", effort: "max" }],
    ["worker", { model: "gpt-5.6-sol", effort: "high" }],
  ]);
  for (const [name, expected] of expectedProfile) {
    const sourcePath = path.join(frameworkRoot, "registry", "sources", "codex", "agents", `${name}.toml`);
    const rootProfilePath = path.join(frameworkRoot, ".codex", "agents", `${name}.toml`);
    const source = await readFile(sourcePath, "utf8");
    assert.equal(source, await readFile(rootProfilePath, "utf8"));
    const profile = parseToml(source) as {
      name: string;
      model: string;
      model_reasoning_effort: string;
      sandbox_mode?: string;
    };
    assert.equal(profile.name, name);
    assert.equal(profile.model, expected.model);
    assert.equal(profile.model_reasoning_effort, expected.effort);
    assert.equal(profile.sandbox_mode, name === "scout" ? "read-only" : undefined);
  }
  const config = parseToml(await readFile(path.join(frameworkRoot, configArtifact.sourcePath), "utf8")) as {
    agents: Record<string, unknown>;
  };
  for (const obsolete of [
    "enabled",
    "max_concurrent_threads_per_session",
    "default_subagent_model",
    "default_subagent_reasoning_effort",
  ]) {
    assert.equal(Object.hasOwn(config.agents, obsolete), false, obsolete);
  }
});

test("codex-agents doctor rejects obsolete bootstrap concurrency settings", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-agent-obsolete-"));
  try {
    await initProject(projectRoot, frameworkRoot);
    await addComponent(projectRoot, frameworkRoot, "codex-agents");
    const configPath = path.join(projectRoot, ".codex", "config.toml");
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace(
        "[agents]\n",
        "[agents]\nmax_concurrent_threads_per_session = 2\n",
      ),
      "utf8",
    );
    const doctor = await doctorProject(projectRoot, frameworkRoot);
    assert.equal(doctor.codexInterface?.status, "invalid");
    assert.match(doctor.diagnostics.join("\n"), /agents\.max_concurrent_threads_per_session is obsolete/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("codex-agents install and removal preserve unrelated Codex configuration", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-agents-"));
  try {
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".codex", "config.toml"),
      '[mcp_servers.local]\ncommand = "local-server"\n',
      "utf8",
    );
    await initProject(projectRoot, frameworkRoot);
    const added = await addComponent(projectRoot, frameworkRoot, "codex-agents");
    assert.equal(added.plan.status, "ready");
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    const installed = parseToml(await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8")) as {
      agents: {
        default: { config_file: string };
        scout: { config_file: string };
        worker: { config_file: string };
      };
      mcp_servers: { local: { command: string } };
    };
    assert.equal(installed.mcp_servers.local.command, "local-server");
    assert.equal(installed.agents.default.config_file, "./agents/default.toml");
    assert.equal(installed.agents.scout.config_file, "./agents/scout.toml");
    assert.equal(installed.agents.worker.config_file, "./agents/worker.toml");

    const removed = await removeComponent(projectRoot, frameworkRoot, "codex-agents");
    assert.equal(removed.plan.status, "ready");
    const retained = parseToml(await readFile(path.join(projectRoot, ".codex", "config.toml"), "utf8")) as {
      agents?: unknown;
      mcp_servers: { local: { command: string } };
    };
    assert.equal(retained.mcp_servers.local.command, "local-server");
    assert.equal(retained.agents, undefined);
    for (const name of ["default", "scout", "worker"]) {
      assert.equal(await exists(path.join(projectRoot, ".codex", "agents", `${name}.toml`)), false);
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
