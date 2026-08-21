import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addComponent,
  CONTEXT_CONFIG_PATH,
  CONTEXT_LOCK_PATH,
  diffProject,
  doctorProject,
  initProject,
  inspectProject,
  planProjectSelection,
  recoverProject,
  removeComponent,
  type ContextSelectionPreview,
  updateProject,
} from "../src/context-installer.js";
import { formatContextResult, parseContextInstallerArguments } from "../src/context-installer-cli.js";

const componentRevision = `sha256:${"b".repeat(64)}`;

interface Fixture {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly remove: () => Promise<void>;
}

test("init preserves project prose and is byte-for-byte idempotent", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture.projectRoot, "AGENTS.md"), "# Local rules\n\nKeep this text.\n");
    const first = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(first.plan.status, "ready");
    assert.deepEqual(first.writtenPaths, ["AGENTS.md", CONTEXT_CONFIG_PATH, CONTEXT_LOCK_PATH]);
    const installed = await readFile(path.join(fixture.projectRoot, "AGENTS.md"), "utf8");
    assert.match(installed, /^# Local rules\n\nKeep this text\.\n/u);
    assert.match(installed, /<!-- agent-context:core:start -->\n\n# Core rules/u);

    const config = JSON.parse(await readFile(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH), "utf8")) as unknown;
    assert.deepEqual(config, { schemaVersion: 2, adapter: "codex", components: ["core"] });
    const before = await snapshotProject(fixture.projectRoot);
    assert.deepEqual((await initProject(fixture.projectRoot, fixture.frameworkRoot)).writtenPaths, []);
    assert.deepEqual(await snapshotProject(fixture.projectRoot), before);
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).current, true);
  } finally {
    await fixture.remove();
  }
});

test("update migrates legacy Markdown marker spacing without treating canonical spacing as local drift", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    const lockPath = path.join(fixture.projectRoot, CONTEXT_LOCK_PATH);
    const canonical = await readFile(agentsPath, "utf8");
    const legacy = canonical.replace("<!-- agent-context:core:start -->\n\n", "<!-- agent-context:core:start -->\n");
    await writeFile(agentsPath, legacy, "utf8");
    await writeLegacyMarkdownLock(lockPath);

    const migrated = await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local");
    assert.equal(migrated.plan.status, "ready");
    assert.deepEqual(migrated.writtenPaths, ["AGENTS.md", CONTEXT_LOCK_PATH]);
    assert.equal(await readFile(agentsPath, "utf8"), canonical);

    await writeLegacyMarkdownLock(lockPath);
    const provenanceOnly = await updateProject(
      fixture.projectRoot,
      fixture.frameworkRoot,
      null,
      "preserve-local",
    );
    assert.equal(provenanceOnly.plan.status, "ready");
    assert.deepEqual(provenanceOnly.writtenPaths, [CONTEXT_LOCK_PATH]);
    assert.equal(await readFile(agentsPath, "utf8"), canonical);
  } finally {
    await fixture.remove();
  }
});

test("installer preserves CRLF documents across install, status, and update", async () => {
  const fixture = await createFixture();
  try {
    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    await writeFile(agentsPath, "# Project\r\n\r\nLocal prose.\r\n", "utf8");
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).current, true);
    await writeCore(fixture.frameworkRoot, "# Core rules v2\n", "0.2.1");
    const updated = await updateProject(fixture.projectRoot, fixture.frameworkRoot, "core", "preserve-local");
    assert.equal(updated.plan.status, "ready");
    const installed = await readFile(agentsPath, "utf8");
    assert.equal(installed.replaceAll("\r\n", "").includes("\n"), false);
    assert.match(installed, /# Project\r\n\r\nLocal prose\.\r\n/u);
    assert.match(installed, /# Core rules v2\r\n/u);
  } finally {
    await fixture.remove();
  }
});

test("add resolves dependencies, reports capabilities, and refuses untracked whole files", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await mkdir(path.join(fixture.projectRoot, ".codex"), { recursive: true });
    await writeFile(path.join(fixture.projectRoot, ".codex", "tool.md"), "project owned\n");
    const preview = await planProjectSelection(
      fixture.projectRoot,
      fixture.frameworkRoot,
      ["tools"],
    );
    assert.equal(preview.status, "blocked");
    assert.deepEqual(preview.drift.plannedWritePaths, []);
    assert.equal(preview.drift.conflicts.some((item) => item.status === "untracked-conflict"), true);
    const blocked = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(blocked.plan.status, "blocked");
    assert.deepEqual(blocked.writtenPaths, []);
    assert.equal(blocked.plan.assessments.some((item) => item.status === "untracked-conflict"), true);

    await rm(path.join(fixture.projectRoot, ".codex", "tool.md"));
    const added = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(added.plan.status, "ready");
    assert.deepEqual(added.writtenPaths, [".codex/tool.md", CONTEXT_CONFIG_PATH, CONTEXT_LOCK_PATH]);
    assert.deepEqual(
      (await inspectProject(fixture.projectRoot, fixture.frameworkRoot)).selection,
      {
        ...(await planProjectSelection(fixture.projectRoot, fixture.frameworkRoot, [])),
        command: "plan",
      },
    );
    const doctor = await doctorProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(doctor.health, "healthy");
    assert.deepEqual(doctor.capabilities, [{ kind: "runtime", name: "network", requirement: "required" }]);
    assert.deepEqual(doctor.licenses, [{
      kind: "project",
      spdx: "MIT",
      sourcePath: "LICENSE",
      noticePath: "LICENSE",
      noticeSha256: "a".repeat(64),
    }]);
  } finally {
    await fixture.remove();
  }
});

test("selection preview resolves direct and transitive components through the real planner without writes", async () => {
  const fixture = await createFixture();
  try {
    const preview = await planProjectSelection(
      fixture.projectRoot,
      fixture.frameworkRoot,
      ["bundle"],
    );
    assert.equal(preview.status, "changes-ready");
    assert.equal(preview.initialized, false);
    assert.deepEqual(preview.currentDirectComponents, []);
    assert.deepEqual(preview.requestedComponents, ["bundle"]);
    assert.deepEqual(preview.directComponents, ["core", "bundle"]);
    assert.deepEqual(preview.resolvedComponents, ["core", "tools", "bundle"]);
    assert.deepEqual(preview.transitiveComponents, ["tools"]);
    assert.deepEqual(preview.bundleComponents, ["bundle"]);
    assert.deepEqual(preview.footprint, {
      componentCount: 3,
      directComponentCount: 2,
      transitiveComponentCount: 1,
      bundleCount: 1,
      artifactCount: 2,
      targetCount: 2,
      skillTargetCount: 0,
      runtimeTargetCount: 0,
    });
    assert.deepEqual(preview.capabilities, [
      { kind: "runtime", name: "network", requirement: "required" },
    ]);
    assert.equal(preview.licenses.length, 1);
    assert.equal(preview.capabilityAvailability, "not-inspected");
    assert.equal(preview.trustRequired, false);
    assert.deepEqual(preview.activations, []);
    assert.equal(preview.drift.plannedWritePaths.includes("AGENTS.md"), true);
    assert.equal(preview.drift.plannedWritePaths.includes(".codex/tool.md"), true);
    assert.equal(preview.drift.plannedWritePaths.includes(CONTEXT_CONFIG_PATH), true);
    assert.equal(preview.drift.plannedWritePaths.includes(CONTEXT_LOCK_PATH), true);
    assert.equal(await fileExists(path.join(fixture.projectRoot, "AGENTS.md")), false);
    assert.equal(await fileExists(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH)), false);
    assert.equal(await fileExists(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH)), false);
  } finally {
    await fixture.remove();
  }
});

test("seed-file adopts existing content and preserves it across update, remove, and re-add", async () => {
  const fixture = await createFixture();
  try {
    const seedPath = path.join(fixture.projectRoot, ".agent-context", "project-seed.json");
    await mkdir(path.dirname(seedPath), { recursive: true });
    await writeFile(seedPath, "{\"project\":true}\n", "utf8");
    await initProject(fixture.projectRoot, fixture.frameworkRoot);

    const preview = await planProjectSelection(fixture.projectRoot, fixture.frameworkRoot, ["seed"]);
    assert.equal(preview.status, "changes-ready");
    assert.deepEqual(preview.drift.plannedWritePaths, [CONTEXT_CONFIG_PATH, CONTEXT_LOCK_PATH]);

    const added = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "seed");
    assert.equal(added.plan.status, "ready");
    assert.deepEqual(await readFile(seedPath, "utf8"), "{\"project\":true}\n");
    assert.equal(
      added.plan.assessments.some((assessment) =>
        assessment.operation === "seed-file" && assessment.status === "uninstalled"),
      true,
    );

    await writeFile(seedPath, "{\"project\":\"edited\"}\n", "utf8");
    await writeFile(
      path.join(fixture.frameworkRoot, "registry", "sources", "seed.json"),
      "{\"canonical\":2}\n",
      "utf8",
    );
    await writeRegistry(fixture.frameworkRoot, "0.2.1");
    const updated = await updateProject(
      fixture.projectRoot,
      fixture.frameworkRoot,
      "seed",
      "preserve-local",
    );
    assert.equal(updated.plan.status, "ready");
    assert.equal(await readFile(seedPath, "utf8"), "{\"project\":\"edited\"}\n");
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).current, true);

    const removed = await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "seed");
    assert.equal(removed.plan.status, "ready");
    assert.equal(await readFile(seedPath, "utf8"), "{\"project\":\"edited\"}\n");

    await rm(seedPath);
    const readded = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "seed");
    assert.equal(readded.plan.status, "ready");
    assert.equal(await readFile(seedPath, "utf8"), "{\"canonical\":2}\n");
  } finally {
    await fixture.remove();
  }
});

test("explicit update distinguishes upstream, local, and diverged changes", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await writeCore(fixture.frameworkRoot, "# Core rules v2\n", "0.2.1");
    const upstream = await diffProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(upstream.plan.assessments[0]?.status, "upstream-changed");
    assert.match(upstream.plan.assessments[0]?.difference ?? "", /Core rules v2/u);
    const updated = await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local");
    assert.equal(updated.plan.status, "ready");
    assert.match(await readFile(path.join(fixture.projectRoot, "AGENTS.md"), "utf8"), /Core rules v2/u);

    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    await writeFile(agentsPath, (await readFile(agentsPath, "utf8")).replace("Core rules v2", "Local rules v2"));
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).plan.assessments[0]?.status, "locally-modified");
    const localUpdate = await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local");
    assert.equal(localUpdate.plan.status, "ready");
    assert.match(await readFile(agentsPath, "utf8"), /Local rules v2/u);

    await writeCore(fixture.frameworkRoot, "# Core rules v3\n", "0.2.2");
    const diverged = await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local");
    assert.equal(diverged.plan.status, "blocked");
    assert.equal(diverged.plan.assessments[0]?.status, "diverged");
    assert.deepEqual(diverged.writtenPaths, []);
    assert.match(await readFile(agentsPath, "utf8"), /Local rules v2/u);
    const overwritten = await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "overwrite-selected");
    assert.equal(overwritten.plan.status, "ready");
    assert.match(await readFile(agentsPath, "utf8"), /Core rules v3/u);
    assert.doesNotMatch(await readFile(agentsPath, "utf8"), /Local rules v2/u);
  } finally {
    await fixture.remove();
  }
});

test("remove deletes unchanged artifacts, preserves modified section content, and supports reinstall", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    const removed = await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(removed.plan.status, "ready");
    assert.equal(await fileExists(path.join(fixture.projectRoot, ".codex", "tool.md")), false);
    assert.equal((await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools")).plan.status, "ready");

    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    await writeFile(agentsPath, (await readFile(agentsPath, "utf8")).replace("# Core rules", "# Project-owned rules"));
    await assert.rejects(removeComponent(fixture.projectRoot, fixture.frameworkRoot, "core"), /cannot be removed/u);
  } finally {
    await fixture.remove();
  }
});

test("multiple owned sections share one document without cross-component replacement", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture.projectRoot, "AGENTS.md"), "Project preface.\n", "utf8");
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await addComponent(fixture.projectRoot, fixture.frameworkRoot, "guidance");
    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    const before = await readFile(agentsPath, "utf8");
    assert.match(before, /agent-context:core:start/u);
    assert.match(before, /agent-context:guidance:start/u);
    await writeCore(fixture.frameworkRoot, "# Core rules v2\n", "0.2.1");
    const updated = await updateProject(fixture.projectRoot, fixture.frameworkRoot, "core", "preserve-local");
    assert.equal(updated.plan.status, "ready");
    const after = await readFile(agentsPath, "utf8");
    assert.match(after, /Core rules v2/u);
    assert.match(after, /# Guidance\n/u);
    assert.match(after, /^Project preface\./u);
    await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "guidance");
    const removed = await readFile(agentsPath, "utf8");
    assert.match(removed, /agent-context:core:start/u);
    assert.doesNotMatch(removed, /agent-context:guidance/u);
  } finally {
    await fixture.remove();
  }
});

test("component additions in different orders produce the same owned artifacts", async () => {
  const fixture = await createFixture();
  try {
    const projectA = fixture.projectRoot;
    const projectB = path.join(path.dirname(projectA), "project-b");
    await mkdir(projectB);
    await initProject(projectA, fixture.frameworkRoot);
    await initProject(projectB, fixture.frameworkRoot);
    await addComponent(projectA, fixture.frameworkRoot, "tools");
    await addComponent(projectA, fixture.frameworkRoot, "structured");
    await addComponent(projectB, fixture.frameworkRoot, "structured");
    await addComponent(projectB, fixture.frameworkRoot, "tools");
    const ownedPaths = [
      "AGENTS.md",
      ".codex/tool.md",
      ".codex/hooks.json",
      ".codex/config.toml",
      "settings.json",
    ];
    for (const relativePath of ownedPaths) {
      assert.equal(
        await readFile(path.join(projectA, relativePath), "utf8"),
        await readFile(path.join(projectB, relativePath), "utf8"),
      );
    }
    assert.equal((await diffProject(projectA, fixture.frameworkRoot)).current, true);
    assert.equal((await diffProject(projectB, fixture.frameworkRoot)).current, true);
  } finally {
    await fixture.remove();
  }
});

test("locally modified skill files survive blocked update and component removal", async () => {
  const fixture = await createFixture();
  try {
    const skillTarget = ".codex/skills/sample/SKILL.md";
    await writeToolsTarget(fixture.frameworkRoot, skillTarget);
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    const installedSkill = path.join(fixture.projectRoot, ...skillTarget.split("/"));
    await writeFile(installedSkill, "project-owned skill\n", "utf8");
    await writeFile(path.join(fixture.frameworkRoot, "registry", "sources", "tool.md"), "upstream skill\n", "utf8");
    await writeRegistry(fixture.frameworkRoot, "0.2.1", skillTarget);
    const update = await updateProject(
      fixture.projectRoot,
      fixture.frameworkRoot,
      "tools",
      "preserve-local",
    );
    assert.equal(update.plan.status, "blocked");
    assert.equal(await readFile(installedSkill, "utf8"), "project-owned skill\n");
    const removed = await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(removed.plan.status, "ready");
    assert.equal(await readFile(installedSkill, "utf8"), "project-owned skill\n");
  } finally {
    await fixture.remove();
  }
});

test("obsolete structured artifacts are removed after their registry sources are deleted", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await mkdir(path.join(fixture.projectRoot, ".codex"), { recursive: true });
    await writeFile(
      path.join(fixture.projectRoot, ".codex", "config.toml"),
      "[agents]\ninterrupt_message = false\n",
    );
    await writeFile(
      path.join(fixture.projectRoot, ".codex", "hooks.json"),
      '{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[{"type":"command","command":"local"}]}]}}\n',
    );
    const added = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "structured");
    assert.equal(added.plan.status, "ready");
    const tomlPath = path.join(fixture.projectRoot, ".codex", "config.toml");
    const installedToml = await readFile(tomlPath, "utf8");
    assert.match(installedToml, /\[mcp_servers\.context\]/u);
    assert.match(installedToml, /interrupt_message = false/u);
    assert.match(installedToml, /max_concurrent_threads_per_session = 2/u);
    assert.match(installedToml, /\[agents\.worker\]/u);
    assert.doesNotMatch(installedToml, /not_owned/u);
    const installedHooks = JSON.parse(
      await readFile(path.join(fixture.projectRoot, ".codex", "hooks.json"), "utf8"),
    ) as { hooks: { PreToolUse: Array<{ matcher: string }>; SessionStart: Array<{ matcher: string }> } };
    assert.deepEqual(installedHooks.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$", "^ApplyPatch$"]);
    assert.deepEqual(installedHooks.hooks.SessionStart.map((item) => item.matcher), ["^compact$"]);

    await rm(path.join(fixture.frameworkRoot, "registry", "sources", "structured.json"));
    await rm(path.join(fixture.frameworkRoot, "registry", "sources", "structured.toml"));
    await rm(path.join(fixture.frameworkRoot, "registry", "sources", "structured-hooks.json"));
    await rm(path.join(fixture.frameworkRoot, "registry", "sources", "structured-members.toml"));
    await writeRegistry(fixture.frameworkRoot, "0.2.1", ".codex/tool.md", false);
    const removed = await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "structured");
    assert.equal(removed.plan.status, "ready");
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.projectRoot, "settings.json"), "utf8")), {});
    const removedToml = await readFile(tomlPath, "utf8");
    assert.match(removedToml, /interrupt_message = false/u);
    assert.doesNotMatch(removedToml, /max_concurrent_threads_per_session|agents\.worker|mcp_servers/u);
    const removedHooks = JSON.parse(
      await readFile(path.join(fixture.projectRoot, ".codex", "hooks.json"), "utf8"),
    ) as { hooks: { PreToolUse: Array<{ matcher: string }>; SessionStart: unknown[] } };
    assert.deepEqual(removedHooks.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$"]);
    assert.deepEqual(removedHooks.hooks.SessionStart, []);
  } finally {
    await fixture.remove();
  }
});

test("structured ownership rejects overlapping TOML paths and duplicate JSON item identities", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    const registryPath = path.join(fixture.frameworkRoot, "registry", "registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      components: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    const members = await readFile(
      path.join(fixture.frameworkRoot, "registry", "sources", "structured-members.toml"),
      "utf8",
    );
    registry.components.push({
      name: "collision",
      revision: componentRevision,
      dependencies: ["structured"],
      capabilities: [],
      licenses: [{
        kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
        noticeSha256: "a".repeat(64),
      }],
      artifacts: [{
        operation: "toml-members",
        sourcePath: "registry/sources/structured-members.toml",
        sourceSha256: sha(members),
        targetPath: ".codex/config.toml",
        ownedMembers: ["agents.worker.config_file"],
      }],
    });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await assert.rejects(
      addComponent(fixture.projectRoot, fixture.frameworkRoot, "collision"),
      /overlapping ownership paths agents\.worker and agents\.worker\.config_file/u,
    );

    const hooks = await readFile(
      path.join(fixture.frameworkRoot, "registry", "sources", "structured-hooks.json"),
      "utf8",
    );
    registry.components[registry.components.length - 1] = {
      name: "collision",
      revision: componentRevision,
      dependencies: ["structured"],
      capabilities: [],
      licenses: [{
        kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
        noticeSha256: "a".repeat(64),
      }],
      artifacts: [{
        operation: "json-array-items",
        sourcePath: "registry/sources/structured-hooks.json",
        sourceSha256: sha(hooks),
        targetPath: ".codex/hooks.json",
        ownedItems: [{
          arrayPointer: "/hooks/PreToolUse",
          identityPointer: "/matcher",
          identity: "^ApplyPatch$",
        }],
      }],
    };
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await assert.rejects(
      addComponent(fixture.projectRoot, fixture.frameworkRoot, "collision"),
      /duplicate array item ownership/u,
    );

    const seed = await readFile(
      path.join(fixture.frameworkRoot, "registry", "sources", "seed.json"),
      "utf8",
    );
    registry.components[registry.components.length - 1] = {
      name: "collision",
      revision: componentRevision,
      dependencies: ["structured"],
      capabilities: [],
      licenses: [{
        kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
        noticeSha256: "a".repeat(64),
      }],
      artifacts: [{
        operation: "seed-file",
        sourcePath: "registry/sources/seed.json",
        sourceSha256: sha(seed),
        targetPath: "settings.json",
      }],
    };
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await assert.rejects(
      addComponent(fixture.projectRoot, fixture.frameworkRoot, "collision"),
      /Whole-file target settings\.json cannot share ownership/u,
    );
  } finally {
    await fixture.remove();
  }
});

test("structured member updates replace owned values and removal preserves locally modified scopes", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await mkdir(path.join(fixture.projectRoot, ".codex"), { recursive: true });
    await writeFile(
      path.join(fixture.projectRoot, ".codex", "hooks.json"),
      '{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[{"type":"command","command":"project"}]}]}}\n',
      "utf8",
    );
    await writeFile(
      path.join(fixture.projectRoot, ".codex", "config.toml"),
      "[features]\ninterrupt_message = false\n",
      "utf8",
    );
    await addComponent(fixture.projectRoot, fixture.frameworkRoot, "structured");
    const hooksSourcePath = path.join(fixture.frameworkRoot, "registry", "sources", "structured-hooks.json");
    const membersSourcePath = path.join(fixture.frameworkRoot, "registry", "sources", "structured-members.toml");
    await writeFile(
      hooksSourcePath,
      (await readFile(hooksSourcePath, "utf8")).replace('"command":"owned"', '"command":"owned-v2"'),
    );
    await writeFile(
      membersSourcePath,
      (await readFile(membersSourcePath, "utf8")).replace("max_concurrent_threads_per_session = 2", "max_concurrent_threads_per_session = 3"),
    );
    await writeRegistry(fixture.frameworkRoot, "0.2.1");
    const updated = await updateProject(
      fixture.projectRoot,
      fixture.frameworkRoot,
      "structured",
      "preserve-local",
    );
    assert.equal(updated.plan.status, "ready");
    const hooksPath = path.join(fixture.projectRoot, ".codex", "hooks.json");
    const configPath = path.join(fixture.projectRoot, ".codex", "config.toml");
    assert.match(await readFile(hooksPath, "utf8"), /owned-v2/u);
    assert.match(await readFile(configPath, "utf8"), /max_concurrent_threads_per_session = 3/u);

    await writeFile(
      hooksPath,
      (await readFile(hooksPath, "utf8")).replace("owned-v2", "project-owned"),
    );
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace("max_concurrent_threads_per_session = 3", "max_concurrent_threads_per_session = 4"),
    );
    await writeFile(
      hooksSourcePath,
      (await readFile(hooksSourcePath, "utf8")).replace('"command":"owned-v2"', '"command":"owned-v3"'),
    );
    await writeFile(
      membersSourcePath,
      (await readFile(membersSourcePath, "utf8")).replace("max_concurrent_threads_per_session = 3", "max_concurrent_threads_per_session = 5"),
    );
    await writeRegistry(fixture.frameworkRoot, "0.2.2");
    assert.equal(
      (await updateProject(
        fixture.projectRoot,
        fixture.frameworkRoot,
        "structured",
        "preserve-local",
      )).plan.status,
      "blocked",
    );
    const overwritten = await updateProject(
      fixture.projectRoot,
      fixture.frameworkRoot,
      "structured",
      "overwrite-selected",
    );
    assert.equal(overwritten.plan.status, "ready");
    assert.match(await readFile(hooksPath, "utf8"), /owned-v3/u);
    assert.doesNotMatch(await readFile(hooksPath, "utf8"), /project-owned/u);
    assert.match(await readFile(hooksPath, "utf8"), /\^Bash\$/u);
    assert.match(await readFile(configPath, "utf8"), /max_concurrent_threads_per_session = 5/u);
    assert.match(await readFile(configPath, "utf8"), /interrupt_message = false/u);
    await writeFile(
      hooksPath,
      (await readFile(hooksPath, "utf8")).replace("owned-v3", "project-owned-after-overwrite"),
    );
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace("max_concurrent_threads_per_session = 5", "max_concurrent_threads_per_session = 6"),
    );
    const removed = await removeComponent(fixture.projectRoot, fixture.frameworkRoot, "structured");
    assert.equal(removed.plan.status, "ready");
    assert.match(await readFile(hooksPath, "utf8"), /project-owned-after-overwrite/u);
    assert.match(await readFile(configPath, "utf8"), /max_concurrent_threads_per_session = 6/u);
    const lock = JSON.parse(await readFile(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH), "utf8")) as {
      components: string[];
      artifacts: Array<{ component: string }>;
    };
    assert.deepEqual(lock.components, ["core"]);
    assert.equal(lock.artifacts.some((artifact) => artifact.component === "structured"), false);
  } finally {
    await fixture.remove();
  }
});

test("malformed markers and symbolic-link traversal prevent writes", async (t) => {
  const fixture = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "agent-context-outside-"));
  try {
    await writeFile(
      path.join(fixture.projectRoot, "AGENTS.md"),
      "<!-- agent-context:core:start -->\n# One\n<!-- agent-context:core:start -->\n<!-- agent-context:core:end -->\n",
    );
    const malformed = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(malformed.plan.status, "blocked");
    assert.equal(malformed.plan.assessments[0]?.status, "untracked-conflict");

    await rm(path.join(fixture.projectRoot, "AGENTS.md"));
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await mkdir(path.join(fixture.projectRoot, ".codex"), { recursive: true });
    try {
      await symlink(outside, path.join(fixture.projectRoot, ".codex", "linked"), "junction");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        t.skip("This Windows environment does not permit junction creation.");
        return;
      }
      throw error;
    }
    await writeToolsTarget(fixture.frameworkRoot, ".codex/linked/tool.md");
    await assert.rejects(
      addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools"),
      /traverses symbolic link/u,
    );
    assert.equal(await fileExists(path.join(outside, "tool.md")), false);
  } finally {
    await fixture.remove();
    await rm(outside, { recursive: true, force: true });
  }
});

test("doctor explains an interrupted transaction and mutators refuse it", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await writeFile(path.join(fixture.projectRoot, ".agent-context", "transaction.json"), `${JSON.stringify({
      schemaVersion: 1,
      command: "update",
      registryRevision: "0.2.0",
      mutations: [],
    }, null, 2)}\n`);
    const doctor = await doctorProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(doctor.health, "attention");
    assert.match(doctor.diagnostics[0] ?? "", /Incomplete update transaction/u);
    assert.equal(doctor.transaction.status, "resumable");
    await assert.rejects(
      updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local"),
      /incomplete context transaction/u,
    );
    assert.equal((await recoverProject(fixture.projectRoot)).status, "resumed");
    assert.equal(
      (await updateProject(fixture.projectRoot, fixture.frameworkRoot, null, "preserve-local")).plan.status,
      "ready",
    );
  } finally {
    await fixture.remove();
  }
});

test("registry sources reject hash drift, invalid UTF-8, and BOMs", async () => {
  const fixture = await createFixture();
  const sourcePath = path.join(fixture.frameworkRoot, "registry", "sources", "core.md");
  try {
    await writeFile(sourcePath, "changed without registry rebuild\n");
    await assert.rejects(initProject(fixture.projectRoot, fixture.frameworkRoot), /source hash mismatch/u);
    await writeFile(sourcePath, Uint8Array.from([0xff]));
    await assert.rejects(initProject(fixture.projectRoot, fixture.frameworkRoot), /valid UTF-8/u);
    await writeFile(sourcePath, Uint8Array.from([0xef, 0xbb, 0xbf, 0x23, 0x0a]));
    await assert.rejects(initProject(fixture.projectRoot, fixture.frameworkRoot), /without a byte-order mark/u);
  } finally {
    await fixture.remove();
  }
});

test("CLI exposes the complete lifecycle and keeps JSON read-only", () => {
  assert.deepEqual(parseContextInstallerArguments(["init", "--cwd", "fixture"], "D:/repo"), {
    command: "init", projectRoot: path.resolve("D:/repo", "fixture"), component: null, output: "text",
  });
  assert.deepEqual(parseContextInstallerArguments(["update", "frontend"], "D:/repo"), {
    command: "update", projectRoot: "D:/repo", component: "frontend", output: "text", mode: "preserve-local",
  });
  assert.deepEqual(parseContextInstallerArguments(["update", "frontend", "--overwrite"], "D:/repo"), {
    command: "update", projectRoot: "D:/repo", component: "frontend", output: "text", mode: "overwrite-selected",
  });
  assert.deepEqual(parseContextInstallerArguments(["doctor", "--json"], "D:/repo"), {
    command: "doctor", projectRoot: "D:/repo", component: null, output: "json",
  });
  assert.deepEqual(parseContextInstallerArguments(["recover"], "D:/repo"), {
    command: "recover", projectRoot: "D:/repo", component: null, output: "text",
  });
  assert.deepEqual(parseContextInstallerArguments(["setup", "--port", "4312", "--no-open"], "D:/repo"), {
    command: "setup", projectRoot: "D:/repo", component: null, output: "text", port: 4312, openBrowser: false,
    exitAfterInstall: false,
  });
  assert.throws(() => parseContextInstallerArguments(["add"], "D:/repo"), /requires a component/u);
  assert.throws(() => parseContextInstallerArguments(["init", "--json"], "D:/repo"), /read-only/u);
  assert.throws(() => parseContextInstallerArguments(["remove", "frontend", "--overwrite"], "D:/repo"), /valid only.*update/u);
  assert.throws(() => parseContextInstallerArguments(["update", "--overwrite", "--overwrite"], "D:/repo"), /only once/u);
  assert.throws(() => parseContextInstallerArguments(["doctor", "--no-open"], "D:/repo"), /valid only.*setup/u);
  assert.throws(() => parseContextInstallerArguments(["setup", "--port", "70000"], "D:/repo"), /integer from 0/u);
  assert.match(formatContextResult({
    command: "inspect",
    projectRoot: "D:/repo",
    initialized: false,
    hasAgents: false,
    hasCodexConfig: false,
    hasCodexHooks: false,
    registryRevision: "0.2.0",
    selection: selectionPreviewFixture("D:/repo"),
  }), /initialized: no/u);
});

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-installer-"));
  const frameworkRoot = path.join(root, "framework");
  const projectRoot = path.join(root, "project");
  await mkdir(path.join(frameworkRoot, "registry", "sources"), { recursive: true });
  await mkdir(path.join(frameworkRoot, "registry", "decisions"), { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(frameworkRoot, "registry", "sources", "core.md"), "# Core rules\n");
  await writeFile(path.join(frameworkRoot, "registry", "sources", "tool.md"), "tool bytes\n");
  await writeFile(path.join(frameworkRoot, "registry", "sources", "guidance.md"), "# Guidance\n");
  await writeFile(path.join(frameworkRoot, "registry", "sources", "seed.json"), "{\"canonical\":1}\n");
  await writeFile(
    path.join(frameworkRoot, "registry", "sources", "structured.json"),
    '{"owned":{"enabled":true},"notOwned":true}\n',
  );
  await writeFile(
    path.join(frameworkRoot, "registry", "sources", "structured.toml"),
    '[mcp_servers.context]\ncommand = "node"\n\n[mcp_servers.not_owned]\ncommand = "other"\n',
  );
  await writeFile(
    path.join(frameworkRoot, "registry", "sources", "structured-hooks.json"),
    '{"hooks":{"PreToolUse":[{"matcher":"^ApplyPatch$","hooks":[{"type":"command","command":"owned"}]}],"SessionStart":[{"matcher":"^compact$","hooks":[{"type":"command","command":"compact"}]}]}}\n',
  );
  await writeFile(
    path.join(frameworkRoot, "registry", "sources", "structured-members.toml"),
    '[agents]\nmax_concurrent_threads_per_session = 2\n\n[agents.worker]\ndescription = "Worker"\nconfig_file = "agents/worker.toml"\n',
  );
  await writeFile(path.join(frameworkRoot, "registry", "decisions", "0.2.0.md"), "# Decision\n");
  await writeRegistry(frameworkRoot, "0.2.0");
  return { frameworkRoot, projectRoot, remove: async () => await rm(root, { recursive: true, force: true }) };
}

async function writeCore(frameworkRoot: string, content: string, revision: string): Promise<void> {
  await writeFile(path.join(frameworkRoot, "registry", "sources", "core.md"), content);
  await writeRegistry(frameworkRoot, revision);
}

async function writeToolsTarget(frameworkRoot: string, targetPath: string): Promise<void> {
  await writeRegistry(frameworkRoot, "0.2.0", targetPath);
}

async function writeRegistry(
  frameworkRoot: string,
  revision: string,
  toolsTarget = ".codex/tool.md",
  includeStructured = true,
): Promise<void> {
  const core = await readFile(path.join(frameworkRoot, "registry", "sources", "core.md"), "utf8");
  const tool = await readFile(path.join(frameworkRoot, "registry", "sources", "tool.md"), "utf8");
  const guidance = await readFile(path.join(frameworkRoot, "registry", "sources", "guidance.md"), "utf8");
  const seed = await readFile(path.join(frameworkRoot, "registry", "sources", "seed.json"), "utf8");
  const structuredArtifacts = includeStructured
    ? await structuredRegistryArtifacts(frameworkRoot)
    : [];
  const registry = {
    schemaVersion: 2,
    revision,
    decisionPath: "registry/decisions/0.2.0.md",
    components: [
      {
        name: "core", revision: componentRevision, dependencies: [], capabilities: [],
        licenses: [{
          kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [{
          operation: "text-section", sourcePath: "registry/sources/core.md", sourceSha256: sha(core),
          targetPath: "AGENTS.md", sectionId: "core", markerStyle: "markdown",
        }],
      },
      {
        name: "guidance", revision: componentRevision, dependencies: ["core"], capabilities: [],
        licenses: [{
          kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [{
          operation: "text-section", sourcePath: "registry/sources/guidance.md", sourceSha256: sha(guidance),
          targetPath: "AGENTS.md", sectionId: "guidance", markerStyle: "markdown",
        }],
      },
      ...(includeStructured
        ? [{
            name: "structured", revision: componentRevision, dependencies: ["core"], capabilities: [],
            licenses: [{
              kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
              noticeSha256: "a".repeat(64),
            }],
            artifacts: structuredArtifacts,
          }]
        : []),
      {
        name: "seed", revision: componentRevision, dependencies: ["core"], capabilities: [],
        licenses: [{
          kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [{
          operation: "seed-file", sourcePath: "registry/sources/seed.json", sourceSha256: sha(seed),
          targetPath: ".agent-context/project-seed.json",
        }],
      },
      {
        name: "tools", revision: componentRevision, dependencies: ["core"],
        capabilities: [{ kind: "runtime", name: "network", requirement: "required" }],
        licenses: [{
          kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [{
          operation: "file", sourcePath: "registry/sources/tool.md", sourceSha256: sha(tool),
          targetPath: toolsTarget, mediaType: "text/markdown",
        }],
      },
      {
        name: "bundle", revision: componentRevision, dependencies: ["tools"], capabilities: [],
        licenses: [{
          kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [],
      },
    ],
  };
  await writeFile(path.join(frameworkRoot, "registry", "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
}

async function structuredRegistryArtifacts(frameworkRoot: string): Promise<readonly Record<string, unknown>[]> {
  const json = await readFile(path.join(frameworkRoot, "registry", "sources", "structured.json"), "utf8");
  const toml = await readFile(path.join(frameworkRoot, "registry", "sources", "structured.toml"), "utf8");
  const hooks = await readFile(path.join(frameworkRoot, "registry", "sources", "structured-hooks.json"), "utf8");
  const members = await readFile(path.join(frameworkRoot, "registry", "sources", "structured-members.toml"), "utf8");
  return [
    {
      operation: "json-members", sourcePath: "registry/sources/structured.json", sourceSha256: sha(json),
      targetPath: "settings.json", ownedPointers: ["/owned"],
    },
    {
      operation: "json-array-items", sourcePath: "registry/sources/structured-hooks.json", sourceSha256: sha(hooks),
      targetPath: ".codex/hooks.json", ownedItems: [
        { arrayPointer: "/hooks/PreToolUse", identityPointer: "/matcher", identity: "^ApplyPatch$" },
        { arrayPointer: "/hooks/SessionStart", identityPointer: "/matcher", identity: "^compact$" },
      ],
    },
    {
      operation: "toml-tables", sourcePath: "registry/sources/structured.toml", sourceSha256: sha(toml),
      targetPath: ".codex/config.toml", ownedTables: ["mcp_servers.context"], sectionId: "context-runtime",
    },
    {
      operation: "toml-members", sourcePath: "registry/sources/structured-members.toml", sourceSha256: sha(members),
      targetPath: ".codex/config.toml", ownedMembers: [
        "agents.max_concurrent_threads_per_session",
        "agents.worker",
      ],
    },
  ];
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function writeLegacyMarkdownLock(lockPath: string): Promise<void> {
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    artifacts: Array<{ operation: string; installedSha256: string }>;
  };
  const core = lock.artifacts.find((artifact) => artifact.operation === "text-section");
  if (core === undefined) assert.fail("Fixture lock must contain the core text section.");
  core.installedSha256 = sha("# Core rules\n");
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function selectionPreviewFixture(projectRoot: string): ContextSelectionPreview {
  return {
    command: "plan",
    projectRoot,
    initialized: false,
    registryRevision: "0.2.0",
    status: "changes-ready",
    currentDirectComponents: [],
    requestedComponents: [],
    directComponents: ["core"],
    resolvedComponents: ["core"],
    transitiveComponents: [],
    bundleComponents: [],
    footprint: {
      componentCount: 1,
      directComponentCount: 1,
      transitiveComponentCount: 0,
      bundleCount: 0,
      artifactCount: 1,
      targetCount: 1,
      skillTargetCount: 0,
      runtimeTargetCount: 0,
    },
    capabilities: [],
    capabilityAvailability: "not-inspected",
    licenses: [],
    trustRequired: false,
    activations: [],
    drift: {
      assessmentCounts: [{ status: "uninstalled", count: 1 }],
      conflicts: [],
      plannedWritePaths: ["AGENTS.md", CONTEXT_CONFIG_PATH, CONTEXT_LOCK_PATH],
      configChangeRequired: true,
      lockChangeRequired: true,
    },
  };
}

async function snapshotProject(projectRoot: string): Promise<readonly string[]> {
  return await Promise.all([
    readFile(path.join(projectRoot, "AGENTS.md"), "utf8"),
    readFile(path.join(projectRoot, CONTEXT_CONFIG_PATH), "utf8"),
    readFile(path.join(projectRoot, CONTEXT_LOCK_PATH), "utf8"),
  ]);
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await readFile(candidate);
    return true;
  } catch {
    return false;
  }
}
