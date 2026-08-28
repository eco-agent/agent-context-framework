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
import { addComponent } from "../src/context-installer.js";
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
    assert.deepEqual(
      first.receipt.files.map((file) => file.targetPath),
      [
        ".agents/skills/diagnose/SKILL.md",
        ".agents/skills/diagnose/scripts/hitl-loop.template.sh",
      ],
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
    const targetPath = ".agents/skills/diagnose/SKILL.md";
    await writeFile(path.join(fixture.projectRoot, targetPath), "local generated edit\n", "utf8");
    const modified = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(modified.status, "blocked");
    assert.deepEqual(modified.writtenPaths, []);
    assert.deepEqual(modified.conflicts.map((conflict) => conflict.targetPath), [targetPath]);
    assert.match(modified.conflicts[0]?.detail ?? "", /was modified/u);
  } finally {
    await fixture.remove();
  }

  const unexplained = await createCapsuleFixture("unexplained");
  try {
    const skillRoot = path.join(unexplained.projectRoot, ".agents", "skills", "diagnose");
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "other.txt"), "project-owned\n", "utf8");
    const plan = await planContextCapsuleSkillMaterialization(
      unexplained.capsule,
      unexplained.projectRoot,
    );
    assert.equal(plan.status, "blocked");
    assert.equal(plan.conflicts[0]?.targetPath, ".agents/skills/diagnose");
    assert.match(plan.conflicts[0]?.detail ?? "", /without an ACF receipt/u);
  } finally {
    await unexplained.remove();
  }
});

test("materialization retains a valid prior capsule instead of replacing it", async () => {
  const fixture = await createCapsuleFixture("different");
  try {
    const installed = await materializeContextCapsuleSkills(fixture.capsule, fixture.projectRoot);
    assert.equal(installed.status, "materialized");
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
    const blocked = await materializeContextCapsuleSkills(nextCapsule, fixture.projectRoot);
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.conflicts[0]?.targetPath, CONTEXT_MATERIALIZATION_PATH);
    assert.match(blocked.conflicts[0]?.detail ?? "", /different capsule/u);
    assert.equal(
      await readFile(
        path.join(fixture.projectRoot, ".agents", "skills", "diagnose", "SKILL.md"),
        "utf8",
      ),
      contextCapsuleEntryBytes(fixture.capsule, ".codex/skills/diagnose/SKILL.md").toString("utf8"),
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
