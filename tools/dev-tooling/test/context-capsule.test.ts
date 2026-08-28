import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from "node:zlib";

import { decodeContextCapsuleLock } from "@agent-context/repo-policy";

import {
  buildContextCapsule,
  buildContextCapsuleForProject,
  CONTEXT_CAPSULE_MAGIC,
  contextCapsuleEntryBytes,
  diffContextCapsules,
  extractContextCapsule,
  inspectContextCapsule,
  readContextCapsule,
  readContextCapsuleFile,
  writeContextCapsuleFile,
  type BuiltContextCapsule,
} from "../src/context-capsule.js";
import { verifyContextCapsuleInstallation } from "../src/context-capsule-installation.js";
import {
  createContextCapsuleLock,
  verifyContextCapsuleLock,
} from "../src/context-capsule-lock.js";
import { parseContextCapsuleArguments } from "../src/context-capsule-cli.js";
import {
  CONTEXT_CONFIG_PATH,
  CONTEXT_LOCK_PATH,
  initProject,
} from "../src/context-installer.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const executeFile = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");
const frameworkRevision = "a".repeat(40);

test("capsule builds deterministic canonical bytes for the selected closure", async () => {
  const first = await buildCoreCapsule();
  const second = await buildCoreCapsule();
  assert.equal(first.bytes.equals(second.bytes), true);
  assert.equal(first.capsuleSha256, second.capsuleSha256);
  assert.equal(first.treeSha256, second.treeSha256);
  assert.equal(first.entryCount, 5);
  assert.equal(first.bytes.subarray(0, CONTEXT_CAPSULE_MAGIC.length).equals(CONTEXT_CAPSULE_MAGIC), true);

  const decoded = readContextCapsule(first.bytes);
  assert.equal(decoded.capsuleSha256, first.capsuleSha256);
  assert.deepEqual(decoded.payload, first.payload);
  assert.deepEqual(
    inspectContextCapsule(decoded).resolvedComponents.map((component) => component.name),
    ["core"],
  );
  assert.equal(
    contextCapsuleEntryBytes(decoded, "LICENSE").toString("utf8"),
    await readFile(path.join(frameworkRoot, "LICENSE"), "utf8"),
  );
});

test("capsule reader rejects corrupt, noncanonical, unsafe, incomplete, and drifted payloads", async () => {
  const capsule = await buildCoreCapsule();
  assert.throws(
    () => readContextCapsule(Buffer.concat([Buffer.from("NOTACAP\n"), capsule.bytes.subarray(8)])),
    /ACFCAP1 header/u,
  );
  assert.throws(
    () => readContextCapsule(capsule.bytes.subarray(0, capsule.bytes.length - 4)),
    /Brotli payload is invalid/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, () => undefined, false)),
    /canonical JSON/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      capsuleEntry(payload, 0).contentBase64 = "!";
    })),
    /invalid Base64/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      capsuleEntry(payload, 0).contentBase64 = Buffer.from("drift").toString("base64");
      capsuleEntry(payload, 0).byteLength = 5;
    })),
    /hash mismatch/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      capsuleEntry(payload, 0).sourcePath = "../outside";
    })),
    /normalized relative path/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      const entries = requiredMutableArray(payload.entries, "entries");
      entries.pop();
    })),
    /missing source/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      payload.treeSha256 = "0".repeat(64);
    })),
    /tree hash mismatch/u,
  );
  assert.throws(
    () => readContextCapsule(mutateCapsule(capsule, (payload) => {
      const selection = requiredMutableRecord(payload.selection, "selection");
      const components = requiredMutableArray(
        selection.resolvedComponents,
        "resolvedComponents",
      );
      const component = requiredMutableRecord(components[0], "component");
      const capabilities = requiredMutableArray(component.capabilities, "capabilities");
      requiredMutableRecord(capabilities[0], "capability").name = "tampered-git";
    })),
    /tree hash mismatch/u,
  );
});

test("capsule semantic diff reports component and source additions", async () => {
  const before = await buildCoreCapsule();
  const after = await buildContextCapsule({
    frameworkRoot,
    frameworkRevision,
    directComponents: ["core", "skill-codebase-inventory"],
  });
  assert.equal(diffContextCapsules(before, before).equal, true);
  const difference = diffContextCapsules(before, after);
  assert.equal(difference.equal, false);
  assert.equal(difference.directSelectionChanged, true);
  assert.deepEqual(difference.addedComponents, ["skill-codebase-inventory"]);
  assert.equal(difference.removedComponents.length, 0);
  assert.equal(difference.addedEntries.length > 0, true);
  assert.equal(difference.removedEntries.length, 0);
});

test("concise lock v3 records and verifies capsule identity without replacing lock v2", async () => {
  const capsule = await buildCoreCapsule();
  const activation = [
    {
      identity: "text-section:AGENTS.md:core",
      targetPath: "AGENTS.md",
      installedSha256: "b".repeat(64),
    },
    {
      identity: "seed-file:.gitattributes",
      targetPath: ".gitattributes",
      installedSha256: "a".repeat(64),
    },
  ] as const;
  const lock = createContextCapsuleLock(capsule, activation);
  assert.equal(lock.schemaVersion, 3);
  assert.equal(lock.capsule.sha256, capsule.capsuleSha256);
  assert.equal(
    lock.capsule.expandedBytes,
    capsule.payload.entries.reduce((total, entry) => total + entry.byteLength, 0),
  );
  assert.deepEqual(
    lock.activation.map((record) => record.identity),
    ["seed-file:.gitattributes", "text-section:AGENTS.md:core"],
  );
  assert.deepEqual(verifyContextCapsuleLock(lock, capsule, activation), {
    ok: true,
    mismatches: [],
  });

  const drifted = decodeContextCapsuleLock({
    ...lock,
    capsule: { ...lock.capsule, sha256: "0".repeat(64) },
  });
  const verification = verifyContextCapsuleLock(drifted, capsule, activation);
  assert.equal(verification.ok, false);
  assert.match(verification.mismatches.join("\n"), /file digest differs/u);

  const activationMismatch = verifyContextCapsuleLock(lock, capsule, [{
    ...activation[0],
    targetPath: "WRONG.md",
  }, activation[1]]);
  assert.equal(activationMismatch.ok, false);
  assert.match(activationMismatch.mismatches.join("\n"), /Activation records differ/u);
});

test("capsule writes and extracts atomically without replacing existing paths", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-files-"));
  try {
    const capsule = await buildCoreCapsule();
    const capsulePath = path.join(temporaryRoot, "core.acf");
    await writeContextCapsuleFile(capsulePath, capsule);
    assert.equal((await readContextCapsuleFile(capsulePath)).capsuleSha256, capsule.capsuleSha256);
    await assert.rejects(
      writeContextCapsuleFile(capsulePath, capsule),
      /already exists/u,
    );

    const extractedRoot = path.join(temporaryRoot, "extracted");
    const extracted = await extractContextCapsule(capsule, extractedRoot);
    assert.equal(extracted.length, capsule.entryCount);
    assert.equal(
      await readFile(path.join(extractedRoot, "LICENSE"), "utf8"),
      await readFile(path.join(frameworkRoot, "LICENSE"), "utf8"),
    );
    await assert.rejects(
      extractContextCapsule(capsule, extractedRoot),
      /already exists/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("generated clean core application proves capsule installation equivalence without mutation", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-fixture-"));
  const projectRoot = path.join(temporaryRoot, "application");
  const replayRoot = path.join(temporaryRoot, "replay");
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "clean",
      acfState: "core",
      replace: false,
    });
    const revisionBefore = await git(projectRoot, ["rev-parse", "HEAD"]);
    const statusBefore = await git(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
    const capsule = await buildContextCapsuleForProject(
      frameworkRoot,
      projectRoot,
      frameworkRevision,
    );
    const verification = await verifyContextCapsuleInstallation(capsule, projectRoot);
    assert.equal(verification.ok, true);
    assert.equal(verification.artifactCount, 5);
    assert.deepEqual(verification.mismatches, []);
    assert.equal(await git(projectRoot, ["rev-parse", "HEAD"]), revisionBefore);
    assert.equal(
      await git(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
      statusBefore,
    );

    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: replayRoot,
      gitState: "clean",
      acfState: "none",
      replace: false,
    });
    const sourceOverrides = new Map(
      capsule.payload.entries.map((entry) => [
        entry.sourcePath,
        new TextDecoder("utf-8", { fatal: true }).decode(
          contextCapsuleEntryBytes(capsule, entry.sourcePath),
        ),
      ]),
    );
    const replay = await initProject(replayRoot, frameworkRoot, sourceOverrides);
    assert.equal(replay.plan.status, "ready");
    const expectedPaths = new Set([
      CONTEXT_CONFIG_PATH,
      CONTEXT_LOCK_PATH,
      ...capsule.payload.selection.resolvedComponents.flatMap((component) =>
        component.artifacts.map((artifact) => artifact.targetPath)),
    ]);
    for (const relativePath of expectedPaths) {
      assert.equal(
        (await readFile(path.join(replayRoot, relativePath))).equals(
          await readFile(path.join(projectRoot, relativePath)),
        ),
        true,
        `Capsule replay differs at ${relativePath}.`,
      );
    }

    const agentsPath = path.join(projectRoot, "AGENTS.md");
    const agentsBefore = await readFile(agentsPath, "utf8");
    const agentsAfter = agentsBefore.replace(
      "Keep long-running task evidence",
      "Discard long-running task evidence",
    );
    assert.notEqual(agentsAfter, agentsBefore);
    await writeFile(agentsPath, agentsAfter, "utf8");
    const drifted = await verifyContextCapsuleInstallation(capsule, projectRoot);
    assert.equal(drifted.ok, false);
    assert.equal(drifted.mismatches.some((mismatch) => mismatch.identity.includes("AGENTS.md")), true);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("generated dirty core application verifies without disturbing unrelated work", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-capsule-dirty-"));
  const projectRoot = path.join(temporaryRoot, "application");
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "dirty",
      acfState: "core",
      replace: false,
    });
    const revisionBefore = await git(projectRoot, ["rev-parse", "HEAD"]);
    const statusBefore = await git(projectRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    const capsule = await buildContextCapsuleForProject(
      frameworkRoot,
      projectRoot,
      frameworkRevision,
    );
    assert.equal((await verifyContextCapsuleInstallation(capsule, projectRoot)).ok, true);
    assert.equal(await git(projectRoot, ["rev-parse", "HEAD"]), revisionBefore);
    assert.equal(
      await git(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
      statusBefore,
    );
    assert.match(statusBefore, /src\/site-copy\.mjs/u);
    assert.match(statusBefore, /notes\/local-request\.md/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("capsule CLI parses side-by-side build, verification, diff, and extraction", () => {
  const projectRoot = path.join(os.tmpdir(), "capsule-project");
  assert.deepEqual(
    parseContextCapsuleArguments(["build", "--cwd", projectRoot, "--json"], frameworkRoot),
    {
      command: "build",
      projectRoot,
      capsulePath: path.join(projectRoot, ".agent-context", "capsule.acf"),
      json: true,
    },
  );
  assert.deepEqual(
    parseContextCapsuleArguments(["verify", "--cwd", projectRoot], frameworkRoot),
    {
      command: "verify",
      projectRoot,
      capsulePath: path.join(projectRoot, ".agent-context", "capsule.acf"),
      json: false,
    },
  );
  assert.throws(
    () => parseContextCapsuleArguments(["diff", "--before", "one.acf"], frameworkRoot),
    /requires --before and --after/u,
  );
  assert.throws(
    () => parseContextCapsuleArguments(["extract", "--capsule", "one.acf"], frameworkRoot),
    /requires --capsule and --output/u,
  );
});

async function buildCoreCapsule(): Promise<BuiltContextCapsule> {
  return await buildContextCapsule({
    frameworkRoot,
    frameworkRevision,
    directComponents: ["core"],
  });
}

function mutateCapsule(
  capsule: BuiltContextCapsule,
  mutate: (payload: Record<string, unknown>) => void,
  canonical = true,
): Buffer {
  const payload = JSON.parse(
    brotliDecompressSync(capsule.bytes.subarray(CONTEXT_CAPSULE_MAGIC.length)).toString("utf8"),
  ) as Record<string, unknown>;
  mutate(payload);
  const text = canonical ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  const compressed = brotliCompressSync(Buffer.from(text, "utf8"), {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
    },
  });
  return Buffer.concat([CONTEXT_CAPSULE_MAGIC, compressed]);
}

function capsuleEntry(payload: Record<string, unknown>, index: number): Record<string, unknown> {
  const entries = requiredMutableArray(payload.entries, "entries");
  const entry = entries[index];
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error("Expected capsule entry object.");
  }
  return entry as Record<string, unknown>;
}

function requiredMutableArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} array.`);
  return value;
}

function requiredMutableRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} object.`);
  }
  return value as Record<string, unknown>;
}

async function git(cwd: string, arguments_: readonly string[]): Promise<string> {
  const result = await executeFile("git", arguments_, { cwd, windowsHide: true });
  return result.stdout.trim();
}
