import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUNTIME_RELATIVE_PATH = ".agent-context/runtime";
const RUNTIME_PACKAGE_MANAGER = "pnpm@10.22.0";
const RUNTIME_NODE_VERSION = "24.14.0";
const MAX_COMMAND_OUTPUT_BYTES = 1_000_000;

export type RuntimeBootstrapMode = "install-and-build" | "no-install";
export type RuntimeBootstrapStatus =
  | "dependencies-missing"
  | "build-missing"
  | "operational"
  | "invalid";

export interface RuntimeBootstrapRequest {
  readonly projectRoot: string;
  readonly mode: RuntimeBootstrapMode;
}

export interface RuntimeBootstrapResult {
  readonly command: "bootstrap-runtime";
  readonly projectRoot: string;
  readonly runtimeRoot: string;
  readonly mode: RuntimeBootstrapMode;
  readonly status: RuntimeBootstrapStatus;
  readonly operational: boolean;
  readonly message: string;
}

export type RuntimeBootstrapStep = "install" | "build" | "doctor";

export interface RuntimeBootstrapExecutor {
  run(
    step: RuntimeBootstrapStep,
    runtimeRoot: string,
  ): Promise<{ readonly stdout: string }>;
}

export async function bootstrapRuntime(
  request: RuntimeBootstrapRequest,
  executor: RuntimeBootstrapExecutor = fixedRuntimeExecutor,
): Promise<RuntimeBootstrapResult> {
  const workspace = await resolveRuntimeWorkspace(request.projectRoot);
  if (request.mode === "install-and-build") {
    await executor.run("install", workspace.runtimeRoot);
    await executor.run("build", workspace.runtimeRoot);
  }
  const doctor = decodeDoctorResult(
    (await executor.run("doctor", workspace.runtimeRoot)).stdout,
  );
  if (request.mode === "install-and-build" && !doctor.operational) {
    throw new Error(
      `Runtime bootstrap completed without an operational runtime: ${doctor.message}`,
    );
  }
  return {
    command: "bootstrap-runtime",
    projectRoot: workspace.projectRoot,
    runtimeRoot: workspace.runtimeRoot,
    mode: request.mode,
    ...doctor,
  };
}

const fixedRuntimeExecutor: RuntimeBootstrapExecutor = {
  async run(step, runtimeRoot) {
    if (step === "install" || step === "build") {
      return await runFixedPnpm(
        step === "install"
          ? ["install", "--frozen-lockfile"]
          : ["run", "build"],
        runtimeRoot,
      );
    }
    const invocation = fixedInvocation(step, runtimeRoot);
    const result = await execFileAsync(invocation.file, invocation.arguments, {
      cwd: runtimeRoot,
      encoding: "utf8",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      windowsHide: true,
    });
    return { stdout: result.stdout };
  },
};

function fixedInvocation(
  step: RuntimeBootstrapStep,
  runtimeRoot: string,
): { readonly file: string; readonly arguments: readonly string[] } {
  switch (step) {
    case "install":
    case "build":
      throw new Error("pnpm steps require resolved package-manager execution.");
    case "doctor":
      return {
        file: process.execPath,
        arguments: [path.join(runtimeRoot, "scripts", "doctor.mjs")],
      };
  }
}

async function runFixedPnpm(
  arguments_: readonly string[],
  runtimeRoot: string,
): Promise<{ readonly stdout: string }> {
  const invocation = corepackInvocation([RUNTIME_PACKAGE_MANAGER, "--version"]);
  const version = await execFileAsync(
    invocation.file,
    invocation.arguments,
    {
      cwd: runtimeRoot,
      encoding: "utf8",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      windowsHide: true,
    },
  );
  if (version.stdout.trim() !== "10.22.0") {
    throw new Error(
      `Runtime bootstrap requires pnpm 10.22.0; found ${version.stdout.trim() || "unknown"}.`,
    );
  }
  const command = corepackInvocation([RUNTIME_PACKAGE_MANAGER, ...arguments_]);
  const result = await execFileAsync(
    command.file,
    command.arguments,
    {
      cwd: runtimeRoot,
      encoding: "utf8",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      windowsHide: true,
    },
  );
  return { stdout: result.stdout };
}

function corepackInvocation(arguments_: readonly string[]): {
  readonly file: string;
  readonly arguments: readonly string[];
} {
  if (process.platform === "win32") {
    if (arguments_.some((argument) => !/^[A-Za-z0-9@./_-]+$/u.test(argument))) {
      throw new Error("Corepack received an unsafe internal argument.");
    }
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      arguments: [
        "/d",
        "/s",
        "/c",
        ["corepack", ...arguments_].join(" "),
      ],
    };
  }
  return { file: "corepack", arguments: arguments_ };
}

async function resolveRuntimeWorkspace(projectRoot: string): Promise<{
  readonly projectRoot: string;
  readonly runtimeRoot: string;
}> {
  const resolvedProjectRoot = await realpath(projectRoot);
  if (!(await stat(resolvedProjectRoot)).isDirectory()) {
    throw new Error("Runtime project root must be a directory.");
  }
  const runtimeRoot = await realpath(
    path.join(resolvedProjectRoot, RUNTIME_RELATIVE_PATH),
  );
  const relative = path.relative(resolvedProjectRoot, runtimeRoot);
  if (
    relative !== RUNTIME_RELATIVE_PATH.replaceAll("/", path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Runtime workspace must resolve to project-owned .agent-context/runtime.");
  }
  const manifest = JSON.parse(
    await readFile(path.join(runtimeRoot, "package.json"), "utf8"),
  ) as unknown;
  if (!isRecord(manifest)) {
    throw new Error("Runtime package manifest must be an object.");
  }
  if (
    manifest.packageManager !== RUNTIME_PACKAGE_MANAGER ||
    !isRecord(manifest.engines) ||
    manifest.engines.node !== RUNTIME_NODE_VERSION
  ) {
    throw new Error(
      `Runtime must own ${RUNTIME_PACKAGE_MANAGER} and Node ${RUNTIME_NODE_VERSION}.`,
    );
  }
  if (!(await stat(path.join(runtimeRoot, "pnpm-lock.yaml"))).isFile()) {
    throw new Error("Runtime workspace requires its own pnpm-lock.yaml.");
  }
  return { projectRoot: resolvedProjectRoot, runtimeRoot };
}

function decodeDoctorResult(stdout: string): {
  readonly status: RuntimeBootstrapStatus;
  readonly operational: boolean;
  readonly message: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw new Error("Runtime doctor returned invalid JSON.", { cause: error });
  }
  if (!isRecord(value)) {
    throw new Error("Runtime doctor result must be an object.");
  }
  if (
    value.status !== "dependencies-missing" &&
    value.status !== "build-missing" &&
    value.status !== "operational" &&
    value.status !== "invalid"
  ) {
    throw new Error("Runtime doctor returned an unknown status.");
  }
  if (
    typeof value.operational !== "boolean" ||
    typeof value.message !== "string" ||
    value.message.length === 0 ||
    value.operational !== (value.status === "operational")
  ) {
    throw new Error("Runtime doctor returned an inconsistent status.");
  }
  return {
    status: value.status,
    operational: value.operational,
    message: value.message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
