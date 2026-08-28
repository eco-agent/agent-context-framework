import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { decodeContextCapsuleLock } from "@agent-context/repo-policy";

import { bootstrapContextCapsule } from "../src/context-capsule-bootstrap.js";
import { readContextCapsuleFile } from "../src/context-capsule.js";
import {
  planContextCapsuleV3Update,
  updateContextCapsuleV3,
} from "../src/context-capsule-update.js";
import { resumeContextTransaction } from "../src/context-transaction.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("capsule update publishes the binary capsule and lock together and recovers interruption", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-update-"));
  const projectRoot = path.join(temporaryRoot, "application");
  const nextRevision = "e".repeat(40);
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "clean",
      acfState: "runtime-migrated",
      replace: false,
    });
    const previousCapsule = await readContextCapsuleFile(
      path.join(projectRoot, ".agent-context/capsule.acf"),
    );
    const plan = await planContextCapsuleV3Update(
      frameworkRoot,
      projectRoot,
      nextRevision,
    );
    assert.equal(plan.status, "ready");
    if (plan.status !== "ready") return;
    assert.deepEqual(plan.mutations.map((mutation) => mutation.targetPath), [
      ".agent-context/capsule.acf",
      ".agent-context/lock.json",
    ]);
    assert.equal(plan.restart.required, false);

    await assert.rejects(
      updateContextCapsuleV3(
        frameworkRoot,
        projectRoot,
        nextRevision,
        {
          afterMutation: (boundary) => {
            if (
              boundary.kind === "target-written" &&
              boundary.targetPath === ".agent-context/capsule.acf"
            ) {
              throw new Error("injected capsule publication interruption");
            }
          },
        },
      ),
      /injected capsule publication interruption/u,
    );
    const recovery = await resumeContextTransaction(projectRoot);
    assert.equal(recovery.status, "resumed");

    const publishedCapsule = await readContextCapsuleFile(
      path.join(projectRoot, ".agent-context/capsule.acf"),
    );
    assert.notEqual(publishedCapsule.capsuleSha256, previousCapsule.capsuleSha256);
    assert.equal(publishedCapsule.payload.frameworkRevision, nextRevision);
    const publishedLock = decodeContextCapsuleLock(JSON.parse(
      await readFile(path.join(projectRoot, ".agent-context/lock.json"), "utf8"),
    ) as unknown);
    assert.equal(publishedLock.capsule.sha256, publishedCapsule.capsuleSha256);

    const bootstrapped = await bootstrapContextCapsule(projectRoot);
    assert.equal(bootstrapped.materialization.status, "materialized");
    const current = await updateContextCapsuleV3(
      frameworkRoot,
      projectRoot,
      nextRevision,
    );
    assert.equal(current.status, "current");
    assert.deepEqual(current.writtenPaths, []);

    const activationPath = path.join(
      projectRoot,
      ".agent-context/LICENSE.agent-context-framework",
    );
    await writeFile(activationPath, "local activation edit\n", "utf8");
    const blocked = await planContextCapsuleV3Update(
      frameworkRoot,
      projectRoot,
      "f".repeat(40),
    );
    assert.equal(blocked.status, "blocked");
    assert.match(
      blocked.conflicts.map((conflict) => conflict.detail).join("\n"),
      /Project-owned source changed|locally modified|differs/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
