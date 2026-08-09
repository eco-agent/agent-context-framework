import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";

import {
  addComponent,
  diffProject,
  initProject,
  removeComponent,
} from "../src/context-installer.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

interface HookCommand {
  readonly type: "command";
  readonly command: string;
  readonly commandWindows: string;
}

interface HookMatcher {
  readonly matcher: string;
  readonly hooks: readonly HookCommand[];
}

interface HooksFile {
  readonly hooks: {
    readonly PreToolUse: readonly HookMatcher[];
    readonly SessionStart: readonly HookMatcher[];
  };
}

test("codex-hooks resolves only the isolated hook runtime and precise matcher ownership", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(
    resolveContextComponents(registry, ["codex-hooks"]).map((component) => component.name),
    ["core", "runtime-base", "codex-hooks"],
  );
  const component = registry.components.find((candidate) => candidate.name === "codex-hooks");
  assert.ok(component);
  assert.deepEqual(component.capabilities, [
    { kind: "runtime", name: "git", requirement: "required" },
    { kind: "runtime", name: "shell", requirement: "required" },
  ]);
  const hooksArtifact = component.artifacts.find((artifact) => artifact.operation === "json-array-items");
  assert.ok(hooksArtifact?.operation === "json-array-items");
  assert.deepEqual(hooksArtifact.ownedItems, [
    { arrayPointer: "/hooks/PreToolUse", identityPointer: "/matcher", identity: "^apply_patch$" },
    { arrayPointer: "/hooks/SessionStart", identityPointer: "/matcher", identity: "^compact$" },
  ]);
  const runtimeArtifacts = component.artifacts.filter((artifact) => artifact.operation === "runtime-workspace");
  assert.equal(runtimeArtifacts.length > 0, true);
  assert.equal(runtimeArtifacts.every((artifact) => artifact.sourcePath.includes("packages/hooks/")), true);

  const source = JSON.parse(
    await readFile(path.join(frameworkRoot, "registry", "sources", "codex", "hooks.json"), "utf8"),
  ) as HooksFile;
  for (const matcher of [...source.hooks.PreToolUse, ...source.hooks.SessionStart]) {
    const hook = matcher.hooks[0];
    assert.ok(hook);
    for (const command of [hook.command, hook.commandWindows]) {
      assert.match(command, /git rev-parse --show-toplevel/u);
      assert.match(command, /\.agent-context\/runtime\/packages\/hooks\/dist\/src\/codex-cli\.js/u);
      assert.doesNotMatch(command, /tools\/|tsx|~\/\.codex|[A-Za-z]:\\/u);
    }
  }
});

test("installed Codex hooks launch from root and nested directories and preserve unrelated matchers", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-hooks-"));
  try {
    const initialized = spawnSync("git", ["init", "--quiet"], {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.equal(initialized.status, 0, initialized.stderr);
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".codex", "hooks.json"),
      '{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[{"type":"command","command":"local"}]}]}}\n',
      "utf8",
    );
    await writeFile(path.join(projectRoot, "README.md"), "fixture\n", "utf8");
    const nested = path.join(projectRoot, "nested", "directory");
    await mkdir(nested, { recursive: true });

    await initProject(projectRoot, frameworkRoot);
    const added = await addComponent(projectRoot, frameworkRoot, "codex-hooks");
    assert.equal(added.plan.status, "ready");
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    const bootstrapped = await bootstrapRuntime({ projectRoot, mode: "install-and-build" });
    assert.equal(bootstrapped.status, "operational");
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);

    const hooksPath = path.join(projectRoot, ".codex", "hooks.json");
    const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as HooksFile;
    assert.deepEqual(hooks.hooks.PreToolUse.map((matcher) => matcher.matcher), ["^Bash$", "^apply_patch$"]);
    assert.deepEqual(hooks.hooks.SessionStart.map((matcher) => matcher.matcher), ["^compact$"]);
    const ownedCommand = hooks.hooks.PreToolUse.find((matcher) => matcher.matcher === "^apply_patch$")?.hooks[0];
    assert.ok(ownedCommand);
    const command = process.platform === "win32" ? ownedCommand.commandWindows : ownedCommand.command;
    const patchInput = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      session_id: "session-1",
      tool_input: { command: "*** Update File: README.md" },
    });
    for (const cwd of [projectRoot, nested]) {
      const inert = await runHookCommand(command, cwd, patchInput);
      assert.equal(inert.code, 0, inert.stderr);
      assert.equal(inert.stdout, "");
    }

    const bindingDirectory = path.join(
      projectRoot,
      ".agent-context",
      "runtime",
      "state",
      "codex-hooks",
    );
    await mkdir(bindingDirectory, { recursive: true });
    await writeFile(
      path.join(bindingDirectory, "session-1.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        sessionId: "session-1",
        expiresAtEpochMs: 4_102_444_800_000,
        writablePaths: ["README.md"],
        sources: [],
        compactContext: "Continue the bounded fixture session.",
      })}\n`,
      "utf8",
    );
    const allowed = await runHookCommand(command, nested, patchInput);
    assert.equal(allowed.code, 0, allowed.stderr);
    const allowedOutput = JSON.parse(allowed.stdout) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    assert.equal(allowedOutput.hookSpecificOutput.permissionDecision, "allow");

    const removed = await removeComponent(projectRoot, frameworkRoot, "codex-hooks");
    assert.equal(removed.plan.status, "ready");
    const retained = JSON.parse(await readFile(hooksPath, "utf8")) as HooksFile;
    assert.deepEqual(retained.hooks.PreToolUse.map((matcher) => matcher.matcher), ["^Bash$"]);
    assert.deepEqual(retained.hooks.SessionStart, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function runHookCommand(
  command: string,
  cwd: string,
  input: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({
      code: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8").trim(),
      stderr: Buffer.concat(stderr).toString("utf8").trim(),
    }));
    child.stdin.end(input);
  });
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
