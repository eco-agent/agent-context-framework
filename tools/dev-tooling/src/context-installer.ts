import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  artifactIdentity,
  CONTEXT_ADAPTER,
  CONTEXT_INSTALLATION_SCHEMA_VERSION,
  decodeContextInstallationLock,
  decodeContextProjectConfig,
  decodeContextRegistry,
  resolveContextComponents,
  type ContextCapability,
  type ContextInstallationLockV2,
  type ContextLicense,
  type ContextLockedArtifact,
  type ContextProjectConfigV2,
  type ContextRegistryArtifact,
  type ContextRegistryComponent,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";
import { createTwoFilesPatch } from "diff";

import {
  createArtifactProjection,
  createArtifactRemovalProjection,
  type ArtifactProjection,
  type ProjectedScope,
} from "./context-artifact-projection.js";
import {
  applyContextTransaction,
  inspectContextTransaction,
  resumeContextTransaction,
  type ContextMutation,
  type ContextTransactionInspection,
} from "./context-transaction.js";
import { exists } from "./workspace.js";
import {
  bootstrapRuntime,
  type RuntimeBootstrapStatus,
} from "./runtime-bootstrap.js";
import {
  codexInterfaceSelectionDisclosures,
  inspectInstalledCodexInterface,
  type ContextActivationDisclosure,
  type CodexInterfaceHealth,
} from "./codex-interface.js";

export const CONTEXT_CONFIG_PATH = ".agent-context/config.json";
export const CONTEXT_LOCK_PATH = ".agent-context/lock.json";
export const CONTEXT_REGISTRY_PATH = "registry/registry.json";
export const DEFAULT_CONTEXT_COMPONENT = "core";

export type ContextSourceOverrides = ReadonlyMap<string, string>;

const NO_SOURCE_OVERRIDES: ContextSourceOverrides = new Map();

export type ContextUpdateMode = "preserve-local" | "overwrite-selected";

export type ArtifactAssessmentStatus =
  | "uninstalled"
  | "unchanged"
  | "locally-modified"
  | "upstream-changed"
  | "diverged"
  | "untracked-conflict"
  | "obsolete-unchanged"
  | "obsolete-modified";

const ARTIFACT_ASSESSMENT_STATUSES: readonly ArtifactAssessmentStatus[] = [
  "uninstalled",
  "unchanged",
  "locally-modified",
  "upstream-changed",
  "diverged",
  "untracked-conflict",
  "obsolete-unchanged",
  "obsolete-modified",
];

export interface ArtifactAssessment {
  readonly identity: string;
  readonly component: string;
  readonly targetPath: string;
  readonly operation: ContextRegistryArtifact["operation"];
  readonly status: ArtifactAssessmentStatus;
  readonly previousSourceSha256: string | null;
  readonly currentSha256: string | null;
  readonly nextSourceSha256: string | null;
  readonly difference: string | null;
  readonly detail: string;
}

export interface ReadyInstallationPlan {
  readonly status: "ready";
  readonly assessments: readonly ArtifactAssessment[];
  readonly mutations: readonly ContextMutation[];
  readonly nextLock: ContextInstallationLockV2;
  readonly lockChanged: boolean;
}

export interface BlockedInstallationPlan {
  readonly status: "blocked";
  readonly assessments: readonly ArtifactAssessment[];
  readonly conflicts: readonly ArtifactAssessment[];
}

export type ContextInstallationPlan = ReadyInstallationPlan | BlockedInstallationPlan;

export interface ContextOperationResult {
  readonly command: "init" | "add" | "update" | "remove";
  readonly projectRoot: string;
  readonly plan: ContextInstallationPlan;
  readonly writtenPaths: readonly string[];
}

export interface ContextDiffResult {
  readonly command: "diff";
  readonly projectRoot: string;
  readonly plan: ContextInstallationPlan;
  readonly current: boolean;
}

export type ContextSelectionStatus = "current" | "changes-ready" | "blocked";

export interface ContextAssessmentCount {
  readonly status: ArtifactAssessmentStatus;
  readonly count: number;
}

export interface ContextSelectionFootprint {
  readonly componentCount: number;
  readonly directComponentCount: number;
  readonly transitiveComponentCount: number;
  readonly bundleCount: number;
  readonly artifactCount: number;
  readonly targetCount: number;
  readonly skillTargetCount: number;
  readonly runtimeTargetCount: number;
}

export interface ContextSelectionDrift {
  readonly assessmentCounts: readonly ContextAssessmentCount[];
  readonly conflicts: readonly ArtifactAssessment[];
  readonly plannedWritePaths: readonly string[];
  readonly configChangeRequired: boolean;
  readonly lockChangeRequired: boolean;
}

export interface ContextSelectionPreview {
  readonly command: "plan";
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly registryRevision: string;
  readonly status: ContextSelectionStatus;
  readonly currentDirectComponents: readonly string[];
  readonly requestedComponents: readonly string[];
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly string[];
  readonly transitiveComponents: readonly string[];
  readonly bundleComponents: readonly string[];
  readonly footprint: ContextSelectionFootprint;
  readonly capabilities: readonly ContextCapability[];
  readonly capabilityAvailability: "not-inspected";
  readonly licenses: readonly ContextLicense[];
  readonly trustRequired: boolean;
  readonly activations: readonly ContextActivationDisclosure[];
  readonly drift: ContextSelectionDrift;
}

export interface ContextInspection {
  readonly command: "inspect";
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly hasAgents: boolean;
  readonly hasCodexConfig: boolean;
  readonly hasCodexHooks: boolean;
  readonly registryRevision: string;
  readonly selection: ContextSelectionPreview;
}

export interface ContextDoctorResult {
  readonly command: "doctor";
  readonly projectRoot: string;
  readonly health: "healthy" | "attention";
  readonly diagnostics: readonly string[];
  readonly capabilities: readonly ContextCapability[];
  readonly licenses: readonly ContextLicense[];
  readonly diff: ContextDiffResult | null;
  readonly transaction: ContextTransactionInspection;
  readonly runtime: ContextRuntimeHealth | null;
  readonly repositoryPolicy: ContextRepositoryPolicyHealth | null;
  readonly codexInterface: CodexInterfaceHealth | null;
}

export interface ContextRuntimeHealth {
  readonly status: RuntimeBootstrapStatus;
  readonly operational: boolean;
  readonly message: string;
}

export interface ContextRepositoryPolicyHealth {
  readonly status: "configuration-required" | "ready" | "invalid";
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export interface ContextRecoveryResult {
  readonly command: "recover";
  readonly projectRoot: string;
  readonly status: "none" | "discarded" | "resumed";
  readonly recoveredPaths: readonly string[];
}

type PlanningIntent =
  | { readonly kind: "observe" }
  | { readonly kind: "install" }
  | {
      readonly kind: "update";
      readonly mode: ContextUpdateMode;
      readonly components: ReadonlySet<string>;
    }
  | { readonly kind: "remove" };

interface DesiredArtifact {
  readonly component: string;
  readonly artifact: ContextRegistryArtifact;
  readonly source: string;
  readonly projection: ArtifactProjection;
}

export async function initProject(
  projectRoot: string,
  frameworkRoot: string,
  sourceOverrides: ContextSourceOverrides = NO_SOURCE_OVERRIDES,
): Promise<ContextOperationResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const existingConfig = await readOptionalConfig(resolvedProjectRoot);
  const config = existingConfig ?? createContextProjectConfig([DEFAULT_CONTEXT_COMPONENT]);
  return await applyDesiredState(
    "init",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    existingConfig === null,
    { kind: "install" },
    undefined,
    sourceOverrides,
  );
}

export async function addComponent(
  projectRoot: string,
  frameworkRoot: string,
  componentName: string,
  sourceOverrides: ContextSourceOverrides = NO_SOURCE_OVERRIDES,
): Promise<ContextOperationResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const currentConfig = await requireConfig(resolvedProjectRoot);
  const selected = currentConfig.components.includes(componentName)
    ? currentConfig.components
    : [...currentConfig.components, componentName];
  const config = createContextProjectConfig(selected);
  return await applyDesiredState(
    "add",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    selected !== currentConfig.components,
    { kind: "install" },
    undefined,
    sourceOverrides,
  );
}

export async function updateProject(
  projectRoot: string,
  frameworkRoot: string,
  componentName: string | null,
  mode: ContextUpdateMode,
): Promise<ContextOperationResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const config = await requireConfig(resolvedProjectRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  const resolved = componentName === null
    ? resolveContextComponents(registry, config.components)
    : resolveSelectedUpdate(registry, config, componentName);
  return await applyDesiredState(
    "update",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    false,
    { kind: "update", mode, components: new Set(resolved.map((component) => component.name)) },
    registry,
  );
}

export async function removeComponent(
  projectRoot: string,
  frameworkRoot: string,
  componentName: string,
): Promise<ContextOperationResult> {
  if (componentName === DEFAULT_CONTEXT_COMPONENT) {
    throw new Error("The core component cannot be removed from an initialized project.");
  }
  const resolvedProjectRoot = await realpath(projectRoot);
  const currentConfig = await requireConfig(resolvedProjectRoot);
  if (!currentConfig.components.includes(componentName)) {
    throw new Error(`Context component ${componentName} is not selected by the project.`);
  }
  const config = createContextProjectConfig(
    currentConfig.components.filter((component) => component !== componentName),
  );
  return await applyDesiredState(
    "remove",
    resolvedProjectRoot,
    frameworkRoot,
    config,
    true,
    { kind: "remove" },
  );
}

export async function diffProject(
  projectRoot: string,
  frameworkRoot: string,
): Promise<ContextDiffResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const config = await requireConfig(resolvedProjectRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  const previousLock = await readOptionalLock(resolvedProjectRoot);
  const plan = await planContextInstallation(
    resolvedProjectRoot,
    frameworkRoot,
    registry,
    config,
    previousLock,
    { kind: "observe" },
  );
  const current = plan.status === "ready" &&
    plan.assessments.every((assessment) => assessment.status === "unchanged") &&
    !plan.lockChanged;
  return { command: "diff", projectRoot: resolvedProjectRoot, plan, current };
}

export async function planProjectSelection(
  projectRoot: string,
  frameworkRoot: string,
  requestedComponents: readonly string[],
  sourceOverrides: ContextSourceOverrides = NO_SOURCE_OVERRIDES,
): Promise<ContextSelectionPreview> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  requireKnownUniqueComponents(registry, requestedComponents);
  const existingConfig = await readOptionalConfig(resolvedProjectRoot);
  const previousLock = await readOptionalLock(resolvedProjectRoot);
  const currentDirectComponents = existingConfig?.components ?? [];
  const directComponents = existingConfig === null
    ? uniqueInOrder([DEFAULT_CONTEXT_COMPONENT, ...requestedComponents])
    : uniqueInOrder([...currentDirectComponents, ...requestedComponents]);
  const config = createContextProjectConfig(directComponents);
  const configChangeRequired = existingConfig === null ||
    !sameOrderedValues(existingConfig.components, directComponents);
  const plan = await planContextInstallation(
    resolvedProjectRoot,
    frameworkRoot,
    registry,
    config,
    previousLock,
    configChangeRequired ? { kind: "install" } : { kind: "observe" },
    sourceOverrides,
  );
  const components = resolveContextComponents(registry, directComponents);
  const resolvedComponents = components.map((component) => component.name);
  const directSet = new Set(directComponents);
  const targetPaths = new Set(
    components.flatMap((component) => component.artifacts.map((artifact) => artifact.targetPath)),
  );
  const activations = codexInterfaceSelectionDisclosures(resolvedComponents);
  const lockChangeRequired = plan.status === "ready" && plan.lockChanged;
  const plannedWritePaths = plan.status === "ready"
    ? uniqueInOrder([
        ...plan.mutations.map((mutation) => mutation.targetPath),
        ...(configChangeRequired ? [CONTEXT_CONFIG_PATH] : []),
        ...(lockChangeRequired ? [CONTEXT_LOCK_PATH] : []),
      ])
    : [];
  const current = plan.status === "ready" &&
    plan.assessments.every((assessment) => assessment.status === "unchanged") &&
    plannedWritePaths.length === 0;
  return {
    command: "plan",
    projectRoot: resolvedProjectRoot,
    initialized: existingConfig !== null,
    registryRevision: registry.revision,
    status: plan.status === "blocked" ? "blocked" : current ? "current" : "changes-ready",
    currentDirectComponents,
    requestedComponents: [...requestedComponents],
    directComponents,
    resolvedComponents,
    transitiveComponents: resolvedComponents.filter((component) => !directSet.has(component)),
    bundleComponents: components
      .filter((component) => component.dependencies.length > 0 && component.artifacts.length === 0)
      .map((component) => component.name),
    footprint: {
      componentCount: components.length,
      directComponentCount: directComponents.length,
      transitiveComponentCount: resolvedComponents.length - directComponents.length,
      bundleCount: components.filter((component) =>
        component.dependencies.length > 0 && component.artifacts.length === 0).length,
      artifactCount: components.reduce((count, component) => count + component.artifacts.length, 0),
      targetCount: targetPaths.size,
      skillTargetCount: [...targetPaths].filter((target) => target.startsWith(".codex/skills/")).length,
      runtimeTargetCount: [...targetPaths].filter((target) =>
        target.startsWith(".codex/acf/runtime-source/")).length,
    },
    capabilities: uniqueCapabilities(components),
    capabilityAvailability: "not-inspected",
    licenses: uniqueLicenses(components),
    trustRequired: activations.some((activation) => activation.id === "codex-project-trust"),
    activations,
    drift: {
      assessmentCounts: assessmentCounts(plan.assessments),
      conflicts: plan.status === "blocked" ? plan.conflicts : [],
      plannedWritePaths,
      configChangeRequired,
      lockChangeRequired,
    },
  };
}

export async function inspectProject(
  projectRoot: string,
  frameworkRoot: string,
): Promise<ContextInspection> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const selection = await planProjectSelection(resolvedProjectRoot, frameworkRoot, []);
  return {
    command: "inspect",
    projectRoot: resolvedProjectRoot,
    initialized: selection.initialized,
    hasAgents: await exists(path.join(resolvedProjectRoot, "AGENTS.md")),
    hasCodexConfig: await exists(path.join(resolvedProjectRoot, ".codex", "config.toml")),
    hasCodexHooks: await exists(path.join(resolvedProjectRoot, ".codex", "hooks.json")),
    registryRevision: selection.registryRevision,
    selection,
  };
}

export async function doctorProject(
  projectRoot: string,
  frameworkRoot: string,
): Promise<ContextDoctorResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const diagnostics: string[] = [];
  const transaction = await inspectContextTransaction(resolvedProjectRoot);
  if (transaction.status === "discardable") {
    diagnostics.push(
      "Incomplete transaction staging is safely discardable because no journal was published; " +
      "run agent-context recover before writing.",
    );
  } else if (transaction.status === "resumable" && transaction.journal) {
    diagnostics.push(
      `Incomplete ${transaction.journal.command} transaction for registry ${transaction.journal.registryRevision} ` +
      `is safely resumable (${transaction.detail}); run agent-context recover before writing.`,
    );
  } else if (transaction.status === "blocked" && transaction.journal) {
    diagnostics.push(
      `Incomplete ${transaction.journal.command} transaction for registry ${transaction.journal.registryRevision} ` +
      `cannot be resumed safely: ${transaction.detail}`,
    );
  }
  const config = await readOptionalConfig(resolvedProjectRoot);
  if (!config) {
    diagnostics.push(`Project is not initialized: ${CONTEXT_CONFIG_PATH} is missing.`);
    return {
      command: "doctor",
      projectRoot: resolvedProjectRoot,
      health: "attention",
      diagnostics,
      capabilities: [],
      licenses: [],
      diff: null,
      transaction,
      runtime: null,
      repositoryPolicy: null,
      codexInterface: null,
    };
  }
  const registry = await loadContextRegistry(frameworkRoot);
  const components = resolveContextComponents(registry, config.components);
  const capabilities = uniqueCapabilities(components);
  const licenses = uniqueLicenses(components);
  for (const capability of capabilities) {
    diagnostics.push(
      `${capability.requirement} ${capability.kind} capability declared: ${capability.name}; ` +
      "availability is project-controlled and is not inferred by the installer.",
    );
  }
  for (const license of licenses) {
    diagnostics.push(
      license.kind === "project"
        ? `project license declared: ${license.spdx}; ${license.sourcePath} installs as ` +
          `${license.noticePath} (${license.noticeSha256}).`
        : `third-party license declared: ${license.spdx} from ${license.source}@${license.revision}; ` +
          `notice ${license.noticePath} (${license.noticeSha256}).`,
    );
  }
  let runtime: ContextRuntimeHealth | null = null;
  let repositoryPolicy: ContextRepositoryPolicyHealth | null = null;
  const codexInterface = await inspectInstalledCodexInterface(
    resolvedProjectRoot,
    components.map((component) => component.name),
  );
  if (codexInterface) diagnostics.push(...codexInterface.diagnostics);
  if (components.some((component) => component.name === "runtime-base")) {
    try {
      const result = await bootstrapRuntime({
        projectRoot: resolvedProjectRoot,
        mode: "no-install",
      });
      runtime = {
        status: result.status,
        operational: result.operational,
        message: result.message,
      };
      if (!runtime.operational) diagnostics.push(runtime.message);
    } catch (error) {
      runtime = {
        status: "invalid",
        operational: false,
        message: error instanceof Error ? error.message : String(error),
      };
      diagnostics.push(`Runtime doctor failed: ${runtime.message}`);
    }
  }
  if (components.some((component) => component.name === "repository-policy")) {
    if (runtime?.operational === true) {
      repositoryPolicy = await inspectInstalledRepositoryPolicy(resolvedProjectRoot);
      if (!repositoryPolicy.ok) diagnostics.push(...repositoryPolicy.diagnostics);
    } else {
      diagnostics.push("Repository policy doctor requires an operational isolated runtime.");
    }
  }
  const diff = await diffProject(resolvedProjectRoot, frameworkRoot);
  if (!diff.current) {
    diagnostics.push("Installed context differs from its provenance baseline.");
  }
  const healthy = transaction.status === "none" &&
    diff.current &&
    (runtime === null || runtime.operational) &&
    (repositoryPolicy === null || repositoryPolicy.ok) &&
    (codexInterface === null || codexInterface.ok);
  return {
    command: "doctor",
    projectRoot: resolvedProjectRoot,
    health: healthy ? "healthy" : "attention",
    diagnostics,
    capabilities,
    licenses,
    diff,
    transaction,
    runtime,
    repositoryPolicy,
    codexInterface,
  };
}

async function inspectInstalledRepositoryPolicy(
  projectRoot: string,
): Promise<ContextRepositoryPolicyHealth> {
  const cliPath = path.join(
    projectRoot,
    ".codex",
    "acf",
    "policy.mjs",
  );
  const output = await executeCompactJson(process.execPath, [
    cliPath,
    "doctor",
    "--root",
    projectRoot,
  ], projectRoot);
  if (!isRecord(output)) {
    return { status: "invalid", ok: false, diagnostics: ["Repository policy doctor returned a non-object result."] };
  }
  if (
    output.status !== "configuration-required" &&
    output.status !== "ready" &&
    output.status !== "invalid"
  ) {
    return { status: "invalid", ok: false, diagnostics: ["Repository policy doctor returned an unknown status."] };
  }
  const diagnostics = output.diagnostics;
  if (
    typeof output.ok !== "boolean" ||
    !Array.isArray(diagnostics) ||
    diagnostics.some((diagnostic) => typeof diagnostic !== "string") ||
    output.ok !== (output.status === "ready")
  ) {
    return { status: "invalid", ok: false, diagnostics: ["Repository policy doctor returned an inconsistent result."] };
  }
  return { status: output.status, ok: output.ok, diagnostics };
}

async function executeCompactJson(
  executable: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<unknown> {
  const maximumBytes = 1_000_000;
  return await new Promise<unknown>((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let exceeded = false;
    const collect = (target: Buffer[]) => (chunk: Buffer): void => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        exceeded = true;
        child.kill();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", reject);
    child.on("close", () => {
      if (exceeded) {
        reject(new Error(`Repository policy doctor exceeded ${maximumBytes} output bytes.`));
        return;
      }
      const source = Buffer.concat(stdout).toString("utf8");
      try {
        resolve(JSON.parse(source) as unknown);
      } catch (error) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`Repository policy doctor returned invalid JSON${detail ? `: ${detail}` : "."}`, { cause: error }));
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function recoverProject(projectRoot: string): Promise<ContextRecoveryResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const recovery = await resumeContextTransaction(resolvedProjectRoot);
  return { command: "recover", projectRoot: resolvedProjectRoot, ...recovery };
}

export async function loadContextRegistry(frameworkRoot: string): Promise<ContextRegistryV2> {
  const resolvedFrameworkRoot = await realpath(frameworkRoot);
  const registryPath = await securePath(
    resolvedFrameworkRoot,
    CONTEXT_REGISTRY_PATH,
    "Registry catalog",
  );
  const registry = decodeContextRegistry(await readStrictJson(registryPath, "Context registry"));
  const decisionPath = await securePath(
    resolvedFrameworkRoot,
    registry.decisionPath,
    "Registry decision",
  );
  if (!(await exists(decisionPath))) throw new Error(`Registry decision is missing: ${registry.decisionPath}.`);
  return registry;
}

export async function planContextInstallation(
  projectRoot: string,
  frameworkRoot: string,
  registry: ContextRegistryV2,
  config: ContextProjectConfigV2,
  previousLock: ContextInstallationLockV2 | null,
  intent: PlanningIntent,
  sourceOverrides: ContextSourceOverrides = NO_SOURCE_OVERRIDES,
): Promise<ContextInstallationPlan> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const resolvedFrameworkRoot = await realpath(frameworkRoot);
  const components = resolveContextComponents(registry, config.components);
  const desiredArtifacts = await loadDesiredArtifacts(
    resolvedFrameworkRoot,
    components,
    sourceOverrides,
  );
  validateTargetOwnership(desiredArtifacts.map((desired) => desired.artifact));

  const lockedByIdentity = new Map(
    (previousLock?.artifacts ?? []).map((artifact) => [artifactIdentity(artifact), artifact]),
  );
  const desiredIdentities = new Set(desiredArtifacts.map(({ artifact }) => artifactIdentity(artifact)));
  const installingRuntimeWorkspaceIds = intent.kind === "install"
    ? new Set(desiredArtifacts
        .filter(({ artifact }) =>
          artifact.operation === "runtime-workspace" &&
          !lockedByIdentity.has(artifactIdentity(artifact)))
        .map(({ artifact }) => artifact.operation === "runtime-workspace" ? artifact.workspaceId : ""))
    : new Set<string>();
  const assessments: ArtifactAssessment[] = [];
  const nextLockedByIdentity = new Map<string, ContextLockedArtifact>();
  const virtualTargets = new Map<string, string | null>();
  const originalTargets = new Map<string, string | null>();

  for (const desired of desiredArtifacts) {
    const identity = artifactIdentity(desired.artifact);
    const target = await readVirtualTarget(
      resolvedProjectRoot,
      desired.artifact.targetPath,
      virtualTargets,
      originalTargets,
    );
    const locked = lockedByIdentity.get(identity);
    const current = desired.projection.read(target);
    const assessment = assessDesired(desired, locked, current);
    assessments.push(assessment);

    if (desired.artifact.operation === "seed-file" && current.state === "present") {
      nextLockedByIdentity.set(identity, {
        ...desired.artifact,
        component: desired.component,
        installedSha256: current.sha256,
      });
      continue;
    }

    const shouldUpdate = intent.kind === "update" && intent.components.has(desired.component);
    const shouldOverwrite = intent.kind === "update" &&
      intent.mode === "overwrite-selected" &&
      intent.components.has(desired.component);
    const shouldRefreshRuntimeWorkspace = intent.kind === "install" &&
      desired.artifact.operation === "runtime-workspace" &&
      installingRuntimeWorkspaceIds.has(desired.artifact.workspaceId);
    if (assessment.status === "uninstalled" && (intent.kind === "install" || shouldUpdate)) {
      virtualTargets.set(desired.artifact.targetPath, desired.projection.install(target));
      nextLockedByIdentity.set(identity, lockedArtifact(desired));
    } else if (
      assessment.status === "upstream-changed" &&
      (shouldUpdate || shouldRefreshRuntimeWorkspace) &&
      target !== null
    ) {
      virtualTargets.set(desired.artifact.targetPath, desired.projection.replace(target));
      nextLockedByIdentity.set(identity, lockedArtifact(desired));
    } else if (
      shouldOverwrite &&
      (assessment.status === "locally-modified" || assessment.status === "diverged")
    ) {
      virtualTargets.set(
        desired.artifact.targetPath,
        target === null ? desired.projection.install(target) : desired.projection.replace(target),
      );
      nextLockedByIdentity.set(identity, lockedArtifact(desired));
    } else if (locked) {
      nextLockedByIdentity.set(identity, locked);
    } else if (assessment.status === "unchanged") {
      nextLockedByIdentity.set(identity, lockedArtifact(desired));
    }
  }

  for (const desired of desiredArtifacts) {
    if (desired.artifact.operation !== "seed-file") continue;
    const target = await readVirtualTarget(
      resolvedProjectRoot,
      desired.artifact.targetPath,
      virtualTargets,
      originalTargets,
    );
    const installed = desired.projection.read(target);
    if (installed.state !== "present") continue;
    nextLockedByIdentity.set(artifactIdentity(desired.artifact), {
      ...desired.artifact,
      component: desired.component,
      installedSha256: installed.sha256,
    });
  }

  for (const locked of previousLock?.artifacts ?? []) {
    const identity = artifactIdentity(locked);
    if (desiredIdentities.has(identity)) continue;
    const target = await readVirtualTarget(
      resolvedProjectRoot,
      locked.targetPath,
      virtualTargets,
      originalTargets,
    );
    const projection = projectionForLocked(locked);
    const current = projection.read(target);
    const unchanged = current.state === "absent" ||
      (current.state === "present" && current.sha256 === locked.installedSha256);
    const assessment: ArtifactAssessment = {
      identity,
      component: locked.component,
      targetPath: locked.targetPath,
      operation: locked.operation,
      status: unchanged ? "obsolete-unchanged" : "obsolete-modified",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.state === "present" ? current.sha256 : null,
      nextSourceSha256: null,
      difference: null,
      detail: unchanged
        ? "The previous source is no longer selected and can be removed safely."
        : "The previous source is no longer selected; project content will be retained.",
    };
    assessments.push(assessment);
    if (intent.kind === "remove" || intent.kind === "update") {
      if (target !== null) {
        if (current.state === "malformed") {
          nextLockedByIdentity.set(identity, locked);
        } else {
          const preserveLocal = !unchanged && !(
            intent.kind === "update" &&
            intent.mode === "overwrite-selected" &&
            intent.components.has(locked.component)
          );
          virtualTargets.set(locked.targetPath, projection.remove(target, preserveLocal));
        }
      }
    } else {
      nextLockedByIdentity.set(identity, locked);
    }
  }

  const conflicts = assessments.filter((assessment) => isBlockingAssessment(assessment, intent));
  if (conflicts.length > 0) return { status: "blocked", assessments, conflicts };

  const mutations = mutationsFromTargets(virtualTargets, originalTargets);
  const orderedLocks: ContextLockedArtifact[] = [];
  for (const desired of desiredArtifacts) {
    const locked = nextLockedByIdentity.get(artifactIdentity(desired.artifact));
    if (locked) orderedLocks.push(locked);
  }
  for (const locked of previousLock?.artifacts ?? []) {
    if (!desiredIdentities.has(artifactIdentity(locked))) {
      const retained = nextLockedByIdentity.get(artifactIdentity(locked));
      if (retained) orderedLocks.push(retained);
    }
  }
  const nextLock: ContextInstallationLockV2 = {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    registryRevision: registry.revision,
    components: components.map((component) => component.name),
    artifacts: orderedLocks,
  };
  return {
    status: "ready",
    assessments,
    mutations,
    nextLock,
    lockChanged: serializeJson(previousLock) !== serializeJson(nextLock),
  };
}

export function createContextProjectConfig(
  components: readonly string[],
): ContextProjectConfigV2 {
  return decodeContextProjectConfig({
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    adapter: CONTEXT_ADAPTER,
    components,
  });
}

async function applyDesiredState(
  command: ContextOperationResult["command"],
  projectRoot: string,
  frameworkRoot: string,
  config: ContextProjectConfigV2,
  configChanged: boolean,
  intent: PlanningIntent,
  loadedRegistry?: ContextRegistryV2,
  sourceOverrides: ContextSourceOverrides = NO_SOURCE_OVERRIDES,
): Promise<ContextOperationResult> {
  if ((await inspectContextTransaction(projectRoot)).status !== "none") {
    throw new Error("An incomplete context transaction exists. Run agent-context doctor before writing.");
  }
  const registry = loadedRegistry ?? await loadContextRegistry(frameworkRoot);
  const previousLock = await readOptionalLock(projectRoot);
  const plan = await planContextInstallation(
    projectRoot,
    frameworkRoot,
    registry,
    config,
    previousLock,
    intent,
    sourceOverrides,
  );
  if (plan.status === "blocked") {
    return { command, projectRoot, plan, writtenPaths: [] };
  }
  const mutations: ContextMutation[] = [...plan.mutations];
  if (configChanged) {
    mutations.push({ operation: "write", targetPath: CONTEXT_CONFIG_PATH, content: serializeJson(config) });
  }
  if (plan.lockChanged) {
    mutations.push({ operation: "write", targetPath: CONTEXT_LOCK_PATH, content: serializeJson(plan.nextLock) });
  }
  const writtenPaths = await applyContextTransaction(projectRoot, command, registry.revision, mutations);
  return { command, projectRoot, plan, writtenPaths };
}

function assessDesired(
  desired: DesiredArtifact,
  locked: ContextLockedArtifact | undefined,
  current: ProjectedScope,
): ArtifactAssessment {
  const identity = artifactIdentity(desired.artifact);
  const base = {
    identity,
    component: desired.component,
    targetPath: desired.artifact.targetPath,
    operation: desired.artifact.operation,
  };
  if (desired.artifact.operation === "seed-file") {
    if (!locked) {
      const absent = current.state === "absent";
      return {
        ...base,
        status: "uninstalled",
        previousSourceSha256: null,
        currentSha256: current.state === "present" ? current.sha256 : null,
        nextSourceSha256: desired.artifact.sourceSha256,
        difference: absent
          ? boundedDifference("absent", desired.artifact.targetPath, "", desired.projection.sourceDisplay)
          : null,
        detail: absent
          ? "The seed source will be written because its project-owned target is missing."
          : "An existing project target will be adopted without changing its bytes.",
      };
    }
    if (current.state === "absent") {
      return {
        ...base,
        status: "locally-modified",
        previousSourceSha256: locked.sourceSha256,
        currentSha256: null,
        nextSourceSha256: desired.artifact.sourceSha256,
        difference: null,
        detail: "The installed project-owned seed is missing.",
      };
    }
    return {
      ...base,
      status: "unchanged",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.state === "present" ? current.sha256 : null,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: null,
      detail: "The project-owned seed target is preserved; framework source changes are ignored.",
    };
  }
  if (!locked) {
    if (current.state === "absent") {
      return {
        ...base,
        status: "uninstalled",
        previousSourceSha256: null,
        currentSha256: null,
        nextSourceSha256: desired.artifact.sourceSha256,
        difference: boundedDifference("absent", desired.artifact.targetPath, "", desired.projection.sourceDisplay),
        detail: "The selected project-owned source has not been installed.",
      };
    }
    if (current.state === "present" && current.sha256 === desired.projection.sourceSha256) {
      return {
        ...base,
        status: "unchanged",
        previousSourceSha256: null,
        currentSha256: current.sha256,
        nextSourceSha256: desired.artifact.sourceSha256,
        difference: null,
        detail: "The existing target exactly matches the capsule activation projection.",
      };
    }
    return {
      ...base,
      status: "untracked-conflict",
      previousSourceSha256: null,
      currentSha256: current.state === "present" ? current.sha256 : null,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: current.state === "present"
        ? boundedDifference("project", "registry", current.display, desired.projection.sourceDisplay)
        : null,
      detail: current.state === "malformed"
        ? current.detail
        : "The target ownership scope existed before installation.",
    };
  }

  const projectMatchesPrevious = current.state === "present" && current.sha256 === locked.installedSha256;
  const legacyProjectionBaseline = locked.installedSha256 === locked.sourceSha256 &&
    desired.projection.sourceSha256 !== locked.installedSha256;
  const upstreamMatchesPrevious = desired.artifact.sourceSha256 === locked.sourceSha256 &&
    !legacyProjectionBaseline;
  const projectMatchesNext = current.state === "present" && current.sha256 === desired.projection.sourceSha256;
  if (projectMatchesPrevious && upstreamMatchesPrevious) {
    return {
      ...base,
      status: "unchanged",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.sha256,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: null,
      detail: "Project source and registry source match the provenance baseline.",
    };
  }
  if (!projectMatchesPrevious && upstreamMatchesPrevious) {
    return {
      ...base,
      status: "locally-modified",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.state === "present" ? current.sha256 : null,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: current.state === "present"
        ? boundedDifference("registry-baseline", "project", desired.projection.sourceDisplay, current.display)
        : null,
      detail: current.state === "malformed" ? current.detail : "Project-owned source differs from its baseline.",
    };
  }
  if (projectMatchesNext) {
    return {
      ...base,
      status: "upstream-changed",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.sha256,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: null,
      detail: "Project source already matches the next registry projection; only provenance needs updating.",
    };
  }
  if (projectMatchesPrevious) {
    return {
      ...base,
      status: "upstream-changed",
      previousSourceSha256: locked.sourceSha256,
      currentSha256: current.sha256,
      nextSourceSha256: desired.artifact.sourceSha256,
      difference: boundedDifference("project", "registry-next", current.display, desired.projection.sourceDisplay),
      detail: "Registry source changed while project-owned source remained at its baseline.",
    };
  }
  return {
    ...base,
    status: "diverged",
    previousSourceSha256: locked.sourceSha256,
    currentSha256: current.state === "present" ? current.sha256 : null,
    nextSourceSha256: desired.artifact.sourceSha256,
    difference: current.state === "present"
      ? boundedDifference("project", "registry-next", current.display, desired.projection.sourceDisplay)
      : null,
    detail: current.state === "malformed"
      ? current.detail
      : "Project-owned source and registry source both changed from the provenance baseline.",
  };
}

async function loadDesiredArtifacts(
  frameworkRoot: string,
  components: readonly ContextRegistryComponent[],
  sourceOverrides: ContextSourceOverrides,
): Promise<readonly DesiredArtifact[]> {
  const desired: DesiredArtifact[] = [];
  for (const component of components) {
    for (const artifact of component.artifacts) {
      const sourcePath = await securePath(
        frameworkRoot,
        artifact.sourcePath,
        `Registry source ${artifact.sourcePath}`,
      );
      const registrySource = await readStrictUtf8(sourcePath, `Registry source ${artifact.sourcePath}`);
      const rawHash = contentHash(registrySource);
      if (rawHash !== artifact.sourceSha256) {
        throw new Error(
          `Registry source hash mismatch for ${artifact.sourcePath}: expected ${artifact.sourceSha256}, got ${rawHash}.`,
        );
      }
      const source = sourceOverrides.get(artifact.sourcePath) ?? registrySource;
      desired.push({
        component: component.name,
        artifact,
        source,
        projection: createArtifactProjection(artifact, source),
      });
    }
  }
  return desired;
}

function projectionForLocked(locked: ContextLockedArtifact): ArtifactProjection {
  return createArtifactRemovalProjection(locked);
}

function lockedArtifact(desired: DesiredArtifact): ContextLockedArtifact {
  return {
    ...desired.artifact,
    component: desired.component,
    installedSha256: desired.projection.sourceSha256,
  };
}

function isBlockingAssessment(
  assessment: ArtifactAssessment,
  intent: PlanningIntent,
): boolean {
  if (intent.kind === "observe") return false;
  if (assessment.status === "untracked-conflict") {
    return intent.kind !== "remove";
  }
  if (assessment.status === "diverged") {
    return intent.kind === "update" &&
      intent.mode === "preserve-local" &&
      intent.components.has(assessment.component);
  }
  if (
    assessment.status === "obsolete-modified" &&
    assessment.currentSha256 === null &&
    (intent.kind === "remove" || intent.kind === "update")
  ) {
    return true;
  }
  return false;
}

function mutationsFromTargets(
  virtualTargets: ReadonlyMap<string, string | null>,
  originalTargets: ReadonlyMap<string, string | null>,
): readonly ContextMutation[] {
  const mutations: ContextMutation[] = [];
  for (const [targetPath, next] of virtualTargets) {
    const original = originalTargets.get(targetPath) ?? null;
    if (next === original) continue;
    mutations.push(next === null
      ? { operation: "delete", targetPath }
      : { operation: "write", targetPath, content: next });
  }
  return mutations;
}

async function readVirtualTarget(
  projectRoot: string,
  targetPath: string,
  virtualTargets: Map<string, string | null>,
  originalTargets: Map<string, string | null>,
): Promise<string | null> {
  if (virtualTargets.has(targetPath)) return virtualTargets.get(targetPath) ?? null;
  const targetAbsolutePath = await securePath(projectRoot, targetPath, `Project target ${targetPath}`);
  const target = (await exists(targetAbsolutePath))
    ? await readStrictUtf8(targetAbsolutePath, `Project target ${targetPath}`)
    : null;
  virtualTargets.set(targetPath, target);
  originalTargets.set(targetPath, target);
  return target;
}

function validateTargetOwnership(artifacts: readonly ContextRegistryArtifact[]): void {
  const byTarget = new Map<string, ContextRegistryArtifact[]>();
  for (const artifact of artifacts) {
    const current = byTarget.get(artifact.targetPath) ?? [];
    current.push(artifact);
    byTarget.set(artifact.targetPath, current);
  }
  for (const [targetPath, targetArtifacts] of byTarget) {
    const wholeFile = targetArtifacts.some((artifact) =>
      artifact.operation === "file" || artifact.operation === "runtime-workspace");
    const seedWithIncompatibleOwner = targetArtifacts.some(
      (artifact) => artifact.operation === "seed-file",
    ) && targetArtifacts.some(
      (artifact) => artifact.operation !== "seed-file" && artifact.operation !== "text-section",
    );
    if ((wholeFile || seedWithIncompatibleOwner) && targetArtifacts.length > 1) {
      throw new Error(`Whole-file target ${targetPath} cannot share ownership with another artifact.`);
    }
    if (targetArtifacts.filter((artifact) => artifact.operation === "seed-file").length > 1) {
      throw new Error(`Target ${targetPath} cannot have more than one seed-file initializer.`);
    }
    const identities = targetArtifacts.map(artifactIdentity);
    if (new Set(identities).size !== identities.length) {
      throw new Error(`Registry resolves duplicate ownership for ${targetPath}.`);
    }
    const jsonPointers = targetArtifacts.flatMap((artifact) =>
      artifact.operation === "json-members" ? artifact.ownedPointers : []);
    const jsonArrayPointers = targetArtifacts.flatMap((artifact) =>
      artifact.operation === "json-array-items"
        ? artifact.ownedItems.map((item) => item.arrayPointer)
        : artifact.operation === "json-array-values"
          ? artifact.ownedValues.map((value) => value.arrayPointer)
        : []);
    requireNoOverlappingPaths(
      [...jsonPointers, ...new Set(jsonArrayPointers)],
      `JSON target ${targetPath}`,
    );
    const jsonArrayIdentities = targetArtifacts.flatMap((artifact) =>
      artifact.operation === "json-array-items"
        ? artifact.ownedItems.map((item) =>
            `${item.arrayPointer}:${item.identityPointer}:${JSON.stringify(item.identity)}`)
        : []);
    if (new Set(jsonArrayIdentities).size !== jsonArrayIdentities.length) {
      throw new Error(`JSON target ${targetPath} contains duplicate array item ownership.`);
    }
    const jsonArrayValueIdentities = targetArtifacts.flatMap((artifact) =>
      artifact.operation === "json-array-values"
        ? artifact.ownedValues.map((value) => `${value.arrayPointer}:${JSON.stringify(value.value)}`)
        : []);
    if (new Set(jsonArrayValueIdentities).size !== jsonArrayValueIdentities.length) {
      throw new Error(`JSON target ${targetPath} contains duplicate array value ownership.`);
    }
    const tomlPaths = targetArtifacts.flatMap((artifact) => {
      if (artifact.operation === "toml-tables") return artifact.ownedTables;
      if (artifact.operation === "toml-members") return artifact.ownedMembers;
      return [];
    });
    requireNoOverlappingPaths(tomlPaths, `TOML target ${targetPath}`);
  }
}

function requireNoOverlappingPaths(paths: readonly string[], label: string): void {
  for (const [index, candidate] of paths.entries()) {
    for (const other of paths.slice(index + 1)) {
      if (
        candidate === other ||
        candidate.startsWith(`${other}.`) ||
        other.startsWith(`${candidate}.`) ||
        candidate.startsWith(`${other}/`) ||
        other.startsWith(`${candidate}/`)
      ) {
        throw new Error(`${label} contains overlapping ownership paths ${candidate} and ${other}.`);
      }
    }
  }
}

function resolveSelectedUpdate(
  registry: ContextRegistryV2,
  config: ContextProjectConfigV2,
  componentName: string,
): readonly ContextRegistryComponent[] {
  const selected = resolveContextComponents(registry, config.components);
  if (!selected.some((component) => component.name === componentName)) {
    throw new Error(`Context component ${componentName} is not selected by the project.`);
  }
  return resolveContextComponents(registry, [componentName]);
}

function uniqueCapabilities(components: readonly ContextRegistryComponent[]): readonly ContextCapability[] {
  const result = new Map<string, ContextCapability>();
  for (const component of components) {
    for (const capability of component.capabilities) {
      const key = `${capability.kind}:${capability.name}`;
      const existing = result.get(key);
      if (!existing || capability.requirement === "required") result.set(key, capability);
    }
  }
  return [...result.values()].sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`));
}

function assessmentCounts(
  assessments: readonly ArtifactAssessment[],
): readonly ContextAssessmentCount[] {
  return ARTIFACT_ASSESSMENT_STATUSES.map((status) => ({
    status,
    count: assessments.filter((assessment) => assessment.status === status).length,
  })).filter((entry) => entry.count > 0);
}

function requireKnownUniqueComponents(
  registry: ContextRegistryV2,
  requestedComponents: readonly string[],
): void {
  const duplicate = requestedComponents.find((component, index) =>
    requestedComponents.indexOf(component) !== index);
  if (duplicate !== undefined) {
    throw new Error(`Context selection contains duplicate component ${duplicate}.`);
  }
  const available = new Set(registry.components.map((component) => component.name));
  const unknown = requestedComponents.find((component) => !available.has(component));
  if (unknown !== undefined) throw new Error(`Unknown context component ${unknown}.`);
}

function uniqueInOrder(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueLicenses(components: readonly ContextRegistryComponent[]): readonly ContextLicense[] {
  const result = new Map<string, ContextLicense>();
  for (const component of components) {
    for (const license of component.licenses) {
      const key = license.kind === "project"
        ? `${license.kind}:${license.spdx}:${license.sourcePath}:${license.noticePath}:${license.noticeSha256}`
        : `${license.kind}:${license.source}:${license.revision}:${license.spdx}:${license.noticeSha256}`;
      result.set(key, license);
    }
  }
  return [...result.values()].sort((left, right) => {
    const leftKey = left.kind === "project" ? `project:${left.spdx}` : `third-party:${left.source}`;
    const rightKey = right.kind === "project" ? `project:${right.spdx}` : `third-party:${right.source}`;
    return leftKey.localeCompare(rightKey);
  });
}

function boundedDifference(
  previousLabel: string,
  nextLabel: string,
  previous: string,
  next: string,
): string {
  const difference = createTwoFilesPatch(previousLabel, nextLabel, previous, next, "", "", { context: 3 });
  const maximumLength = 16_384;
  return difference.length <= maximumLength
    ? difference
    : `${difference.slice(0, maximumLength)}\n... difference truncated at ${maximumLength} characters ...\n`;
}

async function requireConfig(projectRoot: string): Promise<ContextProjectConfigV2> {
  const config = await readOptionalConfig(projectRoot);
  if (!config) throw new Error(`Project is not initialized: ${CONTEXT_CONFIG_PATH} is missing.`);
  return config;
}

async function readOptionalConfig(projectRoot: string): Promise<ContextProjectConfigV2 | null> {
  const configPath = await securePath(projectRoot, CONTEXT_CONFIG_PATH, "Context project config");
  return (await exists(configPath))
    ? decodeContextProjectConfig(await readStrictJson(configPath, "Context project config"))
    : null;
}

async function readOptionalLock(projectRoot: string): Promise<ContextInstallationLockV2 | null> {
  const lockPath = await securePath(projectRoot, CONTEXT_LOCK_PATH, "Context installation lock");
  return (await exists(lockPath))
    ? decodeContextInstallationLock(await readStrictJson(lockPath, "Context installation lock"))
    : null;
}

async function readStrictJson(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readStrictUtf8(candidate, label)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON.`, { cause: error });
    throw error;
  }
}

async function readStrictUtf8(candidate: string, label: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must be UTF-8 without a byte-order mark.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8.`, { cause: error });
  }
}

async function securePath(root: string, relativePath: string, label: string): Promise<string> {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its repository root.`);
  }
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const state = await lstat(current);
      if (state.isSymbolicLink()) throw new Error(`${label} traverses symbolic link ${current}.`);
    } catch (error) {
      if (isMissingPathError(error)) break;
      throw error;
    }
  }
  return target;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function serializeJson(value: unknown): string {
  return value === null ? "" : `${JSON.stringify(value, null, 2)}\n`;
}
