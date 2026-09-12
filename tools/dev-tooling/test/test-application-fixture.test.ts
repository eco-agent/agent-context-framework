import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "../src/context-capsule.js";
import {
  generateTestApplicationFixture,
  TEST_APPLICATION_MARKER_PATH,
} from "../src/test-application-fixture.js";
import { parseTestApplicationFixtureArguments } from "../src/test-application-fixture-cli.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("fixture CLI exposes current capsule states", () => {
  const output = path.resolve("D:/fixtures/app");
  assert.deepEqual(
    parseTestApplicationFixtureArguments([
      "--output",
      output,
      "--state",
      "dirty",
      "--acf",
      "acceptance",
      "--replace",
      "--json",
    ]),
    { outputRoot: output, gitState: "dirty", acfState: "acceptance", replace: true, json: true },
  );
  assert.throws(
    () => parseTestApplicationFixtureArguments(["--output", output, "--acf", "migrated"]),
    /none, core, runtime, or acceptance/u,
  );
});

test("none fixture is deterministic and clean", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-fixture-none-"));
  try {
    const outputRoot = path.join(parent, "app");
    const first = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "clean",
      acfState: "none",
      replace: false,
    });
    const repeated = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "clean",
      acfState: "none",
      replace: true,
    });
    assert.equal(first.baselineRevision, repeated.baselineRevision);
    assert.equal(first.installationRevision, null);
    assert.deepEqual(first.status, []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

for (const acfState of ["core", "runtime", "acceptance"] as const) {
  test(`${acfState} fixture tracks one capsule and ignores every projection`, async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), `acf-fixture-${acfState}-`));
    try {
      const outputRoot = path.join(parent, "app");
      const result = await generateTestApplicationFixture({
        frameworkRoot,
        outputRoot,
        gitState: "clean",
        acfState,
        replace: false,
      });
      assert.notEqual(result.installationRevision, null);
      assert.notEqual(result.capsuleSha256, null);
      assert.deepEqual(result.status, []);
      const capsule = await readContextCapsuleFile(path.join(outputRoot, CONTEXT_CAPSULE_PATH));
      assert.equal(capsule.capsuleSha256, result.capsuleSha256);
      assert.equal(capsule.payload.selection.directComponents.includes("core"), acfState === "core");
      assert.equal(await missing(path.join(outputRoot, ".agent-context")), true);
      assert.equal(await missing(path.join(outputRoot, ".codex", "acf", "config.json")), true);
      assert.equal(await missing(path.join(outputRoot, ".codex", "acf", "lock.json")), true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
}

test("dirty fixture adds only declared project work after packing ACF", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-fixture-dirty-"));
  try {
    const outputRoot = path.join(parent, "app");
    const result = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "dirty",
      acfState: "runtime",
      replace: false,
    });
    assert.deepEqual(result.status, [" M src/site-copy.mjs", "?? notes/local-request.md"]);
    assert.match(await readFile(path.join(outputRoot, "notes", "local-request.md"), "utf8"), /preserve/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("replace requires the fixture marker", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-fixture-replace-"));
  try {
    const outputRoot = path.join(parent, "app");
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "clean",
      acfState: "none",
      replace: false,
    });
    await writeFile(path.join(outputRoot, TEST_APPLICATION_MARKER_PATH), "{}\n", "utf8");
    await assert.rejects(
      generateTestApplicationFixture({
        frameworkRoot,
        outputRoot,
        gitState: "clean",
        acfState: "none",
        replace: true,
      }),
      /valid ACF fixture marker/u,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

async function missing(candidate: string): Promise<boolean> {
  try {
    await readFile(candidate);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}
