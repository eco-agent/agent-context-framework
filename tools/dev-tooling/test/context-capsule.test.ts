import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildContextCapsule,
  contextCapsuleEntryBytes,
  diffContextCapsules,
  extractContextCapsule,
  inspectContextCapsule,
  readContextCapsule,
  readContextCapsuleFile,
  writeContextCapsuleFile,
} from "../src/context-capsule.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const frameworkRevision = "a".repeat(40);

test("capsule is deterministic and carries its only activation lock", async () => {
  const first = await capsule(["codex-runtime", "repository-policy"]);
  const second = await capsule(["codex-runtime", "repository-policy"]);
  assert.equal(first.bytes.equals(second.bytes), true);
  assert.equal(first.capsuleSha256, second.capsuleSha256);
  assert.equal(first.payload.format, "acf-capsule-v2");
  assert.equal(first.payload.schemaVersion, 2);
  assert.equal(first.payload.activation.length > 0, true);
  assert.equal(
    first.payload.activation.every((record) =>
      record.identity.length > 0 &&
      record.targetPath.length > 0 &&
      /^[a-f0-9]{64}$/u.test(record.installedSha256)),
    true,
  );
  assert.deepEqual(readContextCapsule(first.bytes).payload, first.payload);
  assert.deepEqual(inspectContextCapsule(first).directComponents, [
    "codex-runtime",
    "repository-policy",
  ]);
});

test("capsule rejects invalid headers and damaged payloads", async () => {
  const built = await capsule(["core"]);
  assert.throws(() => readContextCapsule(Buffer.from("not a capsule")), /ACFCAP2/u);
  const damaged = Buffer.from(built.bytes);
  damaged[damaged.length - 1] = (damaged[damaged.length - 1] ?? 0) ^ 0xff;
  assert.throws(() => readContextCapsule(damaged), /Brotli payload is invalid/u);
});

test("semantic diff reports valid unequal capsules without treating difference as corruption", async () => {
  const before = await capsule(["core"]);
  const after = await capsule(["core", "skill-diagnose"]);
  const difference = diffContextCapsules(before, after);
  assert.equal(difference.equal, false);
  assert.equal(difference.directSelectionChanged, true);
  assert.deepEqual(difference.addedComponents, ["skill-diagnose"]);
  assert.equal(difference.addedEntries.some((entry) => entry.endsWith("/SKILL.md")), true);
});

test("capsule writes and extracts exact source bytes without replacing existing paths", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-"));
  try {
    const built = await capsule(["core"]);
    const capsulePath = path.join(temporaryRoot, "capsule.acf");
    await writeContextCapsuleFile(capsulePath, built);
    await assert.rejects(writeContextCapsuleFile(capsulePath, built), /already exists/u);
    assert.equal((await readContextCapsuleFile(capsulePath)).capsuleSha256, built.capsuleSha256);

    const extractedRoot = path.join(temporaryRoot, "extracted");
    const extracted = await extractContextCapsule(built, extractedRoot);
    assert.equal(extracted.length, built.entryCount);
    const sourcePath = built.payload.entries[0]?.sourcePath;
    assert.notEqual(sourcePath, undefined);
    assert.equal(
      (await readFile(path.join(extractedRoot, sourcePath!))).equals(
        contextCapsuleEntryBytes(built, sourcePath!),
      ),
      true,
    );
    await assert.rejects(extractContextCapsule(built, extractedRoot), /already exists/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function capsule(directComponents: readonly string[]) {
  return await buildContextCapsule({ frameworkRoot, frameworkRevision, directComponents });
}
