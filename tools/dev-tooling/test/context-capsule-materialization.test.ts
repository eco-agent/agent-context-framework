import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH, artifactIdentity } from "@agent-context/repo-policy";

import {
  buildContextCapsule,
  readContextCapsuleFile,
  replaceContextCapsuleActivation,
} from "../src/context-capsule.js";
import { planContextCapsuleMaterialization } from "../src/context-capsule-materialization.js";
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

test("pack preserves the installed hash of a project-owned seed", async () => {
  const fixture = await emptyFixture();
  try {
    const policyPath = path.join(fixture.projectRoot, ".codex", "acf", "policy.json");
    await mkdir(path.dirname(policyPath), { recursive: true });
    await writeFile(policyPath, '{"project":"owned"}\n', "utf8");
    const first = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["repository-policy"],
    );
    if (first.status === "blocked") assert.fail("Initial pack must succeed.");

    const capsulePath = path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH);
    const firstCapsule = await readContextCapsuleFile(capsulePath);
    const seedArtifact = firstCapsule.payload.selection.resolvedComponents
      .flatMap((component) => component.artifacts)
      .find((artifact) => artifact.operation === "seed-file");
    assert.notEqual(seedArtifact, undefined);
    const seedIdentity = artifactIdentity(seedArtifact!);
    const installedHash = createHash("sha256")
      .update(await readFile(policyPath))
      .digest("hex");
    const rebound = replaceContextCapsuleActivation(
      firstCapsule,
      firstCapsule.payload.activation.map((activation) =>
        activation.identity === seedIdentity
          ? { ...activation, installedSha256: "0".repeat(64) }
          : activation),
    );
    await writeFile(capsulePath, rebound.bytes);
    const reboundSync = await syncContextCapsule(fixture.projectRoot);
    assert.notEqual(reboundSync.status, "blocked");

    const repacked = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["repository-policy"],
    );
    assert.notEqual(repacked.status, "blocked");
    const finalCapsule = await readContextCapsuleFile(capsulePath);
    assert.equal(
      finalCapsule.payload.activation.some((activation) =>
        activation.installedSha256 === installedHash),
      true,
    );
  } finally {
    await fixture.remove();
  }
});

test("pack preflights new projections before publishing tracked state", async () => {
  const fixture = await emptyFixture();
  try {
    const first = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      [],
    );
    if (first.status === "blocked") assert.fail("Initial pack must succeed.");
    const capsulePath = path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH);
    const before = await readFile(capsulePath);
    const candidate = await buildContextCapsule({
      frameworkRoot,
      frameworkRevision,
      directComponents: ["core", "skill-diagnose"],
    });
    const projection = await planContextCapsuleMaterialization(candidate, fixture.projectRoot);
    assert.equal(projection.status, "ready");
    const newSkill = projection.receipt.files.find((file) =>
      file.targetPath.startsWith(".agents/skills/") &&
      !first.sync.receipt.files.some((current) => current.targetPath === file.targetPath));
    assert.notEqual(newSkill, undefined);
    await mkdir(path.dirname(path.join(fixture.projectRoot, newSkill!.targetPath)), { recursive: true });
    await writeFile(path.join(fixture.projectRoot, newSkill!.targetPath), "unowned\n", "utf8");

    const blocked = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["skill-diagnose"],
    );
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.writtenPaths, []);
    assert.equal((await readFile(capsulePath)).equals(before), true);
  } finally {
    await fixture.remove();
  }
});

test("pack rejects locally changed tracked activation without replacing the capsule", async () => {
  const fixture = await emptyFixture();
  try {
    const first = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      [],
    );
    if (first.status === "blocked") assert.fail("Initial pack must succeed.");
    const capsulePath = path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH);
    const before = await readFile(capsulePath);
    const agentsPath = path.join(fixture.projectRoot, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, agents.replace("# Project agent context", "# Locally changed context"), "utf8");

    const blocked = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      [],
    );
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.conflicts.some((conflict) => conflict.targetPath === "AGENTS.md"), true);
    assert.deepEqual(blocked.writtenPaths, []);
    assert.equal((await readFile(capsulePath)).equals(before), true);
  } finally {
    await fixture.remove();
  }
});

test("managed ignores leave project-authored skills visible", async () => {
  const fixture = await emptyFixture();
  try {
    const attributesPath = path.join(fixture.projectRoot, ".gitattributes");
    await writeFile(attributesPath, "*.png -text\n", "utf8");
    const packed = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      [],
    );
    assert.notEqual(packed.status, "blocked");
    const gitignore = await readFile(path.join(fixture.projectRoot, ".gitignore"), "utf8");
    assert.match(gitignore, /\.agents\/skills\/acf--\*\//u);
    assert.doesNotMatch(gitignore, /^\/\.agents\/skills\/$/mu);
    const attributes = await readFile(attributesPath, "utf8");
    assert.match(attributes, /^\*\.png -text$/mu);
    assert.match(attributes, /^\.codex\/acf\/capsule\.acf binary$/mu);
    const capsule = await readContextCapsuleFile(
      path.join(fixture.projectRoot, CONTEXT_CAPSULE_PATH),
    );
    const seed = capsule.payload.selection.resolvedComponents
      .flatMap((component) => component.artifacts)
      .find((artifact) =>
        artifact.operation === "seed-file" && artifact.targetPath === ".gitattributes"
      );
    assert.ok(seed);
    const activation = capsule.payload.activation.find((item) =>
      item.identity === artifactIdentity(seed)
    );
    assert.equal(
      activation?.installedSha256,
      createHash("sha256").update(attributes).digest("hex"),
    );
  } finally {
    await fixture.remove();
  }
});

test("sync retires obsolete content-addressed runtime roots", async () => {
  const fixture = await emptyFixture();
  try {
    const first = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["codex-runtime"],
    );
    if (first.status === "blocked") assert.fail("Initial pack must succeed.");
    const oldRuntimeRoot = path.join(
      fixture.projectRoot,
      ".codex",
      "acf",
      "runtime",
      first.sync.receipt.treeSha256,
    );
    await mkdir(path.join(oldRuntimeRoot, "node_modules", "generated-cache"), { recursive: true });
    await writeFile(
      path.join(oldRuntimeRoot, "node_modules", "generated-cache", "state.json"),
      "{}\n",
      "utf8",
    );

    const second = await packContextCapsule(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
      ["codex-runtime", "skill-diagnose"],
    );
    assert.notEqual(second.status, "blocked");
    await assert.rejects(lstat(oldRuntimeRoot), { code: "ENOENT" });

    const interruptedRoot = path.join(
      fixture.projectRoot,
      ".codex",
      "acf",
      "runtime",
      "0".repeat(64),
    );
    await mkdir(interruptedRoot, { recursive: true });
    const retried = await syncContextCapsule(fixture.projectRoot);
    assert.equal(retried.status, "synced");
    assert.equal(retried.materialization?.writtenPaths.includes(
      `.codex/acf/runtime/${"0".repeat(64)}`,
    ), true);
    await assert.rejects(lstat(interruptedRoot), { code: "ENOENT" });
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
