import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildContextCapsule,
  type BuiltContextCapsule,
} from "../src/context-capsule.js";
import { classifyContextCapsuleRestart } from "../src/context-capsule-restart.js";
import { runContextCapsuleCli } from "../src/context-capsule-cli.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const frameworkRevision = "d".repeat(40);

test("restart classification follows changed activation, skill, and runtime artifacts", async () => {
  const core = await capsule(["core"]);
  const skill = await capsule(["core", "skill-diagnose"]);
  const runtime = await capsule(["codex-runtime"]);

  assert.deepEqual(classifyContextCapsuleRestart(core, core), {
    required: false,
    reasons: [],
  });
  assert.deepEqual(
    classifyContextCapsuleRestart(core, skill).reasons.map((reason) => reason.kind),
    ["skills"],
  );
  const runtimeClassification = classifyContextCapsuleRestart(core, runtime);
  assert.equal(runtimeClassification.required, true);
  assert.deepEqual(
    runtimeClassification.reasons.map((reason) => reason.kind),
    ["activation", "runtime"],
  );
  assert.equal(
    runtimeClassification.reasons.some((reason) =>
      reason.targetPaths.includes(".codex/hooks.json")),
    true,
  );
});

test("inspectable source changes do not invent a restart requirement", async () => {
  const core = await capsule(["core"]);
  const changedEntry = core.payload.entries.find((entry) => entry.sourcePath === "LICENSE");
  assert.notEqual(changedEntry, undefined);
  const changed: BuiltContextCapsule = {
    ...core,
    payload: {
      ...core.payload,
      entries: core.payload.entries.map((entry) =>
        entry.sourcePath === changedEntry!.sourcePath
          ? { ...entry, sourceSha256: "0".repeat(64) }
          : entry),
    },
  };
  assert.deepEqual(classifyContextCapsuleRestart(core, changed), {
    required: false,
    reasons: [],
  });
});

test("semantic capsule diff reports restart classification", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-restart-diff-"));
  try {
    const before = await capsule(["core"]);
    const after = await capsule(["core", "skill-diagnose"]);
    const beforePath = path.join(temporaryRoot, "before.acf");
    const afterPath = path.join(temporaryRoot, "after.acf");
    await writeFile(beforePath, before.bytes);
    await writeFile(afterPath, after.bytes);
    const result = await runContextCapsuleCli(
      ["diff", "--before", beforePath, "--after", afterPath, "--json"],
      temporaryRoot,
      frameworkRoot,
    );
    assert.equal(result.exitCode, 1);
    const output = JSON.parse(result.output) as {
      restart: { required: boolean; reasons: readonly { kind: string }[] };
    };
    assert.equal(output.restart.required, true);
    assert.deepEqual(output.restart.reasons.map((reason) => reason.kind), ["skills"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function capsule(directComponents: readonly string[]): Promise<BuiltContextCapsule> {
  return await buildContextCapsule({
    frameworkRoot,
    frameworkRevision,
    directComponents,
  });
}
