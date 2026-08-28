import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import {
  buildContextCapsuleForProject,
  readContextCapsuleFile,
  writeContextCapsuleFile,
} from "./context-capsule.js";
import { verifyContextCapsuleInstallation } from "./context-capsule-installation.js";
import { migrateContextCapsuleV2 } from "./context-capsule-migration.js";
import {
  CONTEXT_MATERIALIZATION_PATH,
  materializeContextCapsule,
} from "./context-capsule-materialization.js";
import { addComponent, initProject } from "./context-installer.js";

export const TEST_APPLICATION_MARKER_PATH = ".acf-fixture.json";

export type TestApplicationGitState = "clean" | "dirty";
export type TestApplicationAcfState =
  | "none"
  | "core"
  | "capsule"
  | "materialized"
  | "migrated"
  | "runtime-migrated";

export interface TestApplicationFixtureRequest {
  readonly frameworkRoot: string;
  readonly outputRoot: string;
  readonly gitState: TestApplicationGitState;
  readonly acfState: TestApplicationAcfState;
  readonly replace: boolean;
}

export interface TestApplicationFixtureResult {
  readonly schemaVersion: 3;
  readonly outputRoot: string;
  readonly gitState: TestApplicationGitState;
  readonly acfState: TestApplicationAcfState;
  readonly baselineRevision: string;
  readonly installationRevision: string | null;
  readonly capsuleSha256: string | null;
  readonly materializedFileCount: number;
  readonly status: readonly string[];
}

interface TestApplicationMarker {
  readonly schemaVersion: 1;
  readonly kind: "agent-context-test-application";
  readonly generatorRevision: 5;
  readonly gitState: TestApplicationGitState;
  readonly acfState: TestApplicationAcfState;
}

const fixtureIdentity = {
  name: "Agent Context Framework fixture",
  email: "fixture@agent-context.invalid",
} as const;

export async function generateTestApplicationFixture(
  request: TestApplicationFixtureRequest,
): Promise<TestApplicationFixtureResult> {
  const frameworkRoot = await realpath(request.frameworkRoot);
  const outputRoot = validateOutputRoot(frameworkRoot, request.outputRoot);
  await prepareOutputRoot(outputRoot, request.replace);

  const templateRoot = path.join(
    frameworkRoot,
    "tools",
    "dev-tooling",
    "fixtures",
    "acf-test-application",
  );
  await copyDirectory(templateRoot, outputRoot);
  await activateTemplateControlFiles(outputRoot);
  const marker: TestApplicationMarker = {
    schemaVersion: 1,
    kind: "agent-context-test-application",
    generatorRevision: 5,
    gitState: request.gitState,
    acfState: request.acfState,
  };
  await writeFile(
    path.join(outputRoot, TEST_APPLICATION_MARKER_PATH),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );

  await runGit(outputRoot, ["init", "--quiet", "--initial-branch=main"]);
  const baselineRevision = await commitAll(
    outputRoot,
    "Create ACF test application baseline",
    "2000-01-01T00:00:00Z",
  );

  let installationRevision: string | null = null;
  let capsuleSha256: string | null = null;
  let materializedFileCount = 0;
  if (
    request.acfState === "core" ||
    request.acfState === "capsule" ||
    request.acfState === "materialized" ||
    request.acfState === "migrated" ||
    request.acfState === "runtime-migrated"
  ) {
    const installed = await initProject(outputRoot, frameworkRoot);
    if (installed.plan.status !== "ready") {
      throw new Error(`ACF core installation was blocked with status ${installed.plan.status}.`);
    }
    if (
      request.acfState === "materialized" ||
      request.acfState === "migrated" ||
      request.acfState === "runtime-migrated"
    ) {
      const added = await addComponent(outputRoot, frameworkRoot, "skill-diagnose");
      if (added.plan.status !== "ready") {
        throw new Error(`ACF diagnose installation was blocked with status ${added.plan.status}.`);
      }
    }
    if (request.acfState === "runtime-migrated") {
      const added = await addComponent(outputRoot, frameworkRoot, "codex-runtime");
      if (added.plan.status !== "ready") {
        throw new Error(`ACF runtime installation was blocked with status ${added.plan.status}.`);
      }
    }
    if (
      request.acfState === "capsule" ||
      request.acfState === "materialized" ||
      request.acfState === "migrated" ||
      request.acfState === "runtime-migrated"
    ) {
      const frameworkRevision = (await runGit(frameworkRoot, ["rev-parse", "HEAD"])).trim();
      if (!/^[a-f0-9]{40}$/u.test(frameworkRevision)) {
        throw new Error("Fixture generator could not resolve the full framework revision.");
      }
      const capsule = await buildContextCapsuleForProject(
        frameworkRoot,
        outputRoot,
        frameworkRevision,
      );
      await writeContextCapsuleFile(
        path.join(outputRoot, CONTEXT_CAPSULE_PATH),
        capsule,
      );
      const verification = await verifyContextCapsuleInstallation(
        await readContextCapsuleFile(path.join(outputRoot, CONTEXT_CAPSULE_PATH)),
        outputRoot,
      );
      if (!verification.ok) {
        throw new Error(
          `Generated capsule does not match the expanded installation: ${verification.mismatches.map((mismatch) => mismatch.detail).join(" ")}`,
        );
      }
      const attributes = await runGit(outputRoot, [
        "check-attr",
        "--all",
        "--",
        CONTEXT_CAPSULE_PATH,
      ]);
      if (!attributes.includes("binary: set") || !attributes.includes("text: unset")) {
        throw new Error("Generated capsule must be marked binary by project Git attributes.");
      }
      capsuleSha256 = capsule.capsuleSha256;
      if (
        request.acfState === "materialized" ||
        request.acfState === "migrated" ||
        request.acfState === "runtime-migrated"
      ) {
        const materialized = await materializeContextCapsule(capsule, outputRoot);
        if (materialized.status !== "materialized") {
          throw new Error(`Generated capsule materialization returned ${materialized.status}.`);
        }
        materializedFileCount = materialized.receipt.files.length;
        for (const generatedPath of [
          ...materialized.receipt.files.map((file) => file.targetPath),
          CONTEXT_MATERIALIZATION_PATH,
        ]) {
          await runGit(outputRoot, ["check-ignore", "--quiet", "--", generatedPath]);
        }
        if (request.acfState === "migrated" || request.acfState === "runtime-migrated") {
          const migration = await migrateContextCapsuleV2(capsule, outputRoot);
          if (migration.status !== "migrated") {
            throw new Error(`Generated capsule migration returned ${migration.status}.`);
          }
        }
      }
    }
    installationRevision = await commitAll(
      outputRoot,
      request.acfState === "runtime-migrated"
        ? "Migrate ACF runtime capsule fixture"
        : request.acfState === "migrated"
        ? "Migrate ACF capsule fixture"
        : request.acfState === "materialized"
          ? "Install ACF capsule materialization fixture"
          : request.acfState === "capsule"
            ? "Install ACF core and capsule"
            : "Install ACF core",
      "2000-01-02T00:00:00Z",
    );
  }

  if (request.gitState === "dirty") {
    await applyDirtyState(outputRoot);
  }

  const status = await readGitStatus(outputRoot);
  const expectedStatus =
    request.gitState === "clean" ? [] : [" M src/site-copy.mjs", "?? notes/local-request.md"];
  if (JSON.stringify(status) !== JSON.stringify(expectedStatus)) {
    throw new Error(
      `Generated ${request.gitState} fixture has unexpected Git status: ${JSON.stringify(status)}.`,
    );
  }

  return {
    schemaVersion: 3,
    outputRoot,
    gitState: request.gitState,
    acfState: request.acfState,
    baselineRevision,
    installationRevision,
    capsuleSha256,
    materializedFileCount,
    status,
  };
}

function validateOutputRoot(frameworkRoot: string, candidate: string): string {
  if (!path.isAbsolute(candidate)) {
    throw new Error("Test application output must be an absolute path.");
  }
  const outputRoot = path.resolve(candidate);
  if (path.dirname(outputRoot) === outputRoot) {
    throw new Error("Test application output cannot be a filesystem root.");
  }
  if (samePath(outputRoot, os.homedir())) {
    throw new Error("Test application output cannot be the user home directory.");
  }
  if (containsPath(frameworkRoot, outputRoot) || containsPath(outputRoot, frameworkRoot)) {
    throw new Error("Test application output must be outside the framework worktree.");
  }
  return outputRoot;
}

async function prepareOutputRoot(outputRoot: string, replace: boolean): Promise<void> {
  let outputStat;
  try {
    outputStat = await lstat(outputRoot);
  } catch (error) {
    if (isMissingPathError(error)) {
      await mkdir(path.dirname(outputRoot), { recursive: true });
      return;
    }
    throw error;
  }
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new Error("Test application output must be a real directory, not a file or link.");
  }
  const entries = await readdir(outputRoot);
  if (entries.length === 0) {
    await rm(outputRoot, { recursive: true });
    return;
  }
  if (!replace) {
    throw new Error("Test application output is not empty. Pass --replace for a marked fixture.");
  }
  const resolvedOutput = await realpath(outputRoot);
  if (!samePath(resolvedOutput, outputRoot)) {
    throw new Error("Test application output resolves to a different path.");
  }
  await requireFixtureMarker(outputRoot);
  await rm(outputRoot, { recursive: true });
}

async function requireFixtureMarker(outputRoot: string): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(path.join(outputRoot, TEST_APPLICATION_MARKER_PATH), "utf8"),
    ) as unknown;
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) {
      throw new Error("Refusing to replace a directory without a valid ACF fixture marker.");
    }
    throw error;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("kind" in value) ||
    value.kind !== "agent-context-test-application" ||
    !("generatorRevision" in value) ||
    (value.generatorRevision !== 1 &&
      value.generatorRevision !== 2 &&
      value.generatorRevision !== 3 &&
      value.generatorRevision !== 4 &&
      value.generatorRevision !== 5) ||
    !("gitState" in value) ||
    (value.gitState !== "clean" && value.gitState !== "dirty") ||
    !("acfState" in value) ||
    (value.acfState !== "none" &&
      value.acfState !== "core" &&
      value.acfState !== "capsule" &&
      value.acfState !== "materialized" &&
      value.acfState !== "migrated" &&
      value.acfState !== "runtime-migrated")
  ) {
    throw new Error("Refusing to replace a directory without a valid ACF fixture marker.");
  }
}

async function copyDirectory(sourceRoot: string, outputRoot: string): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const outputPath = path.join(outputRoot, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, outputPath);
    } else if (entry.isFile()) {
      await writeFile(outputPath, await readFile(sourcePath));
    } else {
      throw new Error(`Fixture template entry must be a regular file or directory: ${sourcePath}.`);
    }
  }
}

async function activateTemplateControlFiles(outputRoot: string): Promise<void> {
  const paths = [
    ["AGENTS.template.md", "AGENTS.md"],
    ["package.template.json", "package.json"],
    ["pnpm-lock.template.yaml", "pnpm-lock.yaml"],
    [
      path.join(".agent-context", "policy.template.json"),
      path.join(".agent-context", "policy.json"),
    ],
  ] as const;
  for (const [sourcePath, targetPath] of paths) {
    await rename(path.join(outputRoot, sourcePath), path.join(outputRoot, targetPath));
  }
}

async function applyDirtyState(outputRoot: string): Promise<void> {
  const copyPath = path.join(outputRoot, "src", "site-copy.mjs");
  const current = await readFile(copyPath, "utf8");
  const dirty = current.replace("Clean fixture baseline.", "Dirty fixture local edit.");
  if (dirty === current) {
    throw new Error("Fixture template no longer contains the expected clean application copy.");
  }
  await writeFile(copyPath, dirty, "utf8");
  await mkdir(path.join(outputRoot, "notes"), { recursive: true });
  await writeFile(
    path.join(outputRoot, "notes", "local-request.md"),
    "# Local request\n\nThis untracked file represents work that ACF must preserve.\n",
    "utf8",
  );
}

async function commitAll(root: string, message: string, date: string): Promise<string> {
  await runGit(root, ["-c", "core.autocrlf=false", "add", "--all"]);
  await runGit(
    root,
    [
      "-c",
      `user.name=${fixtureIdentity.name}`,
      "-c",
      `user.email=${fixtureIdentity.email}`,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      message,
    ],
    {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  );
  return (await runGit(root, ["rev-parse", "HEAD"])).trim();
}

async function readGitStatus(root: string): Promise<readonly string[]> {
  const output = await runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output.trimEnd().length === 0 ? [] : output.trimEnd().split(/\r?\n/u);
}

async function runGit(
  cwd: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", arguments_, {
      cwd,
      env: { ...process.env, ...environment },
      shell: false,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(
          new Error(`Git ${arguments_[0] ?? "command"} failed with code ${code}: ${errorOutput}`),
        );
        return;
      }
      resolve(output);
    });
  });
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(normalizePath(parent), normalizePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
