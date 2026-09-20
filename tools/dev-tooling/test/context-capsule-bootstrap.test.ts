import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { bootstrapContextCapsule } from "../src/context-capsule-bootstrap.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const execFileAsync = promisify(execFile);

test("bootstrap recreates ignored runtime and skills from a tracked capsule", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acf-bootstrap-"));
  const source = path.join(parent, "source");
  const clone = path.join(parent, "clone");
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: source,
      gitState: "clean",
      acfState: "runtime",
      replace: false,
    });
    await cp(source, clone, {
      recursive: true,
      filter: (candidate) => {
        const relative = path.relative(source, candidate).split(path.sep).join("/");
        return relative === "" ||
          (!relative.startsWith(".agents/skills") &&
            !relative.startsWith(".codex/acf/runtime") &&
            relative !== ".codex/acf/receipt.json");
      },
    });
    const trackedBootstrap = path.join(clone, ".codex/acf/bootstrap.mjs");
    const execution = await execFileAsync(
      process.execPath,
      [trackedBootstrap, "sync", "--cwd", clone, "--json"],
      { cwd: clone, windowsHide: true },
    );
    const summary = JSON.parse(execution.stdout) as {
      readonly verification: { readonly ok: boolean };
      readonly materialization: { readonly status: string };
    };
    assert.equal(summary.verification.ok, true);
    assert.equal(summary.materialization.status, "materialized");

    const result = await bootstrapContextCapsule(clone);
    assert.equal(result.verification.ok, true);
    assert.equal(result.materialization.status, "current");
    assert.equal(result.materialization.receipt.files.length > 0, true);
    for (const file of result.materialization.receipt.files) {
      assert.equal((await readFile(path.join(clone, file.targetPath))).length > 0, true);
    }
    const repeated = await bootstrapContextCapsule(clone);
    assert.equal(repeated.materialization.status, "current");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
