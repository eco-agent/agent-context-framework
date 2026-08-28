import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildContextCapsuleForProject,
  contextCapsuleEntryBytes,
  type BuiltContextCapsule,
} from "../src/context-capsule.js";
import {
  CONTEXT_MATERIALIZATION_PATH,
  decodeContextMaterializationReceipt,
  materializeContextCapsuleSkills,
  planContextCapsuleSkillMaterialization,
} from "../src/context-capsule-materialization.js";
import { addComponent, removeComponent } from "../src/context-installer.js";
import {
  inspectContextTransaction,
  resumeContextTransaction,
} from "../src/context-transaction.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");
const frameworkRevision = "c".repeat(40);

test("materialization writes verified skill bytes and reuses the exact receipt", async () => {
  const fixture = await createCapsuleFixture("current");
  try {
    const first = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(first.status, "materialized");
    assert.equal(first.receipt.files.length, 2);
    assert.equal(
      first.receipt.files.every((file) =>
        /^\.agents\/skills\/diagnose@[a-f0-9]{64}\//u.test(file.targetPath)),
      true,
    );
    for (const file of first.receipt.files) {
      assert.equal(
        (await readFile(path.join(fixture.projectRoot, file.targetPath))).equals(
          contextCapsuleEntryBytes(fixture.capsule, file.sourcePath),
        ),
        true,
      );
    }
    const receiptBefore = await readFile(
      path.join(fixture.projectRoot, CONTEXT_MATERIALIZATION_PATH),
    );
    assert.deepEqual(
      decodeContextMaterializationReceipt(JSON.parse(receiptBefore.toString("utf8")) as unknown),
      first.receipt,
    );

    const second = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(second.status, "current");
    assert.deepEqual(second.writtenPaths, []);
    assert.equal(
      (await readFile(path.join(fixture.projectRoot, CONTEXT_MATERIALIZATION_PATH))).equals(
        receiptBefore,
      ),
      true,
    );
  } finally {
    await fixture.remove();
  }
});

test("materialization blocks modified and unexpected generated output", async () => {
  const fixture = await createCapsuleFixture("modified");
  try {
    await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    const targetPath = installedSkillPath(
      fixture.capsule,
      (await planContextCapsuleSkillMaterialization(fixture.capsule, fixture.projectRoot)).receipt.files,
      "SKILL.md",
    );
    await writeFile(path.join(fixture.projectRoot, targetPath), "local generated edit\n", "utf8");
    const modified = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(modified.status, "blocked");
    assert.deepEqual(modified.writtenPaths, []);
    assert.deepEqual(modified.conflicts.map((conflict) => conflict.targetPath), [targetPath]);
    assert.match(modified.conflicts[0]?.detail ?? "", /was modified/u);

    await writeFile(
      path.join(fixture.projectRoot, targetPath),
      contextCapsuleEntryBytes(fixture.capsule, ".codex/skills/diagnose/SKILL.md"),
    );
    const scriptPath = modified.receipt.files.find((file) =>
      file.targetPath.endsWith("/scripts/hitl-loop.template.sh"))?.targetPath;
    assert.notEqual(scriptPath, undefined);
    await writeFile(path.join(fixture.projectRoot, path.dirname(scriptPath!), "extra.txt"), "extra\n");
    const extra = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(extra.status, "blocked");
    assert.match(extra.conflicts.map((conflict) => conflict.detail).join("\n"), /unexpected path/u);
  } finally {
    await fixture.remove();
  }

  const unexplained = await createCapsuleFixture("unexplained");
  try {
    const initial = await planContextCapsuleSkillMaterialization(
      unexplained.capsule,
      unexplained.projectRoot,
    );
    assert.equal(initial.status, "ready");
    const skillRootRelative = initial.receipt.files[0]?.targetPath.split("/").slice(0, 3).join("/");
    assert.notEqual(skillRootRelative, undefined);
    const skillRoot = path.join(unexplained.projectRoot, skillRootRelative!);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "other.txt"), "unreceipted\n", "utf8");
    const plan = await planContextCapsuleSkillMaterialization(
      unexplained.capsule,
      unexplained.projectRoot,
    );
    assert.equal(plan.status, "blocked");
    assert.equal(plan.conflicts[0]?.targetPath, skillRootRelative);
    assert.match(plan.conflicts[0]?.detail ?? "", /without an ACF receipt/u);
  } finally {
    await unexplained.remove();
  }
});

test("materialization publishes a new content-addressed skill before removing the old one", async () => {
  const fixture = await createCapsuleFixture("different");
  try {
    const installed = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(installed.status, "materialized");
    const oldSkillPath = installedSkillPath(
      fixture.capsule,
      installed.receipt.files,
      "SKILL.md",
    );
    const removed = await removeComponent(fixture.projectRoot, frameworkRoot, "skill-diagnose");
    assert.equal(removed.plan.status, "ready");
    const added = await addComponent(
      fixture.projectRoot,
      frameworkRoot,
      "skill-codebase-inventory",
    );
    assert.equal(added.plan.status, "ready");
    const nextCapsule = await buildContextCapsuleForProject(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
    );
    await assert.rejects(
      materializeContextCapsuleSkills(nextCapsule, fixture.projectRoot, {
        afterMutation: (boundary) => {
          if (boundary.kind === "target-written" &&
            boundary.targetPath === CONTEXT_MATERIALIZATION_PATH) {
            throw new Error("Injected failure after replacement receipt.");
          }
        },
      }),
      /Injected failure after replacement receipt/u,
    );
    assert.equal(
      await readFile(path.join(fixture.projectRoot, oldSkillPath), "utf8"),
      contextCapsuleEntryBytes(fixture.capsule, ".codex/skills/diagnose/SKILL.md").toString("utf8"),
    );
    assert.equal((await inspectContextTransaction(fixture.projectRoot)).status, "resumable");
    await resumeContextTransaction(fixture.projectRoot);
    const current = await planContextCapsuleSkillMaterialization(
      nextCapsule,
      fixture.projectRoot,
    );
    assert.equal(current.status, "current");
    await assert.rejects(readFile(path.join(fixture.projectRoot, oldSkillPath)), /ENOENT/u);
    assert.equal(
      current.receipt.files.some((file) => file.targetPath.includes("codebase-inventory@")),
      true,
    );
  } finally {
    await fixture.remove();
  }
});

async function createCapsuleFixture(label: string): Promise<{
  readonly projectRoot: string;
  readonly capsule: BuiltContextCapsule;
  readonly remove: () => Promise<void>;
}> {
  const parent = await mkdtemp(path.join(os.tmpdir(), `acf-materialization-${label}-`));
  const projectRoot = path.join(parent, "application");
  await generateTestApplicationFixture({
    frameworkRoot,
    outputRoot: projectRoot,
    gitState: "clean",
    acfState: "core",
    replace: false,
  });
  const added = await addComponent(projectRoot, frameworkRoot, "skill-diagnose");
  assert.equal(added.plan.status, "ready");
  const capsule = await buildContextCapsuleForProject(
    frameworkRoot,
    projectRoot,
    frameworkRevision,
  );
  return {
    projectRoot,
    capsule,
    remove: async () => await rm(parent, { recursive: true, force: true }),
  };
}

function installedSkillPath(
  capsule: BuiltContextCapsule,
  files: readonly { readonly sourcePath: string; readonly targetPath: string }[],
  basename: string,
): string {
  const file = files.find((candidate) =>
    candidate.sourcePath === `.codex/skills/diagnose/${basename}`);
  assert.notEqual(file, undefined, `Missing materialized ${basename} for ${capsule.capsuleSha256}.`);
  return file!.targetPath;
}
