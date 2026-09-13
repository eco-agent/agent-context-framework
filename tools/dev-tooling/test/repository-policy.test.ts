import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { resolveContextComponents } from "@agent-context/repo-policy";

import {
  packContextCapsule,
  syncContextCapsule,
} from "../src/context-capsule-workflow.js";
import { CONTEXT_MATERIALIZATION_PATH } from "../src/context-capsule-materialization.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const executeFile = promisify(execFile);
const policyBundle = path.join(
  frameworkRoot,
  "registry/sources/runtime/policy/cli.mjs",
);

test("tracked repository-policy bundle is reproducible", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-policy-bundle-"));
  try {
    await executeFile(process.execPath, [
      path.join(frameworkRoot, "node_modules/vite-plus/dist/pack-bin.js"),
      path.join(frameworkRoot, ".codex/acf/runtime-source/packages/policy/src/cli.ts"),
      "--write",
      "--format",
      "esm",
      "--platform",
      "node",
      "--out-dir",
      temporaryRoot,
      "--logLevel",
      "error",
      "--clean",
      "--minify",
    ], { cwd: frameworkRoot, windowsHide: true });
    await executeFile(process.execPath, [
      path.join(frameworkRoot, "tools/dev-tooling/scripts/normalize-generated-bundle.mjs"),
      path.join(temporaryRoot, "cli.mjs"),
    ], { cwd: frameworkRoot, windowsHide: true });
    assert.equal(
      (await readFile(path.join(temporaryRoot, "cli.mjs"))).equals(
        await readFile(policyBundle),
      ),
      true,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Wave 3 resolves only runtime base and repository policy", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.equal(registry.revision, "0.15.0");
  assert.equal(registry.components.length, 36);
  assert.deepEqual(
    resolveContextComponents(registry, ["repository-policy"]).map((component) => component.name),
    ["core", "runtime-base", "repository-policy"],
  );
  const waveThree = resolveContextComponents(registry, ["repository-policy"]);
  const runtimeArtifacts = waveThree.flatMap((component) =>
    component.artifacts.filter((artifact) => artifact.operation === "runtime-workspace"));
  assert.equal(runtimeArtifacts.length > 0, true);
  assert.equal(runtimeArtifacts.every((artifact) => artifact.workspaceId === "agent-context-runtime"), true);
  assert.equal(runtimeArtifacts.some((artifact) => artifact.sourcePath.includes("packages/hooks/")), false);
  assert.equal(runtimeArtifacts.some((artifact) => artifact.sourcePath.includes("packages/repo-context/")), false);
  assert.equal(waveThree.some((component) => component.name.startsWith("codex-")), false);
  assert.equal(waveThree.some((component) => component.artifacts.some((artifact) =>
    artifact.sourcePath.includes("objective") || artifact.sourcePath.includes("codex-workflows"))), false);
});

test("repository policy materializes and bootstraps in a non-Node project", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-wave-three-"));
  try {
    await writeFile(path.join(projectRoot, "README.md"), "# Python fixture\n", "utf8");
    await mkdir(path.join(projectRoot, "docs"));
    await writeFile(path.join(projectRoot, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");

    await pack(projectRoot, ["repository-policy"]);
    assert.match(await readFile(path.join(projectRoot, ".gitattributes"), "utf8"), /\.codex\/acf\/\*\* text eol=lf/u);
    assert.equal((await syncContextCapsule(projectRoot)).status, "current");
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);
    assert.deepEqual(
      (await readdir(path.join(await runtimeRoot(projectRoot), "packages"))).sort(),
      ["policy", "shared"],
    );

    const bootstrapped = await bootstrapRuntime({
      projectRoot,
      mode: "install-and-build",
    });
    assert.equal(bootstrapped.status, "operational");
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);

    const wrapper = path.join(projectRoot, ".codex", "acf", "policy.mjs");
    const inspection = await runJson(process.execPath, [wrapper, "inspect"], projectRoot);
    assert.equal(inspection.code, 0);
    assert.equal(record(inspection.value).operation, "inspect");
    assert.deepEqual(record(record(inspection.value).observations).languageMarkers, ["pyproject.toml"]);

    const unconfigured = await runJson(process.execPath, [wrapper, "doctor"], projectRoot);
    assert.equal(unconfigured.code, 1);
    assert.equal(record(unconfigured.value).status, "configuration-required");

    await writeJson(path.join(projectRoot, ".codex", "acf", "policy.json"), {
      schemaVersion: 1,
      state: "configured",
      repository: {
        repositoryType: "application",
        languages: ["python"],
        documentationRoots: ["docs"],
        projectContracts: [],
        packageManager: { state: "none" },
        layout: "none",
        frontend: false,
      },
      commands: [],
      profiles: [{ id: "default", commands: [] }],
      defaultProfile: "default",
    });

    const policyDoctor = await runJson(process.execPath, [wrapper, "doctor"], projectRoot);
    assert.equal(policyDoctor.code, 0);
    assert.equal(record(policyDoctor.value).status, "ready");
    const verification = await runJson(process.execPath, [wrapper, "verify"], projectRoot);
    assert.equal(verification.code, 0);
    assert.equal(record(verification.value).status, "completed");
    assert.deepEqual(record(verification.value).commands, []);

    await pack(projectRoot, ["core"]);
    assert.equal(await exists(path.join(projectRoot, ".codex", "acf", "policy.json")), true);
    assert.equal(await exists(path.join(projectRoot, ".codex", "acf", "policy-invariants.json")), false);
    assert.equal(await exists(path.join(projectRoot, ".codex", "acf", "policy.mjs")), false);
    const coreReceipt = JSON.parse(
      await readFile(path.join(projectRoot, CONTEXT_MATERIALIZATION_PATH), "utf8"),
    ) as { files: readonly unknown[] };
    assert.deepEqual(coreReceipt.files, []);
    assert.equal((await syncContextCapsule(projectRoot)).status, "current");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("Oxfmt integration owns only the framework runtime ignore", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-oxfmt-"));
  try {
    await writeFile(
      path.join(projectRoot, ".oxfmtrc.json"),
      `${JSON.stringify({ ignorePatterns: ["dist/**"] }, null, 2)}\n`,
      "utf8",
    );
    await pack(projectRoot, ["integration-oxfmt"]);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(projectRoot, ".oxfmtrc.json"), "utf8")),
      { ignorePatterns: ["dist/**", ".codex/acf/**"] },
    );
    await pack(projectRoot, ["core"]);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(projectRoot, ".oxfmtrc.json"), "utf8")),
      { ignorePatterns: ["dist/**"] },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function runJson(
  executable: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<{ readonly code: number; readonly value: unknown }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const source = Buffer.concat(stdout).toString("utf8");
      try {
        resolve({ code: code ?? 1, value: JSON.parse(source) as unknown });
      } catch (error) {
        reject(new Error(`Expected JSON output: ${Buffer.concat(stderr).toString("utf8")}`, { cause: error }));
      }
    });
  });
}

async function pack(projectRoot: string, components: readonly string[]): Promise<void> {
  await executeFile("git", ["init", "--quiet"], { cwd: projectRoot, windowsHide: true });
  const result = await packContextCapsule(
    frameworkRoot,
    projectRoot,
    "0".repeat(40),
    components,
  );
  assert.notEqual(result.status, "blocked");
}

async function runtimeRoot(projectRoot: string): Promise<string> {
  const receipt = JSON.parse(
    await readFile(path.join(projectRoot, CONTEXT_MATERIALIZATION_PATH), "utf8"),
  ) as { treeSha256: string };
  return path.join(projectRoot, ".codex", "acf", "runtime", receipt.treeSha256);
}

async function writeJson(candidate: string, value: unknown): Promise<void> {
  await writeFile(candidate, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
