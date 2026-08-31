import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  contextCapsuleMaterializationActivation,
  contextCapsuleSkillActivation,
  decodeContextMaterializationReceipt,
  materializeContextCapsule,
  planContextCapsuleMaterialization,
  verifyContextMaterializationAuthority,
} from "../src/context-capsule-materialization.js";
import { createContextCapsuleLock } from "../src/context-capsule-lock.js";
import { addComponent, removeComponent } from "../src/context-installer.js";
import { resumeContextTransaction } from "../src/context-transaction.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");
const frameworkRevision = "c".repeat(40);

test("materialization writes verified skill bytes and reuses the exact receipt", async () => {
  const fixture = await createCapsuleFixture("current");
  try {
    const first = await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
    assert.equal(first.status, "materialized");
    assert.equal(first.receipt.files.length, 2);
    assert.equal(
      first.receipt.files.every((file) =>
        /^\.agents\/skills\/acf--diagnose--[a-f0-9]{64}\//u.test(file.targetPath)),
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
    const forgedReceipt = JSON.parse(receiptBefore.toString("utf8")) as {
      files: Array<{ skillRoot: string }>;
    };
    forgedReceipt.files[0]!.skillRoot =
      `.agents/skills/acf--diagnose--${"0".repeat(64)}`;
    assert.throws(
      () => decodeContextMaterializationReceipt(forgedReceipt),
      /skillRoot does not match its skill and component revision/u,
    );
    const activation = contextCapsuleSkillActivation(fixture.capsule);
    const lock = createContextCapsuleLock(fixture.capsule, [], activation);
    assert.deepEqual(
      verifyContextMaterializationAuthority(lock, fixture.capsule, first.receipt),
      { ok: true, mismatches: [] },
    );
    const redirectedLock = createContextCapsuleLock(
      fixture.capsule,
      [],
      activation.map((record, index) =>
        index === 0 ? { ...record, targetPath: ".agents/skills/other/SKILL.md" } : record),
    );
    const redirected = verifyContextMaterializationAuthority(
      redirectedLock,
      fixture.capsule,
      first.receipt,
    );
    assert.equal(redirected.ok, false);
    assert.match(redirected.mismatches.join("\n"), /Materialization records differ/u);

    const receiptDrift = decodeContextMaterializationReceipt({
      ...first.receipt,
      capsuleSha256: "0".repeat(64),
    });
    const drifted = verifyContextMaterializationAuthority(
      lock,
      fixture.capsule,
      receiptDrift,
    );
    assert.equal(drifted.ok, false);
    assert.match(drifted.mismatches.join("\n"), /receipt differs/u);

    const second = await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
    assert.equal(second.status, "current");
    assert.deepEqual(second.writtenPaths, []);
    assert.equal(
      (await readFile(path.join(fixture.projectRoot, CONTEXT_MATERIALIZATION_PATH))).equals(
        receiptBefore,
      ),
      true,
    );
    await writeFile(path.join(fixture.projectRoot, ".gitignore"), "# project rules removed\n", "utf8");
    const unignored = await planContextCapsuleMaterialization(
      fixture.capsule,
      fixture.projectRoot,
    );
    assert.equal(unignored.status, "blocked");
    assert.equal(
      unignored.conflicts.some((conflict) =>
        conflict.targetPath === CONTEXT_MATERIALIZATION_PATH && /not ignored by Git/u.test(conflict.detail)),
      true,
    );
  } finally {
    await fixture.remove();
  }
});

test("materialization blocks modified and unexpected generated output", async () => {
  const fixture = await createCapsuleFixture("modified");
  try {
    await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
    const targetPath = installedSkillPath(
      fixture.capsule,
      (await planContextCapsuleMaterialization(fixture.capsule, fixture.projectRoot)).receipt.files,
      "SKILL.md",
    );
    await writeFile(path.join(fixture.projectRoot, targetPath), "local generated edit\n", "utf8");
    const modified = await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
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
    const extra = await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
    assert.equal(extra.status, "blocked");
    assert.match(extra.conflicts.map((conflict) => conflict.detail).join("\n"), /unexpected path/u);
  } finally {
    await fixture.remove();
  }

  const unexplained = await createCapsuleFixture("unexplained");
  try {
    const initial = await planContextCapsuleMaterialization(
      unexplained.capsule,
      unexplained.projectRoot,
    );
    assert.equal(initial.status, "ready");
    const skillRootRelative = initial.receipt.files[0]?.targetPath.split("/").slice(0, 3).join("/");
    assert.notEqual(skillRootRelative, undefined);
    const skillRoot = path.join(unexplained.projectRoot, skillRootRelative!);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "other.txt"), "unreceipted\n", "utf8");
    const staleSkillRootRelative =
      `.agents/skills/acf--stale-skill--${"0".repeat(64)}`;
    const staleSkillRoot = path.join(unexplained.projectRoot, staleSkillRootRelative);
    await mkdir(staleSkillRoot, { recursive: true });
    await writeFile(path.join(staleSkillRoot, "SKILL.md"), "# Stale\n", "utf8");
    const plan = await planContextCapsuleMaterialization(
      unexplained.capsule,
      unexplained.projectRoot,
    );
    assert.equal(plan.status, "blocked");
    assert.equal(
      plan.conflicts.some((conflict) =>
        conflict.targetPath === skillRootRelative && /without an ACF receipt/u.test(conflict.detail)),
      true,
    );
    assert.equal(
      plan.conflicts.some((conflict) =>
        conflict.targetPath === staleSkillRootRelative && /contains SKILL\.md/u.test(conflict.detail)),
      true,
    );
  } finally {
    await unexplained.remove();
  }
});

test("materialization blocks a symbolic-link skills directory", async () => {
  const fixture = await createCapsuleFixture("symbolic-link");
  try {
    const outsideSkills = path.join(path.dirname(fixture.projectRoot), "outside-skills");
    const skillsDirectory = path.join(fixture.projectRoot, ".agents", "skills");
    await mkdir(outsideSkills, { recursive: true });
    await mkdir(path.dirname(skillsDirectory), { recursive: true });
    await symlink(outsideSkills, skillsDirectory, "junction");

    const plan = await planContextCapsuleMaterialization(
      fixture.capsule,
      fixture.projectRoot,
    );
    assert.equal(plan.status, "blocked");
    assert.equal(
      plan.conflicts.some((conflict) =>
        conflict.targetPath === ".agents/skills" && /symbolic-link/u.test(conflict.detail)),
      true,
    );
    await assert.rejects(
      readFile(path.join(fixture.projectRoot, CONTEXT_MATERIALIZATION_PATH)),
      /ENOENT/u,
    );
  } finally {
    await fixture.remove();
  }
});

test("materialization keeps a valid prior capsule until lock v3 can prove ownership", async () => {
  const fixture = await createCapsuleFixture("different");
  try {
    const installed = await materializeContextCapsule(fixture.capsule, fixture.projectRoot);
    assert.equal(installed.status, "materialized");
    const oldSkillPath = installedSkillPath(
      fixture.capsule,
      installed.receipt.files,
      "SKILL.md",
    );
    const added = await addComponent(
      fixture.projectRoot,
      frameworkRoot,
      "skill-codebase-inventory",
    );
    assert.equal(added.plan.status, "ready");
    const removed = await removeComponent(
      fixture.projectRoot,
      frameworkRoot,
      "skill-diagnose",
    );
    assert.equal(removed.plan.status, "ready");
    const nextCapsule = await buildContextCapsuleForProject(
      frameworkRoot,
      fixture.projectRoot,
      frameworkRevision,
    );
    const blocked = await materializeContextCapsule(nextCapsule, fixture.projectRoot);
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.conflicts[0]?.targetPath, CONTEXT_MATERIALIZATION_PATH);
    assert.match(blocked.conflicts[0]?.detail ?? "", /requires tracked ownership from lock v3/u);
    assert.equal(
      await readFile(path.join(fixture.projectRoot, oldSkillPath), "utf8"),
      contextCapsuleEntryBytes(fixture.capsule, ".codex/skills/diagnose/SKILL.md").toString("utf8"),
    );

    const authority = createContextCapsuleLock(
      nextCapsule,
      [],
      contextCapsuleMaterializationActivation(nextCapsule),
    );
    const oldGeneratedBytes = await readFile(path.join(fixture.projectRoot, oldSkillPath));
    await writeFile(
      path.join(fixture.projectRoot, oldSkillPath),
      "modified old generated output\n",
      "utf8",
    );
    const modifiedOld = await materializeContextCapsule(
      nextCapsule,
      fixture.projectRoot,
      { authority },
    );
    assert.equal(modifiedOld.status, "blocked");
    assert.match(
      modifiedOld.conflicts.map((conflict) => conflict.detail).join("\n"),
      /was modified/u,
    );
    await writeFile(path.join(fixture.projectRoot, oldSkillPath), oldGeneratedBytes);
    await assert.rejects(
      materializeContextCapsule(
        nextCapsule,
        fixture.projectRoot,
        {
          authority,
          afterMutation: (boundary) => {
            if (
              boundary.kind === "target-written" &&
              boundary.targetPath === CONTEXT_MATERIALIZATION_PATH
            ) {
              throw new Error("injected materialization replacement interruption");
            }
          },
        },
      ),
      /injected materialization replacement interruption/u,
    );
    const recovery = await resumeContextTransaction(fixture.projectRoot);
    assert.equal(recovery.status, "resumed");
    const replaced = await materializeContextCapsule(
      nextCapsule,
      fixture.projectRoot,
      { authority },
    );
    assert.equal(replaced.status, "current");
    await assert.rejects(readFile(path.join(fixture.projectRoot, oldSkillPath)), /ENOENT/u);
    assert.equal(
      replaced.receipt.files.some((file) =>
        file.sourcePath === ".codex/skills/codebase-inventory/SKILL.md"),
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
