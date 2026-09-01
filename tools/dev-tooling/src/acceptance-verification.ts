import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { corepackInvocation, type ProcessInvocation } from "./corepack-command.js";

const MAX_RETAINED_OUTPUT_BYTES = 32_768;

export type AcceptanceProofStageId = "workspace" | "isolation" | "downstream";

export interface AcceptanceVerificationRequest {
  readonly frameworkRoot: string;
  readonly fixtureRoot: string;
}

export interface RepositorySnapshot {
  readonly root: string;
  readonly revision: string;
}

export interface AcceptanceProcessRequest extends ProcessInvocation {
  readonly cwd: string;
}

export interface AcceptanceProcessExecution {
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly outputTruncated: boolean;
  readonly error: string | null;
}

export interface AcceptanceCommandExecutor {
  run(request: AcceptanceProcessRequest): Promise<AcceptanceProcessExecution>;
}

export interface AcceptancePassedCommandOutcome {
  readonly id: string;
  readonly status: "passed";
  readonly exitCode: 0;
  readonly durationMs: number;
}

export interface AcceptanceFailedCommandOutcome {
  readonly id: string;
  readonly status: "failed";
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly detail: string;
  readonly output: {
    readonly stdoutBytes: number;
    readonly stderrBytes: number;
    readonly stdoutTail: string;
    readonly stderrTail: string;
    readonly truncated: boolean;
  };
}

export type AcceptanceCommandOutcome =
  | AcceptancePassedCommandOutcome
  | AcceptanceFailedCommandOutcome;

export interface AcceptancePassedProofStageResult<
  Id extends AcceptanceProofStageId = AcceptanceProofStageId,
> {
  readonly id: Id;
  readonly status: "passed";
  readonly durationMs: number;
  readonly commands: readonly AcceptancePassedCommandOutcome[];
}

export interface AcceptanceFailedProofStageResult<
  Id extends AcceptanceProofStageId = AcceptanceProofStageId,
> {
  readonly id: Id;
  readonly status: "failed";
  readonly durationMs: number;
  readonly commands: readonly [
    ...AcceptancePassedCommandOutcome[],
    AcceptanceFailedCommandOutcome,
  ];
}

export interface AcceptanceNotRunProofStageResult<
  Id extends AcceptanceProofStageId = AcceptanceProofStageId,
> {
  readonly id: Id;
  readonly status: "not-run";
}

export type AcceptanceProofStageResult =
  | AcceptancePassedProofStageResult
  | AcceptanceFailedProofStageResult
  | AcceptanceNotRunProofStageResult;

export type AcceptancePassedProofStages = readonly [
  AcceptancePassedProofStageResult<"workspace">,
  AcceptancePassedProofStageResult<"isolation">,
  AcceptancePassedProofStageResult<"downstream">,
];

export type AcceptancePreflightStages = readonly [
  AcceptanceNotRunProofStageResult<"workspace">,
  AcceptanceNotRunProofStageResult<"isolation">,
  AcceptanceNotRunProofStageResult<"downstream">,
];

export type AcceptanceWorkspaceFailureStages = readonly [
  AcceptanceFailedProofStageResult<"workspace">,
  AcceptanceNotRunProofStageResult<"isolation">,
  AcceptanceNotRunProofStageResult<"downstream">,
];

export type AcceptanceIsolationFailureStages = readonly [
  AcceptancePassedProofStageResult<"workspace">,
  AcceptanceFailedProofStageResult<"isolation">,
  AcceptanceNotRunProofStageResult<"downstream">,
];

export type AcceptanceDownstreamFailureStages = readonly [
  AcceptancePassedProofStageResult<"workspace">,
  AcceptancePassedProofStageResult<"isolation">,
  AcceptanceFailedProofStageResult<"downstream">,
];

export type AcceptanceProofFailureStages =
  | AcceptanceWorkspaceFailureStages
  | AcceptanceIsolationFailureStages
  | AcceptanceDownstreamFailureStages;

interface AcceptanceFailedResultBase {
  readonly schemaVersion: 1;
  readonly ok: false;
  readonly status: "failed";
  readonly framework: RepositorySnapshot | null;
  readonly fixture: RepositorySnapshot | null;
}

export type AcceptanceFailedVerificationResult = AcceptanceFailedResultBase & (
  | {
      readonly failure: { readonly phase: "preflight"; readonly detail: string };
      readonly stages: AcceptancePreflightStages;
    }
  | {
      readonly failure: { readonly phase: "workspace"; readonly detail: string };
      readonly stages: AcceptanceWorkspaceFailureStages;
    }
  | {
      readonly failure: { readonly phase: "isolation"; readonly detail: string };
      readonly stages: AcceptanceIsolationFailureStages;
    }
  | {
      readonly failure: { readonly phase: "downstream"; readonly detail: string };
      readonly stages: AcceptanceDownstreamFailureStages;
    }
  | {
      readonly failure: { readonly phase: "postflight"; readonly detail: string };
      readonly stages: AcceptancePassedProofStages | AcceptanceProofFailureStages;
    }
);

export type AcceptanceVerificationResult =
  | {
      readonly schemaVersion: 1;
      readonly ok: true;
      readonly status: "passed";
      readonly framework: RepositorySnapshot;
      readonly fixture: RepositorySnapshot;
      readonly stages: AcceptancePassedProofStages;
    }
  | AcceptanceFailedVerificationResult;

interface AcceptanceCommand {
  readonly id: string;
  readonly invocation: AcceptanceProcessRequest;
}

interface AcceptanceProofStage {
  readonly id: AcceptanceProofStageId;
  readonly commands: readonly AcceptanceCommand[];
}

export async function verifyAcceptanceSequence(
  request: AcceptanceVerificationRequest,
  executor: AcceptanceCommandExecutor = acceptanceProcessExecutor,
): Promise<AcceptanceVerificationResult> {
  const stages = initialStages();
  let framework: RepositorySnapshot | null = null;
  let fixture: RepositorySnapshot | null = null;
  try {
    if (!path.isAbsolute(request.frameworkRoot) || !path.isAbsolute(request.fixtureRoot)) {
      throw new Error("Framework and fixture roots must be absolute paths.");
    }
    framework = await readCleanRepositorySnapshot(
      request.frameworkRoot,
      "Framework",
      executor,
    );
    fixture = await readCleanRepositorySnapshot(
      request.fixtureRoot,
      "Downstream fixture",
      executor,
    );
    if (framework.root === fixture.root) {
      throw new Error("Downstream fixture must be a different Git worktree from the framework.");
    }
    await requireDownstreamProofComponents(fixture.root);
  } catch (error) {
    return failedResult(
      framework,
      fixture,
      "preflight",
      errorMessage(error),
      stages,
    );
  }

  let packageManager: string;
  try {
    packageManager = await readFrameworkPackageManager(framework.root);
  } catch (error) {
    return failedResult(
      framework,
      fixture,
      "preflight",
      errorMessage(error),
      stages,
    );
  }

  const definitions = stageDefinitions(framework.root, fixture.root, packageManager);
  for (const [index, definition] of definitions.entries()) {
    const outcome = await executeStage(definition, executor);
    stages[index] = outcome;
    if (outcome.status === "failed") {
      const failedCommand = outcome.commands.at(-1);
      const detail = failedCommand?.status === "failed"
        ? failedCommand.detail
        : `${definition.id} verification failed.`;
      const stabilityFailure = await repositoryStabilityFailure(
        framework,
        fixture,
        executor,
      );
      if (stabilityFailure !== null) {
        return failedResult(
          framework,
          fixture,
          "postflight",
          `${detail} Repository postflight also failed: ${stabilityFailure}`,
          stages,
        );
      }
      return failedResult(
        framework,
        fixture,
        definition.id,
        detail,
        stages,
      );
    }
  }

  const stabilityFailure = await repositoryStabilityFailure(
    framework,
    fixture,
    executor,
  );
  if (stabilityFailure !== null) {
    return failedResult(
      framework,
      fixture,
      "postflight",
      stabilityFailure,
      stages,
    );
  }

  return {
    schemaVersion: 1,
    ok: true,
    status: "passed",
    framework,
    fixture,
    stages: requirePassedStages(stages),
  };
}

async function requireDownstreamProofComponents(fixtureRoot: string): Promise<void> {
  const config = JSON.parse(
    await readFile(path.join(fixtureRoot, ".agent-context", "config.json"), "utf8"),
  ) as unknown;
  if (
    typeof config !== "object" ||
    config === null ||
    !("components" in config) ||
    !Array.isArray(config.components) ||
    !config.components.every((component) => typeof component === "string")
  ) {
    throw new Error("Downstream fixture ACF component selection is invalid.");
  }
  const selected = new Set(config.components);
  const missing = ["codex-runtime", "repository-policy"].filter(
    (component) => !selected.has(component),
  );
  if (missing.length > 0) {
    throw new Error(
      `Downstream fixture must select acceptance proof components: ${missing.join(", ")}.`,
    );
  }
}

function initialStages(): AcceptanceProofStageResult[] {
  return (["workspace", "isolation", "downstream"] as const).map((id) => ({
    id,
    status: "not-run",
  }));
}

function stageDefinitions(
  frameworkRoot: string,
  fixtureRoot: string,
  packageManager: string,
): readonly AcceptanceProofStage[] {
  const workspaceScripts = [
    ["typecheck", "typecheck"],
    ["test", "test"],
    ["check", "check"],
    ["registry-check", "registry:check"],
  ] as const;
  return [
    {
      id: "workspace",
      commands: workspaceScripts.map(([id, script]) => ({
        id,
        invocation: processRequest(
          corepackInvocation([
            packageManager,
            "--reporter",
            "append-only",
            "run",
            script,
          ]),
          frameworkRoot,
        ),
      })),
    },
    {
      id: "isolation",
      commands: [
        {
          id: "runtime-isolation",
          invocation: processRequest(
            corepackInvocation([
              packageManager,
              "--reporter",
              "append-only",
              "--filter",
              "@agent-context/dev-tooling",
              "verify:isolation",
            ]),
            frameworkRoot,
          ),
        },
      ],
    },
    {
      id: "downstream",
      commands: [
        {
          id: "downstream-codex-runtime",
          invocation: {
            file: process.execPath,
            arguments: [
              "--import",
              "tsx",
              path.join(frameworkRoot, "tools", "dev-tooling", "src", "codex-runtime-verification-cli.ts"),
              "--root",
              fixtureRoot,
            ],
            cwd: frameworkRoot,
          },
        },
        {
          id: "downstream-policy",
          invocation: {
            file: process.execPath,
            arguments: [path.join(fixtureRoot, ".agent-context", "policy.mjs"), "verify"],
            cwd: fixtureRoot,
          },
        },
      ],
    },
  ];
}

async function readFrameworkPackageManager(frameworkRoot: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(frameworkRoot, "package.json"), "utf8"),
  ) as unknown;
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("packageManager" in manifest) ||
    typeof manifest.packageManager !== "string" ||
    !/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/u.test(manifest.packageManager)
  ) {
    throw new Error("Framework package.json must declare an exact pnpm packageManager version.");
  }
  return manifest.packageManager;
}

function processRequest(
  invocation: ProcessInvocation,
  cwd: string,
): AcceptanceProcessRequest {
  return { ...invocation, cwd };
}

async function executeStage(
  stage: AcceptanceProofStage,
  executor: AcceptanceCommandExecutor,
): Promise<AcceptanceProofStageResult> {
  const outcomes: AcceptancePassedCommandOutcome[] = [];
  for (const command of stage.commands) {
    const execution = await executor.run(command.invocation);
    const outcome = commandOutcome(command.id, execution);
    if (outcome.status === "failed") {
      const commands: [
        ...AcceptancePassedCommandOutcome[],
        AcceptanceFailedCommandOutcome,
      ] = [...outcomes, outcome];
      return {
        id: stage.id,
        status: "failed",
        durationMs: totalDuration(commands),
        commands,
      };
    }
    outcomes.push(outcome);
  }
  return {
    id: stage.id,
    status: "passed",
    durationMs: totalDuration(outcomes),
    commands: outcomes,
  };
}

function requirePassedStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptancePassedProofStages {
  return [
    requirePassedStage(stages[0], "workspace"),
    requirePassedStage(stages[1], "isolation"),
    requirePassedStage(stages[2], "downstream"),
  ];
}

function requirePassedStage<Id extends AcceptanceProofStageId>(
  stage: AcceptanceProofStageResult | undefined,
  id: Id,
): AcceptancePassedProofStageResult<Id> {
  if (stage === undefined || stage.id !== id || stage.status !== "passed") {
    throw new Error(`Acceptance sequence completed without a passed ${id} stage.`);
  }
  return {
    id,
    status: "passed",
    durationMs: stage.durationMs,
    commands: stage.commands,
  };
}

function requireFailedStage<Id extends AcceptanceProofStageId>(
  stage: AcceptanceProofStageResult | undefined,
  id: Id,
): AcceptanceFailedProofStageResult<Id> {
  if (stage === undefined || stage.id !== id || stage.status !== "failed") {
    throw new Error(`Acceptance sequence completed without a failed ${id} stage.`);
  }
  return {
    id,
    status: "failed",
    durationMs: stage.durationMs,
    commands: stage.commands,
  };
}

function requireNotRunStage<Id extends AcceptanceProofStageId>(
  stage: AcceptanceProofStageResult | undefined,
  id: Id,
): AcceptanceNotRunProofStageResult<Id> {
  if (stage === undefined || stage.id !== id || stage.status !== "not-run") {
    throw new Error(`Acceptance sequence unexpectedly ran the ${id} stage.`);
  }
  return { id, status: "not-run" };
}

function requirePreflightStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptancePreflightStages {
  return [
    requireNotRunStage(stages[0], "workspace"),
    requireNotRunStage(stages[1], "isolation"),
    requireNotRunStage(stages[2], "downstream"),
  ];
}

function requireWorkspaceFailureStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptanceWorkspaceFailureStages {
  return [
    requireFailedStage(stages[0], "workspace"),
    requireNotRunStage(stages[1], "isolation"),
    requireNotRunStage(stages[2], "downstream"),
  ];
}

function requireIsolationFailureStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptanceIsolationFailureStages {
  return [
    requirePassedStage(stages[0], "workspace"),
    requireFailedStage(stages[1], "isolation"),
    requireNotRunStage(stages[2], "downstream"),
  ];
}

function requireDownstreamFailureStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptanceDownstreamFailureStages {
  return [
    requirePassedStage(stages[0], "workspace"),
    requirePassedStage(stages[1], "isolation"),
    requireFailedStage(stages[2], "downstream"),
  ];
}

function requireProofFailureStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptanceProofFailureStages {
  if (stages[0]?.status === "failed") return requireWorkspaceFailureStages(stages);
  if (stages[1]?.status === "failed") return requireIsolationFailureStages(stages);
  if (stages[2]?.status === "failed") return requireDownstreamFailureStages(stages);
  throw new Error("Acceptance postflight failure has no failed proof stage.");
}

function requirePostflightStages(
  stages: readonly AcceptanceProofStageResult[],
): AcceptancePassedProofStages | AcceptanceProofFailureStages {
  return stages.every((stage) => stage.status === "passed")
    ? requirePassedStages(stages)
    : requireProofFailureStages(stages);
}

function commandOutcome(
  id: string,
  execution: AcceptanceProcessExecution,
): AcceptanceCommandOutcome {
  if (execution.exitCode === 0 && execution.error === null) {
    return {
      id,
      status: "passed",
      exitCode: 0,
      durationMs: execution.durationMs,
    };
  }
  return {
    id,
    status: "failed",
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    detail: execution.error ?? `Command ${id} exited with code ${execution.exitCode ?? "unknown"}.`,
    output: {
      stdoutBytes: execution.stdoutBytes,
      stderrBytes: execution.stderrBytes,
      stdoutTail: execution.stdout,
      stderrTail: execution.stderr,
      truncated: execution.outputTruncated,
    },
  };
}

function totalDuration(outcomes: readonly AcceptanceCommandOutcome[]): number {
  return outcomes.reduce((total, outcome) => total + outcome.durationMs, 0);
}

async function readCleanRepositorySnapshot(
  candidateRoot: string,
  label: string,
  executor: AcceptanceCommandExecutor,
): Promise<RepositorySnapshot> {
  const root = await realpath(candidateRoot);
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`${label} root must be a directory.`);
  }
  const topLevel = await runGit(root, ["rev-parse", "--show-toplevel"], executor);
  const resolvedTopLevel = await realpath(topLevel.trim());
  if (path.relative(root, resolvedTopLevel) !== "") {
    throw new Error(`${label} root must be the Git worktree root.`);
  }
  const status = await runGit(
    root,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    executor,
  );
  if (status.trim().length > 0) {
    throw new Error(`${label} worktree must be clean before acceptance verification.`);
  }
  const revision = (await runGit(root, ["rev-parse", "HEAD"], executor)).trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error(`${label} HEAD did not resolve to a full Git revision.`);
  }
  return { root, revision };
}

async function runGit(
  cwd: string,
  arguments_: readonly string[],
  executor: AcceptanceCommandExecutor,
): Promise<string> {
  const result = await executor.run({ file: "git", arguments: arguments_, cwd });
  if (result.exitCode !== 0 || result.error !== null) {
    throw new Error(
      result.error ??
      `Git ${arguments_.join(" ")} exited with code ${result.exitCode ?? "unknown"}: ${result.stderr.trim()}`,
    );
  }
  if (result.outputTruncated) {
    throw new Error(`Git ${arguments_.join(" ")} exceeded the retained output boundary.`);
  }
  return result.stdout;
}

function requireSameSnapshot(
  initial: RepositorySnapshot,
  final: RepositorySnapshot,
  label: string,
): void {
  if (initial.root !== final.root || initial.revision !== final.revision) {
    throw new Error(`${label} revision changed during acceptance verification.`);
  }
}

async function repositoryStabilityFailure(
  framework: RepositorySnapshot,
  fixture: RepositorySnapshot,
  executor: AcceptanceCommandExecutor,
): Promise<string | null> {
  try {
    const finalFramework = await readCleanRepositorySnapshot(
      framework.root,
      "Framework",
      executor,
    );
    const finalFixture = await readCleanRepositorySnapshot(
      fixture.root,
      "Downstream fixture",
      executor,
    );
    requireSameSnapshot(framework, finalFramework, "Framework");
    requireSameSnapshot(fixture, finalFixture, "Downstream fixture");
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

function failedResult(
  framework: RepositorySnapshot | null,
  fixture: RepositorySnapshot | null,
  phase: "preflight" | AcceptanceProofStageId | "postflight",
  detail: string,
  stages: readonly AcceptanceProofStageResult[],
): AcceptanceVerificationResult {
  const base: AcceptanceFailedResultBase = {
    schemaVersion: 1,
    ok: false,
    status: "failed",
    framework,
    fixture,
  };
  switch (phase) {
    case "preflight":
      return {
        ...base,
        failure: { phase, detail },
        stages: requirePreflightStages(stages),
      };
    case "workspace":
      return {
        ...base,
        failure: { phase, detail },
        stages: requireWorkspaceFailureStages(stages),
      };
    case "isolation":
      return {
        ...base,
        failure: { phase, detail },
        stages: requireIsolationFailureStages(stages),
      };
    case "downstream":
      return {
        ...base,
        failure: { phase, detail },
        stages: requireDownstreamFailureStages(stages),
      };
    case "postflight":
      return {
        ...base,
        failure: { phase, detail },
        stages: requirePostflightStages(stages),
      };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface RetainedOutput {
  readonly buffer: Buffer;
  readonly bytes: number;
  readonly truncated: boolean;
}

function retainTail(previous: RetainedOutput, chunk: Buffer): RetainedOutput {
  const bytes = previous.bytes + chunk.byteLength;
  const combined = Buffer.concat([previous.buffer, chunk]);
  const tail = combined.byteLength > MAX_RETAINED_OUTPUT_BYTES
    ? combined.subarray(combined.byteLength - MAX_RETAINED_OUTPUT_BYTES)
    : combined;
  return {
    buffer: tail,
    bytes,
    truncated: bytes > tail.byteLength,
  };
}

export const acceptanceProcessExecutor: AcceptanceCommandExecutor = {
  async run(request) {
    return await new Promise<AcceptanceProcessExecution>((resolve) => {
      const startedAt = performance.now();
      let stdout: RetainedOutput = {
        buffer: Buffer.alloc(0),
        bytes: 0,
        truncated: false,
      };
      let stderr: RetainedOutput = {
        buffer: Buffer.alloc(0),
        bytes: 0,
        truncated: false,
      };
      let completed = false;
      const child = spawn(request.file, request.arguments, {
        cwd: request.cwd,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = retainTail(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = retainTail(stderr, chunk);
      });
      const finish = (exitCode: number | null, error: string | null): void => {
        if (completed) return;
        completed = true;
        resolve({
          exitCode,
          durationMs: Math.round(performance.now() - startedAt),
          stdout: stdout.buffer.toString("utf8"),
          stderr: stderr.buffer.toString("utf8"),
          stdoutBytes: stdout.bytes,
          stderrBytes: stderr.bytes,
          outputTruncated: stdout.truncated || stderr.truncated,
          error,
        });
      };
      child.on("error", (error) => finish(null, error.message));
      child.on("close", (exitCode) => finish(exitCode, null));
    });
  },
};
