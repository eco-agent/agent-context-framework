import { spawn } from "node:child_process";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  findFiles,
  pathExists,
  portableRelativePath,
  strictRecord,
  stringArray,
} from "@agent-context-runtime/shared";

import {
  decodeContextInstallationLock,
  decodeContextProjectConfig,
} from "./context-installation.js";

export const REPOSITORY_POLICY_SCHEMA_VERSION = 1 as const;
export const REPOSITORY_POLICY_CONFIG_PATH = ".agent-context/policy.json";
export const REPOSITORY_POLICY_INVARIANTS_PATH =
  ".agent-context/policy-invariants.json";

export const repositoryPolicyInvariantIds = [
  "explicit-project-facts",
  "explicit-verification-profiles",
  "observation-only-inspection",
  "tokenized-command-execution",
] as const;

export type RepositoryPolicyInvariantId =
  (typeof repositoryPolicyInvariantIds)[number];

export interface UnconfiguredRepositoryPolicy {
  readonly schemaVersion: typeof REPOSITORY_POLICY_SCHEMA_VERSION;
  readonly state: "unconfigured";
}

export interface ConfiguredRepositoryPolicy {
  readonly schemaVersion: typeof REPOSITORY_POLICY_SCHEMA_VERSION;
  readonly state: "configured";
  readonly repository: RepositoryFacts;
  readonly commands: readonly PolicyCommand[];
  readonly profiles: readonly VerificationProfile[];
  readonly defaultProfile: string;
}

export type RepositoryPolicyConfiguration =
  | UnconfiguredRepositoryPolicy
  | ConfiguredRepositoryPolicy;

export interface RepositoryFacts {
  readonly repositoryType: string;
  readonly languages: readonly string[];
  readonly documentationRoots: readonly string[];
  readonly packageManager: PackageManagerDeclaration;
  readonly layout: "none" | "single-package" | "monorepo";
  readonly frontend: boolean;
}

export type PackageManagerDeclaration =
  | { readonly state: "none" }
  | {
      readonly state: "declared";
      readonly name: string;
      readonly version: string | null;
    };

interface PolicyCommandBase {
  readonly id: string;
  readonly timeoutMs: number;
}

export interface ProcessPolicyCommand extends PolicyCommandBase {
  readonly kind: "process";
  readonly executable: string;
  readonly arguments: readonly string[];
}

export interface PackageScriptPolicyCommand extends PolicyCommandBase {
  readonly kind: "package-script";
  readonly script: string;
  readonly arguments: readonly string[];
}

export type PolicyCommand = ProcessPolicyCommand | PackageScriptPolicyCommand;

export interface VerificationProfile {
  readonly id: string;
  readonly commands: readonly string[];
}

export interface RepositoryPolicyInvariantManifest {
  readonly schemaVersion: typeof REPOSITORY_POLICY_SCHEMA_VERSION;
  readonly invariants: readonly RepositoryPolicyInvariantId[];
}

export interface RepositoryInspection {
  readonly operation: "inspect";
  readonly root: string;
  readonly observations: {
    readonly rootEntries: readonly string[];
    readonly packageManifests: readonly string[];
    readonly packageManagerFiles: readonly string[];
    readonly languageMarkers: readonly string[];
  };
}

export type RepositoryPolicyDoctorResult =
  | {
      readonly operation: "doctor";
      readonly ok: false;
      readonly status: "configuration-required" | "invalid";
      readonly diagnostics: readonly string[];
    }
  | {
      readonly operation: "doctor";
      readonly ok: true;
      readonly status: "ready";
      readonly diagnostics: readonly string[];
      readonly configuration: ConfiguredRepositoryPolicy;
    };

export type PolicyCommandOutcome =
  | {
      readonly id: string;
      readonly status: "passed";
      readonly exitCode: 0;
      readonly durationMs: number;
    }
  | {
      readonly id: string;
      readonly status: "failed";
      readonly exitCode: number;
      readonly durationMs: number;
      readonly detail: string;
    }
  | {
      readonly id: string;
      readonly status: "timed-out";
      readonly exitCode: null;
      readonly durationMs: number;
      readonly detail: string;
    };

export type RepositoryPolicyVerificationResult =
  | {
      readonly operation: "verify";
      readonly ok: false;
      readonly status: "configuration-required" | "invalid";
      readonly profile: string | null;
      readonly diagnostics: readonly string[];
      readonly commands: readonly PolicyCommandOutcome[];
    }
  | {
      readonly operation: "verify";
      readonly ok: boolean;
      readonly status: "completed";
      readonly profile: string;
      readonly diagnostics: readonly string[];
      readonly commands: readonly PolicyCommandOutcome[];
    };

export function decodeRepositoryPolicyConfiguration(
  value: unknown,
): RepositoryPolicyConfiguration {
  const stateRecord = strictRecord(
    value,
    "Repository policy configuration",
    ["schemaVersion", "state", "repository", "commands", "profiles", "defaultProfile"],
  );
  requireSchemaVersion(stateRecord.schemaVersion, "Repository policy configuration");
  if (stateRecord.state === "unconfigured") {
    strictRecord(value, "Unconfigured repository policy", ["schemaVersion", "state"]);
    return { schemaVersion: REPOSITORY_POLICY_SCHEMA_VERSION, state: "unconfigured" };
  }
  if (stateRecord.state !== "configured") {
    throw new Error("Repository policy state must be unconfigured or configured.");
  }
  const repository = decodeRepositoryFacts(stateRecord.repository);
  const commands = decodeArray(
    stateRecord.commands,
    "Repository policy commands",
    decodePolicyCommand,
  );
  requireUnique(commands.map((command) => command.id), "Repository policy command IDs");
  const profiles = decodeArray(
    stateRecord.profiles,
    "Repository policy profiles",
    decodeVerificationProfile,
  );
  if (profiles.length === 0) {
    throw new Error("Configured repository policy must declare at least one profile.");
  }
  requireUnique(profiles.map((profile) => profile.id), "Repository policy profile IDs");
  const commandIds = new Set(commands.map((command) => command.id));
  if (
    commands.some((command) => command.kind === "package-script") &&
    (repository.packageManager.state !== "declared" ||
      repository.packageManager.version === null)
  ) {
    throw new Error(
      "Package-script policy commands require a declared package manager with an exact version.",
    );
  }
  for (const profile of profiles) {
    const unknown = profile.commands.find((command) => !commandIds.has(command));
    if (unknown !== undefined) {
      throw new Error(`Repository policy profile ${profile.id} references unknown command ${unknown}.`);
    }
  }
  const defaultProfile = identifier(stateRecord.defaultProfile, "Repository policy defaultProfile");
  if (!profiles.some((profile) => profile.id === defaultProfile)) {
    throw new Error(`Repository policy default profile is not declared: ${defaultProfile}.`);
  }
  return {
    schemaVersion: REPOSITORY_POLICY_SCHEMA_VERSION,
    state: "configured",
    repository,
    commands,
    profiles,
    defaultProfile,
  };
}

export function decodeRepositoryPolicyInvariantManifest(
  value: unknown,
): RepositoryPolicyInvariantManifest {
  const record = strictRecord(value, "Repository policy invariant manifest", [
    "schemaVersion",
    "invariants",
  ]);
  requireSchemaVersion(record.schemaVersion, "Repository policy invariant manifest");
  const invariants = stringArray(
    record.invariants,
    "Repository policy invariant manifest invariants",
  );
  requireUnique(invariants, "Repository policy invariants");
  if (
    invariants.length !== repositoryPolicyInvariantIds.length ||
    invariants.some((invariant, index) => invariant !== repositoryPolicyInvariantIds[index])
  ) {
    throw new Error(
      `Repository policy invariants must be exactly: ${repositoryPolicyInvariantIds.join(", ")}.`,
    );
  }
  return {
    schemaVersion: REPOSITORY_POLICY_SCHEMA_VERSION,
    invariants: repositoryPolicyInvariantIds,
  };
}

export async function inspectRepository(root: string): Promise<RepositoryInspection> {
  const resolvedRoot = await realpath(root);
  const rootEntries = (await readdir(resolvedRoot, { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
    .sort();
  const packageManifests = await findFiles(
    resolvedRoot,
    (relativePath) => relativePath === "package.json" || relativePath.endsWith("/package.json"),
  );
  const packageManagerFiles = await presentRootFiles(resolvedRoot, [
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
  ]);
  const languageMarkers = await presentRootFiles(resolvedRoot, [
    "Cargo.toml",
    "Gemfile",
    "go.mod",
    "package.json",
    "pom.xml",
    "pyproject.toml",
    "requirements.txt",
    "tsconfig.json",
  ]);
  return {
    operation: "inspect",
    root: resolvedRoot,
    observations: {
      rootEntries,
      packageManifests,
      packageManagerFiles,
      languageMarkers,
    },
  };
}

export async function doctorRepositoryPolicy(
  root: string,
  configPath = REPOSITORY_POLICY_CONFIG_PATH,
  invariantPath = REPOSITORY_POLICY_INVARIANTS_PATH,
): Promise<RepositoryPolicyDoctorResult> {
  try {
    const resolvedRoot = await realpath(root);
    const configuration = decodeRepositoryPolicyConfiguration(
      await readJson(repositoryPath(resolvedRoot, configPath), "Repository policy configuration"),
    );
    decodeRepositoryPolicyInvariantManifest(
      await readJson(repositoryPath(resolvedRoot, invariantPath), "Repository policy invariant manifest"),
    );
    await checkContextInstallation(resolvedRoot);
    if (configuration.state === "unconfigured") {
      return {
        operation: "doctor",
        ok: false,
        status: "configuration-required",
        diagnostics: [
          `${configPath} is unconfigured; record explicit repository facts and verification profiles.`,
        ],
      };
    }
    const missingDocumentationRoot = await firstMissingPath(
      resolvedRoot,
      configuration.repository.documentationRoots,
    );
    if (missingDocumentationRoot !== null) {
      return {
        operation: "doctor",
        ok: false,
        status: "invalid",
        diagnostics: [`Declared documentation root does not exist: ${missingDocumentationRoot}.`],
      };
    }
    return {
      operation: "doctor",
      ok: true,
      status: "ready",
      diagnostics: [],
      configuration,
    };
  } catch (error) {
    return {
      operation: "doctor",
      ok: false,
      status: "invalid",
      diagnostics: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function verifyRepositoryPolicy(
  root: string,
  requestedProfile: string | null,
  configPath = REPOSITORY_POLICY_CONFIG_PATH,
  invariantPath = REPOSITORY_POLICY_INVARIANTS_PATH,
): Promise<RepositoryPolicyVerificationResult> {
  const doctor = await doctorRepositoryPolicy(root, configPath, invariantPath);
  if (!doctor.ok) {
    return {
      operation: "verify",
      ok: false,
      status: doctor.status,
      profile: requestedProfile,
      diagnostics: doctor.diagnostics,
      commands: [],
    };
  }
  const profileId = requestedProfile ?? doctor.configuration.defaultProfile;
  const profile = doctor.configuration.profiles.find((candidate) => candidate.id === profileId);
  if (profile === undefined) {
    return {
      operation: "verify",
      ok: false,
      status: "invalid",
      profile: profileId,
      diagnostics: [`Unknown repository policy profile: ${profileId}.`],
      commands: [],
    };
  }
  const commandsById = new Map(
    doctor.configuration.commands.map((command) => [command.id, command]),
  );
  const outcomes: PolicyCommandOutcome[] = [];
  for (const commandId of profile.commands) {
    const command = commandsById.get(commandId);
    if (command === undefined) {
      throw new Error(`Validated profile references missing command ${commandId}.`);
    }
    const outcome = await runPolicyCommand(
      await realpath(root),
      command,
      doctor.configuration.repository.packageManager,
    );
    outcomes.push(outcome);
    if (outcome.status !== "passed") break;
  }
  return {
    operation: "verify",
    ok: outcomes.every((outcome) => outcome.status === "passed"),
    status: "completed",
    profile: profileId,
    diagnostics: [],
    commands: outcomes,
  };
}

function decodeRepositoryFacts(value: unknown): RepositoryFacts {
  const record = strictRecord(value, "Repository policy facts", [
    "repositoryType",
    "languages",
    "documentationRoots",
    "packageManager",
    "layout",
    "frontend",
  ]);
  const languages = stringArray(record.languages, "Repository policy languages").map(
    (language) => identifier(language, "Repository policy language"),
  );
  if (languages.length === 0) {
    throw new Error("Configured repository policy must declare at least one language.");
  }
  requireUnique(languages, "Repository policy languages");
  const documentationRoots = stringArray(
    record.documentationRoots,
    "Repository policy documentationRoots",
  ).map((root) => portableRelativePath(root, "Repository policy documentation root"));
  requireUnique(documentationRoots, "Repository policy documentation roots");
  const layout = record.layout;
  if (layout !== "none" && layout !== "single-package" && layout !== "monorepo") {
    throw new Error("Repository policy layout must be none, single-package, or monorepo.");
  }
  if (typeof record.frontend !== "boolean") {
    throw new Error("Repository policy frontend must be a boolean.");
  }
  return {
    repositoryType: identifier(record.repositoryType, "Repository policy repositoryType"),
    languages,
    documentationRoots,
    packageManager: decodePackageManager(record.packageManager),
    layout,
    frontend: record.frontend,
  };
}

function decodePackageManager(value: unknown): PackageManagerDeclaration {
  const stateRecord = strictRecord(value, "Repository policy package manager", [
    "state",
    "name",
    "version",
  ]);
  if (stateRecord.state === "none") {
    strictRecord(value, "Repository policy absent package manager", ["state"]);
    return { state: "none" };
  }
  if (stateRecord.state !== "declared") {
    throw new Error("Repository policy package manager state must be none or declared.");
  }
  const version = stateRecord.version;
  if (version !== null && (typeof version !== "string" || version.length === 0)) {
    throw new Error("Repository policy package manager version must be a string or null.");
  }
  return {
    state: "declared",
    name: identifier(stateRecord.name, "Repository policy package manager name"),
    version,
  };
}

function decodePolicyCommand(value: unknown): PolicyCommand {
  const stateRecord = strictRecord(value, "Repository policy command", [
    "id",
    "kind",
    "executable",
    "script",
    "arguments",
    "timeoutMs",
  ]);
  const timeoutMs = stateRecord.timeoutMs;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error(
      "Repository policy command timeoutMs must be within Node's 1..2147483647 timer range.",
    );
  }
  const id = identifier(stateRecord.id, "Repository policy command id");
  const arguments_ = stringArray(stateRecord.arguments, "Repository policy command arguments").map(
    (argument) => commandToken(argument, "Repository policy command argument"),
  );
  if (stateRecord.kind === "process") {
    const record = strictRecord(value, "Process repository policy command", [
      "id",
      "kind",
      "executable",
      "arguments",
      "timeoutMs",
    ]);
    return {
      id,
      kind: "process",
      executable: commandToken(record.executable, "Repository policy command executable"),
      arguments: arguments_,
      timeoutMs,
    };
  }
  if (stateRecord.kind === "package-script") {
    const record = strictRecord(value, "Package-script repository policy command", [
      "id",
      "kind",
      "script",
      "arguments",
      "timeoutMs",
    ]);
    return {
      id,
      kind: "package-script",
      script: packageScriptName(record.script),
      arguments: arguments_,
      timeoutMs,
    };
  }
  throw new Error("Repository policy command kind must be process or package-script.");
}

function decodeVerificationProfile(value: unknown): VerificationProfile {
  const record = strictRecord(value, "Repository policy verification profile", [
    "id",
    "commands",
  ]);
  const commands = stringArray(
    record.commands,
    "Repository policy verification profile commands",
  ).map((command) => identifier(command, "Repository policy profile command"));
  requireUnique(commands, "Repository policy profile commands");
  return {
    id: identifier(record.id, "Repository policy profile id"),
    commands,
  };
}

async function checkContextInstallation(root: string): Promise<void> {
  const contextConfig = decodeContextProjectConfig(
    await readJson(
      repositoryPath(root, ".agent-context/config.json"),
      "Context project configuration",
    ),
  );
  const contextLock = decodeContextInstallationLock(
    await readJson(
      repositoryPath(root, ".agent-context/lock.json"),
      "Context installation lock",
    ),
  );
  if (!contextConfig.components.includes("repository-policy")) {
    throw new Error("Context project configuration does not select repository-policy.");
  }
  const missing = contextConfig.components.find(
    (component) => !contextLock.components.includes(component),
  );
  if (missing !== undefined) {
    throw new Error(`Context installation lock does not resolve selected component ${missing}.`);
  }
  if (!contextLock.components.includes("repository-policy")) {
    throw new Error("Context installation lock does not contain repository-policy.");
  }
}

async function runPolicyCommand(
  root: string,
  command: PolicyCommand,
  packageManager: PackageManagerDeclaration,
): Promise<PolicyCommandOutcome> {
  const started = performance.now();
  const invocation = command.kind === "process"
    ? { executable: command.executable, arguments: command.arguments }
    : packageScriptInvocation(command, packageManager);
  return await new Promise<PolicyCommandOutcome>((resolve) => {
    const child = spawn(invocation.executable, invocation.arguments, {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.pipe(process.stderr, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    let completed = false;
    const finish = (outcome: PolicyCommandOutcome): void => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        id: command.id,
        status: "timed-out",
        exitCode: null,
        durationMs: Math.round(performance.now() - started),
        detail: `Command exceeded ${command.timeoutMs}ms.`,
      });
    }, command.timeoutMs);
    child.on("error", (error) => {
      finish({
        id: command.id,
        status: "failed",
        exitCode: 1,
        durationMs: Math.round(performance.now() - started),
        detail: error.message,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({
          id: command.id,
          status: "passed",
          exitCode: 0,
          durationMs: Math.round(performance.now() - started),
        });
      } else {
        finish({
          id: command.id,
          status: "failed",
          exitCode: code ?? 1,
          durationMs: Math.round(performance.now() - started),
          detail: `Command exited with code ${code ?? 1}.`,
        });
      }
    });
  });
}

function packageScriptInvocation(
  command: PackageScriptPolicyCommand,
  packageManager: PackageManagerDeclaration,
): { readonly executable: string; readonly arguments: readonly string[] } {
  if (packageManager.state !== "declared" || packageManager.version === null) {
    throw new Error("Package-script policy command requires a versioned package manager.");
  }
  if (packageManager.name !== "pnpm" && packageManager.name !== "yarn") {
    throw new Error(
      `Package-script policy command does not support package manager ${packageManager.name}.`,
    );
  }
  const corepackArguments = [
    `${packageManager.name}@${packageManager.version}`,
    "run",
    command.script,
    ...command.arguments,
  ];
  if (process.platform !== "win32") {
    return { executable: "corepack", arguments: corepackArguments };
  }
  if (corepackArguments.some((argument) => !/^[A-Za-z0-9@./_:-]+$/u.test(argument))) {
    throw new Error("Package-script policy command contains an unsafe Windows token.");
  }
  return {
    executable: process.env.ComSpec ?? "cmd.exe",
    arguments: ["/d", "/s", "/c", ["corepack", ...corepackArguments].join(" ")],
  };
}

async function presentRootFiles(root: string, candidates: readonly string[]): Promise<readonly string[]> {
  const present: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(root, candidate))) present.push(candidate);
  }
  return present;
}

async function firstMissingPath(root: string, candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!(await pathExists(repositoryPath(root, candidate)))) return candidate;
  }
  return null;
}

async function readJson(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(candidate, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} must contain valid JSON.`, { cause: error });
  }
}

function repositoryPath(root: string, candidate: string): string {
  const relative = portableRelativePath(candidate, "Repository policy path");
  return path.join(root, ...relative.split("/"));
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${label} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function commandToken(value: unknown, label: string): string {
  const token = typeof value === "string" ? value : "";
  if (token.length === 0 || token.includes("\0") || token.includes("\n") || token.includes("\r")) {
    throw new Error(`${label} must be one non-empty process argument token.`);
  }
  return token;
}

function packageScriptName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/u.test(value)) {
    throw new Error("Repository policy package script name is invalid.");
  }
  return value;
}

function requireSchemaVersion(value: unknown, label: string): void {
  if (value !== REPOSITORY_POLICY_SCHEMA_VERSION) {
    throw new Error(`${label} schemaVersion must be ${REPOSITORY_POLICY_SCHEMA_VERSION}.`);
  }
}

function decodeArray<T>(value: unknown, label: string, decode: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}

function requireUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} contains duplicate ${duplicate}.`);
}
