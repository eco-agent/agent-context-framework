import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  CONTEXT_INSTALLER_HELP,
  parseContextInstallerArguments,
} from "../src/context-installer-cli.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("root package exposes a working acf executable", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(frameworkRoot, "package.json"), "utf8"),
  ) as { bin?: Record<string, string> };
  const binPath = manifest.bin?.acf;
  assert.equal(binPath, "./tools/dev-tooling/bin/acf.mjs");
  assert.ok(binPath);
  const invocation = spawnSync(
    process.execPath,
    [path.join(frameworkRoot, binPath), "help"],
    { cwd: frameworkRoot, encoding: "utf8", windowsHide: true },
  );
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.match(invocation.stdout, /acf repo ui/u);
});

test("CLI exposes capsule operations and the global repository catalog", () => {
  assert.match(CONTEXT_INSTALLER_HELP, /pack \[COMPONENT\.\.\.\]/u);
  assert.match(CONTEXT_INSTALLER_HELP, /sync/u);
  assert.match(CONTEXT_INSTALLER_HELP, /diff --before CAPSULE --after CAPSULE/u);
  assert.match(CONTEXT_INSTALLER_HELP, /repo register/u);
  assert.match(CONTEXT_INSTALLER_HELP, /repo status/u);
  assert.match(CONTEXT_INSTALLER_HELP, /repo ui/u);
  assert.doesNotMatch(CONTEXT_INSTALLER_HELP, /\binit\b|\badd\b|\bremove\b|\bmigrate\b/u);

  assert.deepEqual(
    parseContextInstallerArguments(["pack", "codex-runtime", "repository-policy", "--json"], "D:\\project"),
    {
      command: "pack",
      projectRoot: path.resolve("D:\\project"),
      components: ["codex-runtime", "repository-policy"],
      json: true,
    },
  );
  assert.deepEqual(parseContextInstallerArguments(["sync", "--cwd", "fixture"], "D:\\project"), {
    command: "sync",
    projectRoot: path.resolve("D:\\project", "fixture"),
    json: false,
  });
  assert.deepEqual(parseContextInstallerArguments(["sync", "--all", "--json"], "D:\\project"), {
    command: "sync-all",
    json: true,
  });
  assert.deepEqual(parseContextInstallerArguments(["repo", "register", "--cwd", "fixture"], "D:\\project"), {
    command: "repo-register",
    projectRoot: path.resolve("D:\\project", "fixture"),
    json: false,
  });
  assert.deepEqual(parseContextInstallerArguments(["repo", "list", "--json"], "D:\\project"), {
    command: "repo-list",
    json: true,
  });
  assert.deepEqual(parseContextInstallerArguments(["repo", "status", "a".repeat(64)], "D:\\project"), {
    command: "repo-status",
    id: "a".repeat(64),
    json: false,
  });
  assert.deepEqual(parseContextInstallerArguments(["repo", "forget", "b".repeat(64)], "D:\\project"), {
    command: "repo-forget",
    id: "b".repeat(64),
    json: false,
  });
  assert.deepEqual(
    parseContextInstallerArguments(["repo", "ui", "--port", "4312", "--no-open"], "D:\\project"),
    { command: "repo-ui", port: 4312, openBrowser: false },
  );
  assert.deepEqual(
    parseContextInstallerArguments(
      ["diff", "--before", "before.acf", "--after", "after.acf"],
      "D:\\project",
    ),
    {
      command: "diff",
      beforePath: path.resolve("D:\\project", "before.acf"),
      afterPath: path.resolve("D:\\project", "after.acf"),
      json: false,
    },
  );
  assert.throws(() => parseContextInstallerArguments(["init"], "D:\\project"), /Usage:/u);
  assert.throws(
    () => parseContextInstallerArguments(["pack", "core", "core"], "D:\\project"),
    /duplicate component/u,
  );
  assert.throws(() => parseContextInstallerArguments(["diff"], "D:\\project"), /requires/u);
  assert.throws(() => parseContextInstallerArguments(["repo", "forget"], "D:\\project"), /requires/u);
  assert.throws(() => parseContextInstallerArguments(["repo", "list", "unexpected"], "D:\\project"), /does not accept/u);
  assert.throws(() => parseContextInstallerArguments(["repo", "ui", "--json"], "D:\\project"), /accepts only/u);
});
