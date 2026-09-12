import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { buildContextCapsule } from "../src/context-capsule.js";
import { syncContextCapsule } from "../src/context-capsule-workflow.js";
import {
  decodeContextRepositoryRecord,
  forgetContextRepository,
  inspectContextRepository,
  listContextRepositories,
  registerContextRepository,
  resolveCodexHome,
  resolveContextRepositoryCatalogRoot,
  syncContextRepositories,
} from "../src/context-repository-catalog.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("Codex home and repository catalog paths are explicit and relocatable", () => {
  const userHome = path.resolve("D:/users/example");
  assert.equal(resolveCodexHome({}, userHome), path.join(userHome, ".codex"));
  assert.equal(
    resolveCodexHome({ CODEX_HOME: path.resolve("D:/codex-home") }, userHome),
    path.resolve("D:/codex-home"),
  );
  assert.equal(
    resolveContextRepositoryCatalogRoot(path.resolve("D:/codex-home")),
    path.resolve("D:/codex-home/acf/repositories"),
  );
  assert.throws(() => resolveCodexHome({ CODEX_HOME: "relative" }, userHome), /absolute/u);
});

test("repository records are strict and bind identity to a canonical root", () => {
  const root = path.resolve("D:/projects/example");
  const id = repositoryId(root);
  assert.deepEqual(decodeContextRepositoryRecord({ schemaVersion: 1, id, root }), {
    schemaVersion: 1,
    id,
    root,
  });
  assert.throws(
    () => decodeContextRepositoryRecord({ schemaVersion: 1, id, root, status: "current" }),
    /contain only/u,
  );
  assert.throws(
    () => decodeContextRepositoryRecord({ schemaVersion: 1, id: "0".repeat(64), root }),
    /does not match/u,
  );
});

test("repository records separate concurrent writers and forget only catalog state", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-catalog-"));
  try {
    const catalogRoot = path.join(parent, "codex-home", "acf", "repositories");
    const firstRoot = await createCapsuleRepository(parent, "first");
    const secondRoot = await createCapsuleRepository(parent, "second");
    const [first, second] = await Promise.all([
      registerContextRepository(firstRoot, catalogRoot),
      registerContextRepository(secondRoot, catalogRoot),
    ]);
    assert.equal(first.status, "registered");
    assert.equal(second.status, "registered");
    assert.equal((await registerContextRepository(firstRoot, catalogRoot)).status, "current");

    const records = await listContextRepositories(catalogRoot);
    assert.deepEqual(
      records.map((record) => record.id),
      [...records.map((record) => record.id)].sort(),
    );
    assert.deepEqual(new Set(records.map((record) => record.root)), new Set([firstRoot, secondRoot]));

    const forgotten = await forgetContextRepository(first.record.id, catalogRoot);
    assert.equal(forgotten.status, "forgotten");
    assert.equal((await forgetContextRepository(first.record.id, catalogRoot)).status, "absent");
    assert.equal(await readFile(path.join(firstRoot, CONTEXT_CAPSULE_PATH)).then(() => true), true);
    assert.deepEqual((await listContextRepositories(catalogRoot)).map((record) => record.root), [secondRoot]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository observation distinguishes current, sync, tracked drift, invalid, and missing states", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-observation-"));
  try {
    const projectRoot = path.join(parent, "app");
    const catalogRoot = path.join(parent, "codex-home", "acf", "repositories");
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "clean",
      acfState: "core",
      replace: false,
    });
    const registration = await registerContextRepository(projectRoot, catalogRoot);
    const capsulePath = path.join(projectRoot, CONTEXT_CAPSULE_PATH);
    const receiptPath = path.join(projectRoot, ".codex", "acf", "receipt.json");
    const capsuleBytes = await readFile(capsulePath);
    const receiptBytes = await readFile(receiptPath);

    assert.equal((await inspectContextRepository(registration.record)).status, "current");
    const outdated = await inspectContextRepository(registration.record, "999.0.0");
    assert.equal(outdated.status, "repack-required");
    assert.match(outdated.issues[0] ?? "", /differs from manager registry/u);
    assert.equal((await readFile(capsulePath)).equals(capsuleBytes), true);
    assert.equal((await readFile(receiptPath)).equals(receiptBytes), true);

    await rm(path.join(projectRoot, ".agents", "skills"), { recursive: true, force: true });
    await rm(path.join(projectRoot, ".codex", "acf", "runtime"), { recursive: true, force: true });
    await rm(receiptPath);
    assert.equal((await inspectContextRepository(registration.record)).status, "sync-required");
    assert.equal((await syncContextCapsule(projectRoot)).status, "synced");

    const agentsPath = path.join(projectRoot, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    const driftedAgents = agents.replace(
      "Preserve unrelated changes.",
      "Discard unrelated changes.",
    );
    assert.notEqual(driftedAgents, agents);
    await writeFile(agentsPath, driftedAgents, "utf8");
    assert.equal((await inspectContextRepository(registration.record)).status, "repack-required");
    await writeFile(agentsPath, agents, "utf8");

    await writeFile(capsulePath, "not a capsule", "utf8");
    assert.equal((await inspectContextRepository(registration.record)).status, "invalid");
    await rm(projectRoot, { recursive: true, force: true });
    assert.equal((await inspectContextRepository(registration.record)).status, "missing");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("registration requires an ACF repository and cannot register the catalog itself", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-boundary-"));
  try {
    const catalogRoot = path.join(parent, "codex-home", "acf", "repositories");
    const ordinaryDirectory = path.join(parent, "ordinary");
    await mkdir(ordinaryDirectory, { recursive: true });
    await assert.rejects(registerContextRepository(ordinaryDirectory, catalogRoot), /capsule\.acf|ENOENT/u);
    await mkdir(catalogRoot, { recursive: true });
    await assert.rejects(registerContextRepository(path.dirname(catalogRoot), catalogRoot), /must not contain/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("all-repository sync reports one failure and continues with the remaining repositories", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-repository-sync-all-"));
  try {
    const catalogRoot = path.join(parent, "codex-home", "acf", "repositories");
    const firstRoot = path.join(parent, "first-app");
    const secondRoot = path.join(parent, "second-app");
    for (const outputRoot of [firstRoot, secondRoot]) {
      await generateTestApplicationFixture({
        frameworkRoot,
        outputRoot,
        gitState: "clean",
        acfState: "core",
        replace: false,
      });
      await registerContextRepository(outputRoot, catalogRoot);
    }
    await writeFile(path.join(firstRoot, CONTEXT_CAPSULE_PATH), "not a capsule", "utf8");

    const results = await syncContextRepositories(catalogRoot);
    assert.equal(results.length, 2);
    assert.equal(results.find((result) => result.root === firstRoot)?.status, "failed");
    assert.equal(results.find((result) => result.root === secondRoot)?.status, "current");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

async function createCapsuleRepository(parent: string, name: string): Promise<string> {
  const root = path.join(parent, name);
  const capsule = await buildContextCapsule({
    frameworkRoot,
    frameworkRevision: "a".repeat(40),
    directComponents: ["core"],
  });
  await mkdir(path.join(root, ".codex", "acf"), { recursive: true });
  await writeFile(path.join(root, CONTEXT_CAPSULE_PATH), capsule.bytes);
  return await realpath(root);
}

function repositoryId(root: string): string {
  const normalized = process.platform === "win32" ? root.toLowerCase() : root;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
