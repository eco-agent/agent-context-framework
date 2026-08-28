import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CONTEXT_MATERIALIZATION_PATH } from "../src/context-capsule-materialization.js";
import { generateTestApplicationFixture } from "../src/test-application-fixture.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(moduleDirectory, "../../..");
const bundleSource = path.join(
  frameworkRoot,
  "registry/sources/bootstrap/context-capsule-bootstrap-entry.mjs",
);

test("tracked capsule bootstrap bundle is reproducible", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-bootstrap-build-"));
  try {
    const outputRoot = path.join(temporaryRoot, "bundle");
    const build = await runProcess(process.execPath, [
      path.join(frameworkRoot, "node_modules/vite-plus/dist/pack-bin.js"),
      path.join(frameworkRoot, "tools/dev-tooling/src/context-capsule-bootstrap-entry.ts"),
      "--write",
      "--format",
      "esm",
      "--platform",
      "node",
      "--out-dir",
      outputRoot,
      "--logLevel",
      "error",
      "--clean",
      "--minify",
    ], frameworkRoot);
    assert.equal(build.code, 0, build.stderr);
    const normalized = await runProcess(process.execPath, [
      path.join(frameworkRoot, "tools/dev-tooling/scripts/normalize-generated-bundle.mjs"),
      path.join(outputRoot, "context-capsule-bootstrap-entry.mjs"),
    ], frameworkRoot);
    assert.equal(normalized.code, 0, normalized.stderr);
    assert.equal(
      (await readFile(path.join(outputRoot, "context-capsule-bootstrap-entry.mjs"))).equals(
        await readFile(bundleSource),
      ),
      true,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("plain Node bootstrap materializes a fresh clone and fails closed on drift", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "acf-bootstrap-fixture-"));
  const projectRoot = path.join(temporaryRoot, "application");
  try {
    await generateTestApplicationFixture({
      frameworkRoot,
      outputRoot: projectRoot,
      gitState: "clean",
      acfState: "migrated",
      replace: false,
    });
    await rm(path.join(projectRoot, ".agents"), { recursive: true, force: true });
    await rm(path.join(projectRoot, CONTEXT_MATERIALIZATION_PATH), { force: true });
    await assert.rejects(access(path.join(projectRoot, "node_modules")), /ENOENT/u);
    await assert.rejects(access(path.join(projectRoot, ".agent-context/runtime")), /ENOENT/u);

    const bootstrapPath = path.join(projectRoot, ".agent-context/bootstrap.mjs");
    const first = await runBootstrap(bootstrapPath, projectRoot);
    assert.equal(first.process.code, 0, first.process.stderr);
    assert.equal(first.result.recovery.status, "none");
    assert.equal(first.result.verification.ok, true);
    assert.equal(first.result.materialization.status, "materialized");

    const second = await runBootstrap(bootstrapPath, projectRoot);
    assert.equal(second.process.code, 0, second.process.stderr);
    assert.equal(second.result.materialization.status, "current");
    assert.deepEqual(second.result.materialization.writtenPaths, []);

    await mkdir(path.join(projectRoot, ".agent-context/transaction-stage"), { recursive: true });
    const recovered = await runBootstrap(bootstrapPath, projectRoot);
    assert.equal(recovered.process.code, 0, recovered.process.stderr);
    assert.equal(recovered.result.recovery.status, "discarded");
    assert.equal(recovered.result.materialization.status, "current");

    const lockPath = path.join(projectRoot, ".agent-context/lock.json");
    const lockText = await readFile(lockPath, "utf8");
    const driftedLock = JSON.parse(lockText) as { capsule: { sha256: string } };
    driftedLock.capsule.sha256 = "0".repeat(64);
    await writeFile(lockPath, `${JSON.stringify(driftedLock, null, 2)}\n`, "utf8");
    const lockBlocked = await runBootstrapProcess(bootstrapPath, projectRoot);
    assert.equal(lockBlocked.code, 1);
    assert.match(lockBlocked.stderr, /Capsule file digest differs from the lock/u);
    await writeFile(lockPath, lockText, "utf8");

    const activationPath = path.join(
      projectRoot,
      ".agent-context/LICENSE.agent-context-framework",
    );
    const activationBytes = await readFile(activationPath);
    await writeFile(activationPath, "local activation edit\n", "utf8");
    const activationBlocked = await runBootstrapProcess(bootstrapPath, projectRoot);
    assert.equal(activationBlocked.code, 1);
    assert.match(activationBlocked.stderr, /Installed artifact scope differs/u);
    await writeFile(activationPath, activationBytes);

    const skillPath = recovered.result.materialization.receipt.files.find((file) =>
      file.targetPath.endsWith("/SKILL.md"))?.targetPath;
    assert.notEqual(skillPath, undefined);
    await writeFile(path.join(projectRoot, skillPath!), "local generated edit\n", "utf8");
    const blocked = await runBootstrap(bootstrapPath, projectRoot);
    assert.equal(blocked.process.code, 1);
    assert.equal(blocked.result.materialization.status, "blocked");
    assert.match(
      blocked.result.materialization.conflicts.map((conflict) => conflict.detail).join("\n"),
      /was modified/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

interface BootstrapOutput {
  readonly recovery: { readonly status: string };
  readonly verification: { readonly ok: boolean };
  readonly materialization: {
    readonly status: string;
    readonly writtenPaths: readonly string[];
    readonly receipt: {
      readonly files: readonly { readonly targetPath: string }[];
    };
    readonly conflicts: readonly { readonly detail: string }[];
  };
}

async function runBootstrap(
  bootstrapPath: string,
  projectRoot: string,
): Promise<{ readonly process: ProcessResult; readonly result: BootstrapOutput }> {
  const processResult = await runBootstrapProcess(bootstrapPath, projectRoot);
  return {
    process: processResult,
    result: JSON.parse(processResult.stdout) as BootstrapOutput,
  };
}

async function runBootstrapProcess(
  bootstrapPath: string,
  projectRoot: string,
): Promise<ProcessResult> {
  return await runProcess(
    process.execPath,
    [bootstrapPath, "materialize", "--cwd", projectRoot, "--json"],
    projectRoot,
  );
}

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runProcess(
  file: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(file, arguments_, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
