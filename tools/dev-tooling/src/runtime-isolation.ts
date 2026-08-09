import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { bootstrapRuntime } from "./runtime-bootstrap.js";
import { addComponent, initProject } from "./context-installer.js";
import { verifyInstalledCodexRuntime } from "./codex-runtime-verification.js";

const MAX_PROCESS_OUTPUT_BYTES = 1_000_000;
const SOURCE_MARKER = "must be an isolation object";

export interface RuntimeIsolationResult {
  readonly schemaVersion: 1;
  readonly fixture: "non-node";
  readonly archive: "git-tracked-runtime";
  readonly bootstrap: {
    readonly noInstall: "dependencies-missing";
    readonly installed: "operational";
  };
  readonly surfaces: {
    readonly policy: "ok";
    readonly projectMatrix: "ok";
    readonly repositoryContext: "ok";
    readonly hooks: "ok";
  };
  readonly sourceRebuild: "observed";
  readonly hostHashes: "unchanged";
  readonly hostPackageJson: "absent";
  readonly waveFour: {
    readonly materializer: "codex-runtime";
    readonly bootstrap: "operational";
    readonly installedEntrypoints: "verified";
    readonly hostHashes: "unchanged";
    readonly hostPackageJson: "absent";
  };
}

export async function verifyRuntimeIsolation(
  frameworkRoot: string,
): Promise<RuntimeIsolationResult> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "agent-context-isolation-"),
  );
  const fixtureRoot = path.join(temporaryRoot, "fixture");
  try {
    await mkdir(fixtureRoot, { recursive: true });
    await materializeArchivedRuntime(frameworkRoot, fixtureRoot, temporaryRoot);
    await writeFile(
      path.join(fixtureRoot, "README.md"),
      "Isolated non-Node host fixture.\n",
      "utf8",
    );
    await writeFile(path.join(fixtureRoot, "host.lock"), "host lock\n", "utf8");

    const bindingPath = ".agent-context/session-binding.json";
    await writeFile(
      path.join(fixtureRoot, bindingPath),
      `${JSON.stringify({
        schemaVersion: 1,
        sessionId: "isolation-session",
        expiresAtEpochMs: 4_102_444_800_000,
        writablePaths: ["README.md"],
        sources: [
          {
            path: "README.md",
            sha256: await hashFile(path.join(fixtureRoot, "README.md")),
          },
        ],
        compactContext: "Isolation fixture context restored.",
      })}\n`,
      "utf8",
    );
    const hostFiles = ["README.md", "host.lock", bindingPath] as const;
    const hostHashesBefore = await hashFiles(fixtureRoot, hostFiles);

    const noInstall = await bootstrapRuntime({
      projectRoot: fixtureRoot,
      mode: "no-install",
    });
    assertEqual(
      noInstall.status,
      "dependencies-missing",
      "Archived runtime no-install status",
    );
    const installed = await bootstrapRuntime({
      projectRoot: fixtureRoot,
      mode: "install-and-build",
    });
    assertEqual(installed.status, "operational", "Installed runtime status");

    const runtimeRoot = path.join(fixtureRoot, ".agent-context", "runtime");
    await verifyPolicySurface(runtimeRoot, fixtureRoot);
    await verifyProjectMatrixSurface(runtimeRoot, fixtureRoot);
    await verifyRepositoryContextSurface(runtimeRoot, fixtureRoot);
    await verifyHookSurface(runtimeRoot, fixtureRoot, bindingPath);
    await verifySourceRebuild(runtimeRoot);

    const hostHashesAfter = await hashFiles(fixtureRoot, hostFiles);
    assertEqual(
      JSON.stringify(hostHashesAfter),
      JSON.stringify(hostHashesBefore),
      "Host file hashes",
    );
    if (await exists(path.join(fixtureRoot, "package.json"))) {
      throw new Error("Isolation bootstrap created a host package.json.");
    }
    const waveFour = await verifyMaterializedCodexRuntime(
      frameworkRoot,
      path.join(temporaryRoot, "wave-four-fixture"),
    );

    return {
      schemaVersion: 1,
      fixture: "non-node",
      archive: "git-tracked-runtime",
      bootstrap: {
        noInstall: "dependencies-missing",
        installed: "operational",
      },
      surfaces: {
        policy: "ok",
        projectMatrix: "ok",
        repositoryContext: "ok",
        hooks: "ok",
      },
      sourceRebuild: "observed",
      hostHashes: "unchanged",
      hostPackageJson: "absent",
      waveFour,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifyMaterializedCodexRuntime(
  frameworkRoot: string,
  fixtureRoot: string,
): Promise<RuntimeIsolationResult["waveFour"]> {
  await mkdir(fixtureRoot, { recursive: true });
  await runProcess("git", ["init", "--quiet"], fixtureRoot);
  await writeFile(path.join(fixtureRoot, "README.md"), "Wave 4 isolated non-Node fixture.\n", "utf8");
  await writeFile(path.join(fixtureRoot, "host.lock"), "host lock\n", "utf8");
  const hostFiles = ["README.md", "host.lock"] as const;
  const before = await hashFiles(fixtureRoot, hostFiles);

  await initProject(fixtureRoot, frameworkRoot);
  const added = await addComponent(fixtureRoot, frameworkRoot, "codex-runtime");
  if (added.plan.status !== "ready") throw new Error("Codex runtime materialization was blocked.");
  const noInstall = await bootstrapRuntime({ projectRoot: fixtureRoot, mode: "no-install" });
  assertEqual(noInstall.status, "dependencies-missing", "Materialized runtime no-install status");
  const installed = await bootstrapRuntime({ projectRoot: fixtureRoot, mode: "install-and-build" });
  assertEqual(installed.status, "operational", "Materialized runtime installed status");
  await verifyInstalledCodexRuntime(fixtureRoot);

  const after = await hashFiles(fixtureRoot, hostFiles);
  assertEqual(JSON.stringify(after), JSON.stringify(before), "Materialized host file hashes");
  if (await exists(path.join(fixtureRoot, "package.json"))) {
    throw new Error("Codex runtime materialization created a host package.json.");
  }
  return {
    materializer: "codex-runtime",
    bootstrap: "operational",
    installedEntrypoints: "verified",
    hostHashes: "unchanged",
    hostPackageJson: "absent",
  };
}

async function materializeArchivedRuntime(
  frameworkRoot: string,
  fixtureRoot: string,
  temporaryRoot: string,
): Promise<void> {
  const archivePath = path.join(temporaryRoot, "runtime.tar");
  await runProcess(
    "git",
    [
      "archive",
      "--format=tar",
      `--output=${archivePath}`,
      "HEAD",
      "--",
      ".agent-context/runtime",
    ],
    frameworkRoot,
  );
  await runProcess("tar", ["-xf", archivePath, "-C", fixtureRoot], frameworkRoot);
}

async function verifyPolicySurface(
  runtimeRoot: string,
  fixtureRoot: string,
): Promise<void> {
  const result = await runProcess(
    process.execPath,
    [
      path.join(runtimeRoot, "packages", "policy", "dist", "src", "cli.js"),
      "inspect-workspace",
      "--root",
      fixtureRoot,
    ],
    fixtureRoot,
  );
  const units = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(units) || units.length !== 0) {
    throw new Error("Policy inspection did not recognize the non-Node fixture.");
  }
}

async function verifyProjectMatrixSurface(
  runtimeRoot: string,
  fixtureRoot: string,
): Promise<void> {
  const cli = path.join(runtimeRoot, "packages", "policy", "dist", "src", "cli.js");
  const matrixRoot = path.join(fixtureRoot, ".agent-context", "validation-matrix");
  const fixtures = [
    { name: "minimal-typescript", files: [["package.json", "{}\n"], ["tsconfig.json", "{}\n"]], manifests: ["package.json"], markers: ["package.json", "tsconfig.json"] },
    { name: "non-node", files: [["pyproject.toml", "[project]\nname = \"fixture\"\n"]], manifests: [], markers: ["pyproject.toml"] },
    { name: "codex-configured", files: [[".codex/config.toml", "model = \"explicit\"\n"], [".codex/hooks.json", "{}\n"]], manifests: [], markers: [] },
    { name: "monorepo", files: [["package.json", "{}\n"], ["packages/app/package.json", "{}\n"]], manifests: ["package.json", "packages/app/package.json"], markers: ["package.json"] },
    { name: "single-package", files: [["package.json", "{}\n"]], manifests: ["package.json"], markers: ["package.json"] },
    { name: "no-frontend", files: [["README.md", "No frontend.\n"]], manifests: [], markers: [] },
    { name: "frontend-without-tailwind", files: [["package.json", '{"dependencies":{"react":"19.0.0"}}\n']], manifests: ["package.json"], markers: ["package.json"] },
    { name: "frontend-with-tailwind", files: [["package.json", '{"dependencies":{"react":"19.0.0","tailwindcss":"4.0.0"}}\n']], manifests: ["package.json"], markers: ["package.json"] },
  ] as const;
  for (const fixture of fixtures) {
    const root = path.join(matrixRoot, fixture.name);
    await mkdir(root, { recursive: true });
    for (const [relativePath, content] of fixture.files) {
      const target = path.join(root, ...relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    const result = await runProcess(process.execPath, [cli, "inspect", "--root", root], root);
    const inspection: unknown = JSON.parse(result.stdout);
    if (!isRecord(inspection) || !isRecord(inspection.observations)) {
      throw new Error(`Policy project-matrix inspection returned an invalid result for ${fixture.name}.`);
    }
    assertEqual(
      JSON.stringify(inspection.observations.packageManifests),
      JSON.stringify(fixture.manifests),
      `${fixture.name} package manifests`,
    );
    assertEqual(
      JSON.stringify(inspection.observations.languageMarkers),
      JSON.stringify(fixture.markers),
      `${fixture.name} language markers`,
    );
  }
}

async function verifyRepositoryContextSurface(
  runtimeRoot: string,
  fixtureRoot: string,
): Promise<void> {
  const result = await runProcess(
    process.execPath,
    [
      path.join(runtimeRoot, "packages", "repo-context", "dist", "src", "cli.js"),
      "read",
      "--root",
      fixtureRoot,
      "--path",
      "README.md",
      "--format",
      "json",
    ],
    fixtureRoot,
  );
  const output = JSON.parse(result.stdout) as {
    readonly outcome?: unknown;
    readonly content?: unknown;
  };
  assertEqual(output.outcome, "success", "Repository-context outcome");
  if (
    typeof output.content !== "string" ||
    !output.content.includes("Isolated non-Node host fixture.")
  ) {
    throw new Error("Repository-context read did not return the fixture content.");
  }
}

async function verifyHookSurface(
  runtimeRoot: string,
  fixtureRoot: string,
  bindingPath: string,
): Promise<void> {
  const cli = path.join(runtimeRoot, "packages", "hooks", "dist", "src", "cli.js");
  const commonArguments = [
    cli,
    "--root",
    fixtureRoot,
    "--binding",
    bindingPath,
  ];
  const patchResult = await runProcess(
    process.execPath,
    commonArguments,
    fixtureRoot,
    JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      session_id: "isolation-session",
      tool_input: { command: "*** Update File: README.md" },
    }),
  );
  const patchOutput = JSON.parse(patchResult.stdout) as {
    readonly hookSpecificOutput?: {
      readonly hookEventName?: unknown;
      readonly permissionDecision?: unknown;
    };
  };
  assertEqual(
    patchOutput.hookSpecificOutput?.hookEventName,
    "PreToolUse",
    "Patch hook event",
  );
  assertEqual(
    patchOutput.hookSpecificOutput?.permissionDecision,
    "allow",
    "Patch hook decision",
  );

  const sessionResult = await runProcess(
    process.execPath,
    commonArguments,
    fixtureRoot,
    JSON.stringify(
      {
        hook_event_name: "SessionStart",
        source: "compact",
        session_id: "isolation-session",
      },
      null,
      2,
    ),
  );
  const sessionOutput = JSON.parse(sessionResult.stdout) as {
    readonly hookSpecificOutput?: {
      readonly hookEventName?: unknown;
      readonly additionalContext?: unknown;
    };
  };
  assertEqual(
    sessionOutput.hookSpecificOutput?.hookEventName,
    "SessionStart",
    "Session hook event",
  );
  assertEqual(
    sessionOutput.hookSpecificOutput?.additionalContext,
    "Isolation fixture context restored.",
    "Session hook context",
  );
}

async function verifySourceRebuild(runtimeRoot: string): Promise<void> {
  const sourcePath = path.join(
    runtimeRoot,
    "packages",
    "shared",
    "src",
    "decoding.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const changed = source.replace("must be an object", SOURCE_MARKER);
  if (changed === source) {
    throw new Error("Isolation source-edit marker could not be applied.");
  }
  await writeFile(sourcePath, changed, "utf8");
  await runProcess(
    process.execPath,
    [path.join(runtimeRoot, "scripts", "build.mjs")],
    runtimeRoot,
  );

  const moduleUrl = pathToFileURL(
    path.join(runtimeRoot, "packages", "shared", "dist", "src", "index.js"),
  ).href;
  const probe = [
    `import { strictRecord } from ${JSON.stringify(moduleUrl)};`,
    "try { strictRecord(null, 'Probe', []); }",
    "catch (error) { process.stdout.write(error instanceof Error ? error.message : String(error)); }",
  ].join("\n");
  const result = await runProcess(
    process.execPath,
    ["--input-type=module", "--eval", probe],
    runtimeRoot,
  );
  if (!result.stdout.includes(SOURCE_MARKER)) {
    throw new Error("Rebuilt runtime did not expose the edited source behavior.");
  }
}

async function runProcess(
  file: string,
  arguments_: readonly string[],
  cwd: string,
  input?: string,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(file, arguments_, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const collect = (target: "stdout" | "stderr", chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        reject(new Error(`${file} exceeded the isolation output limit.`));
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${file} exited with ${code ?? "no status"}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

async function hashFiles(
  root: string,
  paths: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (relativePath) => [
        relativePath,
        await hashFile(path.join(root, relativePath)),
      ]),
    ),
  );
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`,
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
