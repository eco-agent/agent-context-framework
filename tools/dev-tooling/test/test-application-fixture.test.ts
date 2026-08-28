import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "../src/context-capsule.js";
import { verifyContextCapsuleInstallation } from "../src/context-capsule-installation.js";
import {
  generateTestApplicationFixture,
  TEST_APPLICATION_MARKER_PATH,
} from "../src/test-application-fixture.js";
import { parseTestApplicationFixtureArguments } from "../src/test-application-fixture-cli.js";

const executeFile = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");

test("fixture CLI requires an absolute output and parses independent state controls", () => {
  assert.throws(
    () => parseTestApplicationFixtureArguments(["--output", "relative"]),
    /absolute path/u,
  );
  const outputRoot = path.join(path.parse(frameworkRoot).root, "acf-fixtures", "application");
  assert.deepEqual(
    parseTestApplicationFixtureArguments([
      "--",
      "--output",
      outputRoot,
      "--state",
      "dirty",
      "--acf",
      "capsule",
      "--replace",
      "--json",
    ]),
    {
      outputRoot,
      gitState: "dirty",
      acfState: "capsule",
      replace: true,
      json: true,
    },
  );
});

test("clean application generation is deterministic and passes its own tests", async () => {
  const fixture = await createFixtureParent();
  try {
    const firstRoot = path.join(fixture.parent, "first");
    const secondRoot = path.join(fixture.parent, "second");
    const first = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: firstRoot,
      gitState: "clean",
      acfState: "none",
      replace: false,
    });
    const second = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: secondRoot,
      gitState: "clean",
      acfState: "none",
      replace: false,
    });

    assert.deepEqual(first.status, []);
    assert.equal(first.baselineRevision, second.baselineRevision);
    assert.equal(first.installationRevision, null);
    assert.equal(first.capsuleSha256, null);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(firstRoot, TEST_APPLICATION_MARKER_PATH), "utf8")),
      {
        schemaVersion: 1,
        kind: "agent-context-test-application",
        generatorRevision: 2,
        gitState: "clean",
        acfState: "none",
      },
    );
    await executeFile(process.execPath, ["--test", "test/server.test.mjs"], {
      cwd: firstRoot,
      windowsHide: true,
    });
  } finally {
    await fixture.remove();
  }
});

test("capsule fixture commits a verified binary capsule beside expanded core", async () => {
  const fixture = await createFixtureParent();
  try {
    const outputRoot = path.join(fixture.parent, "capsule");
    const result = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "clean",
      acfState: "capsule",
      replace: false,
    });

    assert.notEqual(result.installationRevision, null);
    assert.notEqual(result.capsuleSha256, null);
    assert.deepEqual(result.status, []);
    const capsule = await readContextCapsuleFile(path.join(outputRoot, CONTEXT_CAPSULE_PATH));
    assert.equal(capsule.capsuleSha256, result.capsuleSha256);
    assert.equal((await verifyContextCapsuleInstallation(capsule, outputRoot)).ok, true);
    assert.equal(
      JSON.parse(
        await readFile(path.join(outputRoot, ".agent-context", "lock.json"), "utf8"),
      ).schemaVersion,
      2,
    );
    const attributes = await executeFile(
      "git",
      ["check-attr", "--all", "--", CONTEXT_CAPSULE_PATH],
      { cwd: outputRoot, windowsHide: true },
    );
    assert.match(attributes.stdout, /binary: set/u);
    assert.match(attributes.stdout, /text: unset/u);
    const changed = await executeFile(
      "git",
      ["diff", "--name-only", result.baselineRevision, result.installationRevision!],
      { cwd: outputRoot, windowsHide: true },
    );
    assert.match(changed.stdout, /\.agent-context\/capsule\.acf/u);
  } finally {
    await fixture.remove();
  }
});

test("dirty core fixture commits ACF before applying exact project-owned changes", async () => {
  const fixture = await createFixtureParent();
  try {
    const outputRoot = path.join(fixture.parent, "dirty-core");
    const result = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "dirty",
      acfState: "core",
      replace: false,
    });

    assert.notEqual(result.installationRevision, null);
    assert.deepEqual(result.status, [" M src/site-copy.mjs", "?? notes/local-request.md"]);
    assert.match(
      await readFile(path.join(outputRoot, "AGENTS.md"), "utf8"),
      /<!-- agent-context:core:start -->/u,
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(outputRoot, ".agent-context", "config.json"), "utf8")),
      { schemaVersion: 2, adapter: "codex", components: ["core"] },
    );
    assert.match(
      await readFile(path.join(outputRoot, "src", "site-copy.mjs"), "utf8"),
      /Dirty fixture local edit\./u,
    );
  } finally {
    await fixture.remove();
  }
});

test("replace regenerates only a directory with the fixture marker", async () => {
  const fixture = await createFixtureParent();
  try {
    const outputRoot = path.join(fixture.parent, "replaceable");
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "dirty",
      acfState: "none",
      replace: false,
    });
    await writeFile(path.join(outputRoot, "remove-me.txt"), "old fixture\n", "utf8");
    const regenerated = await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot,
      gitState: "clean",
      acfState: "none",
      replace: true,
    });
    assert.deepEqual(regenerated.status, []);
    await assert.rejects(readFile(path.join(outputRoot, "remove-me.txt"), "utf8"), /ENOENT/u);

    const unmarkedRoot = path.join(fixture.parent, "unmarked");
    await mkdir(unmarkedRoot);
    await writeFile(path.join(unmarkedRoot, "user.txt"), "do not delete\n", "utf8");
    await assert.rejects(
      generateTestApplicationFixture({
        frameworkRoot,
        outputRoot: unmarkedRoot,
        gitState: "clean",
        acfState: "none",
        replace: true,
      }),
      /valid ACF fixture marker/u,
    );
    assert.equal(await readFile(path.join(unmarkedRoot, "user.txt"), "utf8"), "do not delete\n");
  } finally {
    await fixture.remove();
  }
});

test("generator refuses output inside or above the framework worktree", async () => {
  await assert.rejects(
    generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: path.join(frameworkRoot, ".codex", "artifacts", "unsafe-fixture"),
      gitState: "clean",
      acfState: "none",
      replace: false,
    }),
    /outside the framework worktree/u,
  );
  await assert.rejects(
    generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: path.dirname(frameworkRoot),
      gitState: "clean",
      acfState: "none",
      replace: false,
    }),
    /outside the framework worktree/u,
  );
});

async function createFixtureParent(): Promise<{
  readonly parent: string;
  readonly remove: () => Promise<void>;
}> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-test-application-"));
  return {
    parent,
    remove: async () => await rm(parent, { recursive: true, force: true }),
  };
}
