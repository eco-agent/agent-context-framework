import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "../src/context-capsule.js";
import { syncContextCapsule, packContextCapsule } from "../src/context-capsule-workflow.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const frameworkRevision = "b".repeat(40);

test("pack writes one tracked capsule and sync reuses exact ignored projections", async () => {
  const fixture = await emptyFixture();
  try {
    const packed = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["skill-diagnose"],
    );
    assert.equal(packed.status, "packed");
    assert.equal(packed.sync.status, "materialized");
    assert.equal(packed.writtenPaths.includes(CONTEXT_CAPSULE_PATH), true);
    assert.equal(packed.writtenPaths.includes(".agent-context/config.json"), false);
    assert.equal(packed.writtenPaths.includes(".agent-context/lock.json"), false);

    const capsule = await readContextCapsuleFile(path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH));
    assert.equal(capsule.payload.activation.length > 0, true);
    assert.equal(capsule.payload.selection.directComponents.includes("skill-diagnose"), true);
    assert.equal(packed.sync.receipt.files.some((file) => file.targetPath.startsWith(".agents/skills/")), true);

    const synced = await syncContextCapsule(fixture.projectRoot);
    assert.equal(synced.status, "current");
    assert.deepEqual(synced.materialization?.writtenPaths, []);
  } finally {
    await fixture.remove();
  }
});

test("sync blocks modified generated files without touching their bytes", async () => {
  const fixture = await emptyFixture();
  try {
    const packed = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["skill-diagnose"],
    );
    if (packed.status === "blocked") assert.fail("Initial pack must succeed.");
    const generatedPath = packed.sync.receipt.files.find((file) =>
      file.targetPath.startsWith(".agents/skills/") && file.targetPath.endsWith("/SKILL.md"))?.targetPath;
    assert.notEqual(generatedPath, undefined);
    const absolutePath = path.join(fixture.projectRoot, generatedPath!);
    await writeFile(absolutePath, "local generated edit\n", "utf8");

    const synced = await syncContextCapsule(fixture.projectRoot);
    assert.equal(synced.status, "blocked");
    assert.equal(synced.conflicts.some((conflict) => conflict.targetPath === generatedPath), true);
    assert.equal(await readFile(absolutePath, "utf8"), "local generated edit\n");
  } finally {
    await fixture.remove();
  }
});

test("sync rejects a corrupt capsule before changing generated files", async () => {
  const fixture = await emptyFixture();
  try {
    const packed = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["skill-diagnose"],
    );
    if (packed.status === "blocked") assert.fail("Initial pack must succeed.");
    const generated = packed.sync.receipt.files[0];
    assert.notEqual(generated, undefined);
    const before = await readFile(path.join(fixture.projectRoot, generated!.targetPath));
    await writeFile(path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH), Buffer.from("broken capsule"));
    await assert.rejects(syncContextCapsule(fixture.projectRoot), /ACFCAP2/u);
    assert.equal(
      (await readFile(path.join(fixture.projectRoot, generated!.targetPath))).equals(before),
      true,
    );
  } finally {
    await fixture.remove();
  }
});

async function emptyFixture(): Promise<{ projectRoot: string; remove: () => Promise<void> }> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-materialization-"));
  const projectRoot = path.join(parent, "project");
  await generateTestApplicationFixture({
    frameworkRoot,
    outputRoot: projectRoot,
    gitState: "clean",
    acfState: "none",
    replace: false,
  });
  return { projectRoot, remove: async () => await rm(parent, { recursive: true, force: true }) };
}
