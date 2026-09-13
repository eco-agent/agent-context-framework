import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  CONTEXT_INSTALLER_HELP,
  parseContextInstallerArguments,
} from "../src/context-installer-cli.js";

test("CLI exposes only pack, sync, and diff", () => {
  assert.match(CONTEXT_INSTALLER_HELP, /pack \[COMPONENT\.\.\.\]/u);
  assert.match(CONTEXT_INSTALLER_HELP, /sync/u);
  assert.match(CONTEXT_INSTALLER_HELP, /diff --before CAPSULE --after CAPSULE/u);
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
});
