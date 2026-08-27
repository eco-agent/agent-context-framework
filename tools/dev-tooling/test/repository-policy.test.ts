import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";

import {
  addComponent,
  diffProject,
  doctorProject,
  initProject,
  removeComponent,
} from "../src/context-installer.js";
import { buildContextRegistry } from "../src/context-registry-builder.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("Wave 3 resolves only runtime base and repository policy", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.equal(registry.revision, "0.13.0");
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

    await initProject(projectRoot, frameworkRoot);
    assert.match(await readFile(path.join(projectRoot, ".gitattributes"), "utf8"), /\.agent-context\/\*\* text eol=lf/u);
    const installed = await addComponent(projectRoot, frameworkRoot, "repository-policy");
    assert.equal(installed.plan.status, "ready");
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);
    assert.deepEqual(
      (await readdir(path.join(projectRoot, ".agent-context", "runtime", "packages"))).sort(),
      ["policy", "shared"],
    );

    const materializedDoctor = await doctorProject(projectRoot, frameworkRoot);
    assert.equal(materializedDoctor.health, "attention");
    assert.equal(materializedDoctor.runtime?.status, "dependencies-missing");
    assert.equal(materializedDoctor.repositoryPolicy, null);

    const bootstrapped = await bootstrapRuntime({
      projectRoot,
      mode: "install-and-build",
    });
    assert.equal(bootstrapped.status, "operational");
    assert.equal(await exists(path.join(projectRoot, "package.json")), false);
    assert.equal(await exists(path.join(projectRoot, "pnpm-lock.yaml")), false);

    const wrapper = path.join(projectRoot, ".agent-context", "policy.mjs");
    const inspection = await runJson(process.execPath, [wrapper, "inspect"], projectRoot);
    assert.equal(inspection.code, 0);
    assert.equal(record(inspection.value).operation, "inspect");
    assert.deepEqual(record(record(inspection.value).observations).languageMarkers, ["pyproject.toml"]);

    const unconfigured = await runJson(process.execPath, [wrapper, "doctor"], projectRoot);
    assert.equal(unconfigured.code, 1);
    assert.equal(record(unconfigured.value).status, "configuration-required");

    await writeJson(path.join(projectRoot, ".agent-context", "policy.json"), {
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

    const finalDoctor = await doctorProject(projectRoot, frameworkRoot);
    assert.equal(finalDoctor.health, "healthy");
    assert.equal(finalDoctor.runtime?.status, "operational");
    assert.equal(finalDoctor.repositoryPolicy?.status, "ready");
    assert.equal(finalDoctor.diff?.current, true);
    assert.equal(
      finalDoctor.diff?.plan.status === "ready" &&
        finalDoctor.diff.plan.assessments.some((assessment) =>
          assessment.targetPath === ".agent-context/policy.json" &&
          assessment.status === "unchanged"),
      true,
    );

    const removed = await removeComponent(projectRoot, frameworkRoot, "repository-policy");
    assert.equal(removed.plan.status, "ready");
    assert.equal(await exists(path.join(projectRoot, ".agent-context", "policy.json")), true);
    assert.equal(await exists(path.join(projectRoot, ".agent-context", "policy-invariants.json")), false);
    assert.equal(await exists(path.join(projectRoot, ".agent-context", "policy.mjs")), false);
    assert.equal(
      await exists(path.join(projectRoot, ".agent-context", "runtime", "packages", "policy", "src", "index.ts")),
      false,
    );
    assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
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
    await initProject(projectRoot, frameworkRoot);
    const installed = await addComponent(projectRoot, frameworkRoot, "integration-oxfmt");
    assert.equal(installed.plan.status, "ready");
    assert.deepEqual(
      JSON.parse(await readFile(path.join(projectRoot, ".oxfmtrc.json"), "utf8")),
      { ignorePatterns: ["dist/**", ".agent-context/**"] },
    );
    await removeComponent(projectRoot, frameworkRoot, "integration-oxfmt");
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
