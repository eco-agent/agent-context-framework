import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { decodeContextCapsuleLock } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "../src/context-capsule.js";
import {
  migrateContextCapsuleV2,
  planContextCapsuleV2Migration,
} from "../src/context-capsule-migration.js";
import { CONTEXT_MATERIALIZATION_PATH } from "../src/context-capsule-materialization.js";
import { resumeContextTransaction } from "../src/context-transaction.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const executeFile = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");

test("v2 capsule migration removes exact tracked skills and is repeatable", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-migration-"));
  const projectRoot = path.join(temporaryRoot, "application");
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "clean",
      acfState: "materialized",
      replace: false,
    });
    const capsule = await readContextCapsuleFile(
      path.join(projectRoot, ".agent-context/capsule.acf"),
    );
    const expandedSkill = path.join(projectRoot, ".codex/skills/diagnose/SKILL.md");
    const originalSkill = await readFile(expandedSkill);
    await writeFile(
      path.join(projectRoot, ".gitattributes"),
      "# Project-owned attributes\n*.txt text\n",
      "utf8",
    );
    await writeFile(expandedSkill, "local tracked edit\n", "utf8");
    const blocked = await planContextCapsuleV2Migration(capsule, projectRoot);
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.conflicts.map((conflict) => conflict.detail).join("\n"), /differs/u);
    await writeFile(expandedSkill, originalSkill);

    const plan = await planContextCapsuleV2Migration(capsule, projectRoot);
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.removedPaths, [
      ".codex/skills/diagnose/SKILL.md",
      ".codex/skills/diagnose/scripts/hitl-loop.template.sh",
    ]);
    assert.equal(plan.nextLock.schemaVersion, 3);
    assert.equal(plan.nextLock.materialization.files.length, 2);
    assert.equal(
      plan.nextLock.activation.some((record) => record.targetPath.startsWith(".codex/skills/")),
      false,
    );
    assert.deepEqual(plan.mutations.map((mutation) => mutation.targetPath), [
      ".agent-context/lock.json",
      ".gitattributes",
      ".codex/skills/diagnose/SKILL.md",
      ".codex/skills/diagnose/scripts/hitl-loop.template.sh",
    ]);

    await assert.rejects(
      migrateContextCapsuleV2(capsule, projectRoot, {
        afterMutation: (boundary) => {
          if (boundary.kind === "target-written" && boundary.targetPath === ".agent-context/lock.json") {
            throw new Error("injected migration interruption");
          }
        },
      }),
      /injected migration interruption/u,
    );
    const recovery = await resumeContextTransaction(projectRoot);
    assert.equal(recovery.status, "resumed");
    await assert.rejects(access(expandedSkill), /ENOENT/u);
    const lock = decodeContextCapsuleLock(JSON.parse(
      await readFile(path.join(projectRoot, ".agent-context/lock.json"), "utf8"),
    ) as unknown);
    assert.deepEqual(lock, plan.nextLock);
    const status = await git(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
    assert.match(status, / M \.agent-context\/lock\.json/u);
    assert.match(status, / M \.gitattributes/u);
    assert.match(status, / D \.codex\/skills\/diagnose\/SKILL\.md/u);
    assert.match(status, / D \.codex\/skills\/diagnose\/scripts\/hitl-loop\.template\.sh/u);
    assert.equal(
      await readFile(path.join(projectRoot, ".gitattributes"), "utf8"),
      "# Project-owned attributes\n*.txt text\n*.acf binary\n",
    );

    const current = await migrateContextCapsuleV2(capsule, projectRoot);
    assert.equal(current.status, "current");
    assert.deepEqual(current.writtenPaths, []);

    await git(projectRoot, ["add", "--all"]);
    await git(projectRoot, ["commit", "--quiet", "-m", "Migrate ACF capsule"]);
    await rm(path.join(projectRoot, ".agents"), { recursive: true, force: true });
    await rm(path.join(projectRoot, CONTEXT_MATERIALIZATION_PATH), { force: true });
    const bootstrap = await executeFile(
      process.execPath,
      [
        path.join(projectRoot, ".agent-context/bootstrap.mjs"),
        "materialize",
        "--cwd",
        projectRoot,
        "--json",
      ],
      { cwd: projectRoot, windowsHide: true },
    );
    const bootstrapResult = JSON.parse(bootstrap.stdout) as {
      materialization: { status: string };
    };
    assert.equal(bootstrapResult.materialization.status, "materialized");
    assert.equal((await git(projectRoot, ["status", "--porcelain=v1"])).trim(), "");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function git(cwd: string, arguments_: readonly string[]): Promise<string> {
  const result = await executeFile("git", arguments_, { cwd, windowsHide: true });
  return result.stdout;
}
