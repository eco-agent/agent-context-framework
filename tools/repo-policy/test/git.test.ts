import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { collectBranchChangedFiles } from "../src/git.js";

const executeFile = promisify(execFile);

test("branch verification uses development as its default base", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-git-base-"));
  try {
    await git(root, ["init", "--quiet"]);
    await git(root, ["config", "user.name", "Agent Context Test"]);
    await git(root, ["config", "user.email", "agent-context@example.invalid"]);
    await writeFile(path.join(root, "baseline.txt"), "baseline\n", "utf8");
    await git(root, ["add", "baseline.txt"]);
    await git(root, ["commit", "--quiet", "-m", "baseline"]);
    await git(root, ["branch", "development"]);
    const developmentRevision = (await git(root, ["rev-parse", "development"])).trim();
    await git(root, ["switch", "--quiet", "-c", "codex/test"]);
    await writeFile(path.join(root, "task.txt"), "task\n", "utf8");
    await git(root, ["add", "task.txt"]);
    await git(root, ["commit", "--quiet", "-m", "task"]);

    const changeSet = await collectBranchChangedFiles(root);
    assert.equal(changeSet.base, developmentRevision);
    assert.deepEqual(changeSet.files, ["task.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function git(root: string, arguments_: readonly string[]): Promise<string> {
  const result = await executeFile("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.stdout;
}
