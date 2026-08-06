import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addComponent,
  CONTEXT_CONFIG_PATH,
  CONTEXT_LOCK_PATH,
  diffProject,
  initProject,
  managedSectionMarkers,
} from "../src/context-installer.js";
import {
  formatContextResult,
  parseContextInstallerArguments,
} from "../src/context-installer-cli.js";

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
    assert.match(installed, /<!-- agent-context:core:start -->\n# Core rules/u);

    const config = JSON.parse(await readFile(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH), "utf8")) as unknown;
    assert.deepEqual(config, { schemaVersion: 1, adapter: "codex", components: ["core"] });
    const beforeSecond = await snapshotProject(fixture.projectRoot);
    const second = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(second.plan.status, "ready");
    assert.deepEqual(second.writtenPaths, []);
    assert.deepEqual(await snapshotProject(fixture.projectRoot), beforeSecond);
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).current, true);
  } finally {
    await fixture.remove();
  }
});

test("add resolves dependencies and refuses to adopt an existing whole-file target", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await mkdir(path.join(fixture.projectRoot, ".codex"), { recursive: true });
    await writeFile(path.join(fixture.projectRoot, ".codex", "tool.md"), "project owned\n");
    const configBefore = await readFile(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH), "utf8");
    const blocked = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(blocked.plan.status, "blocked");
    assert.deepEqual(blocked.writtenPaths, []);
    assert.equal(
      blocked.plan.assessments.find((assessment) => assessment.targetPath === ".codex/tool.md")?.status,
      "unmanaged-conflict",
    );
    assert.equal(await readFile(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH), "utf8"), configBefore);

    await rm(path.join(fixture.projectRoot, ".codex", "tool.md"));
    const added = await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools");
    assert.equal(added.plan.status, "ready");
    assert.deepEqual(added.writtenPaths, [".codex/tool.md", CONTEXT_CONFIG_PATH, CONTEXT_LOCK_PATH]);
    const lock = JSON.parse(await readFile(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH), "utf8")) as {
      readonly components: readonly string[];
    };
    assert.deepEqual(lock.components, ["core", "tools"]);
    assert.equal((await addComponent(fixture.projectRoot, fixture.frameworkRoot, "tools")).writtenPaths.length, 0);
  } finally {
    await fixture.remove();
  }
});

test("safe registry updates preserve text outside the managed section", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture.projectRoot, "AGENTS.md"), "Local prefix\n");
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await writeFile(path.join(fixture.projectRoot, "AGENTS.md"), `${await readFile(path.join(fixture.projectRoot, "AGENTS.md"), "utf8")}Local suffix\n`);
    assert.equal((await diffProject(fixture.projectRoot, fixture.frameworkRoot)).current, true);

    await writeFile(path.join(fixture.frameworkRoot, "registry", "components", "core", "AGENTS.md"), "# Core rules v2\n");
    await writeRegistry(fixture.frameworkRoot, "0.2.0");
    const updated = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(updated.plan.status, "ready");
    assert.deepEqual(updated.writtenPaths, ["AGENTS.md", CONTEXT_LOCK_PATH]);
    const installed = await readFile(path.join(fixture.projectRoot, "AGENTS.md"), "utf8");
    assert.match(installed, /^Local prefix\n/u);
    assert.match(installed, /# Core rules v2\n/u);
    assert.match(installed, /Local suffix\n$/u);
  } finally {
    await fixture.remove();
  }
});

test("managed-section drift and malformed markers block all writes", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    const original = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, original.replace("# Core rules", "# Locally edited rules"));
    await writeFile(path.join(fixture.frameworkRoot, "registry", "components", "core", "AGENTS.md"), "# Upstream rules\n");
    const lockBefore = await readFile(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH), "utf8");
    const drifted = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(drifted.plan.status, "blocked");
    assert.deepEqual(drifted.writtenPaths, []);
    assert.equal(drifted.plan.assessments[0]?.status, "drift");
    assert.equal(await readFile(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH), "utf8"), lockBefore);

    const markers = managedSectionMarkers("core");
    await writeFile(agentsPath, `${markers.start}\n# Core rules\n${markers.start}\n${markers.end}\n`);
    const malformed = await diffProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(malformed.plan.status, "blocked");
    assert.equal(malformed.plan.assessments[0]?.status, "malformed-section");
  } finally {
    await fixture.remove();
  }
});

test("stale lock ownership blocks an upstream artifact removal", async () => {
  const fixture = await createFixture();
  try {
    await initProject(fixture.projectRoot, fixture.frameworkRoot);
    await writeFile(
      path.join(fixture.frameworkRoot, "registry", "registry.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: "0.2.0",
        components: [{
          name: "core",
          dependencies: [],
          artifacts: [{
            ownership: "managed-file",
            sourcePath: "registry/components/core/replacement.md",
            targetPath: ".codex/replacement.md",
          }],
        }],
      }, null, 2)}\n`,
    );
    await writeFile(path.join(fixture.frameworkRoot, "registry", "components", "core", "replacement.md"), "replacement\n");
    const result = await initProject(fixture.projectRoot, fixture.frameworkRoot);
    assert.equal(result.plan.status, "blocked");
    assert.equal(result.plan.assessments.some((assessment) => assessment.status === "stale"), true);
    assert.equal(await fileExists(path.join(fixture.projectRoot, ".codex", "replacement.md")), false);
  } finally {
    await fixture.remove();
  }
});

test("project writes reject symbolic-link traversal", async (t) => {
  const fixture = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "agent-context-outside-"));
  try {
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
    const registryPath = path.join(fixture.frameworkRoot, "registry", "registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      revision: string;
      components: Array<{ name: string; dependencies: string[]; artifacts: unknown[] }>;
    };
    const tools = registry.components.find((component) => component.name === "tools");
    assert.ok(tools);
    tools.artifacts = [{
      ownership: "managed-file",
      sourcePath: "registry/components/tools/tool.md",
      targetPath: ".codex/linked/tool.md",
    }];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
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

test("registry sources must be exact UTF-8 text without a byte-order mark", async () => {
  const fixture = await createFixture();
  const sourcePath = path.join(fixture.frameworkRoot, "registry", "components", "core", "AGENTS.md");
  try {
    await writeFile(sourcePath, Uint8Array.from([0xff]));
    await assert.rejects(
      initProject(fixture.projectRoot, fixture.frameworkRoot),
      /must be valid UTF-8/u,
    );
    assert.equal(await fileExists(path.join(fixture.projectRoot, CONTEXT_CONFIG_PATH)), false);

    await writeFile(sourcePath, Uint8Array.from([0xef, 0xbb, 0xbf, 0x23, 0x0a]));
    await assert.rejects(
      initProject(fixture.projectRoot, fixture.frameworkRoot),
      /without a byte-order mark/u,
    );
    assert.equal(await fileExists(path.join(fixture.projectRoot, CONTEXT_LOCK_PATH)), false);
  } finally {
    await fixture.remove();
  }
});

test("CLI parsing and reporting keep init, add, and diff explicit", () => {
  assert.deepEqual(parseContextInstallerArguments(["init", "--cwd", "fixture"], "D:/repo"), {
    command: "init",
    projectRoot: path.resolve("D:/repo", "fixture"),
    component: null,
  });
  assert.deepEqual(parseContextInstallerArguments(["add", "tools"], "D:/repo"), {
    command: "add",
    projectRoot: "D:/repo",
    component: "tools",
  });
  assert.throws(() => parseContextInstallerArguments(["add"], "D:/repo"), /requires a component/u);
  assert.match(formatContextResult({
    command: "diff",
    projectRoot: "D:/repo",
    current: true,
    plan: { status: "ready", assessments: [], writes: [], nextLock: {
      schemaVersion: 1,
      registryRevision: "0.1.0",
      components: [],
      artifacts: [],
    }, lockChanged: false },
  }), /current: no installation differences/u);
});

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-installer-"));
  const frameworkRoot = path.join(root, "framework");
  const projectRoot = path.join(root, "project");
  await mkdir(path.join(frameworkRoot, "registry", "components", "core"), { recursive: true });
  await mkdir(path.join(frameworkRoot, "registry", "components", "tools"), { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(frameworkRoot, "registry", "components", "core", "AGENTS.md"), "# Core rules\n");
  await writeFile(path.join(frameworkRoot, "registry", "components", "tools", "tool.md"), "tool bytes\n");
  await writeRegistry(frameworkRoot, "0.1.0");
  return {
    frameworkRoot,
    projectRoot,
    remove: async () => await rm(root, { recursive: true, force: true }),
  };
}

async function writeRegistry(frameworkRoot: string, revision: string): Promise<void> {
  await writeFile(
    path.join(frameworkRoot, "registry", "registry.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      revision,
      components: [
        {
          name: "core",
          dependencies: [],
          artifacts: [{
            ownership: "managed-section",
            sourcePath: "registry/components/core/AGENTS.md",
            targetPath: "AGENTS.md",
            sectionId: "core",
          }],
        },
        {
          name: "tools",
          dependencies: ["core"],
          artifacts: [{
            ownership: "managed-file",
            sourcePath: "registry/components/tools/tool.md",
            targetPath: ".codex/tool.md",
          }],
        },
      ],
    }, null, 2)}\n`,
  );
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
