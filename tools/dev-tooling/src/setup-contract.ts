export interface SetupCapabilitySummary {
  readonly kind: "codex-skill" | "runtime";
  readonly name: string;
  readonly requirement: "required" | "recommended";
}

export interface SetupComponentSummary {
  readonly name: string;
  readonly displayName: string;
  readonly kind: "component" | "bundle";
  readonly dependencies: readonly string[];
  readonly capabilities: readonly SetupCapabilitySummary[];
  readonly licenseCount: number;
  readonly artifactCount: number;
}

export interface SetupSnapshot {
  readonly status: "ready";
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly registryRevision: string;
  readonly installedDirectComponents: readonly string[];
  readonly installedResolvedComponents: readonly string[];
  readonly recommendedComponents: readonly string[];
  readonly components: readonly SetupComponentSummary[];
}

export type SetupArtifactOperation =
  | "file"
  | "seed-file"
  | "text-section"
  | "json-members"
  | "json-array-items"
  | "json-array-values"
  | "toml-tables"
  | "toml-members"
  | "runtime-workspace";

export interface SetupComponentReference {
  readonly name: string;
  readonly displayName: string;
}

export interface SetupComponentArtifact {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly operation: SetupArtifactOperation;
  readonly mediaType: string;
  readonly editable: boolean;
  readonly content: string;
}

export interface SetupToolArgumentSummary {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  readonly constraints: readonly string[];
}

export interface SetupToolModeSummary {
  readonly name: string;
  readonly description: string;
  readonly arguments: readonly SetupToolArgumentSummary[];
}

export interface SetupToolSummary {
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly modes: readonly SetupToolModeSummary[];
}

export interface SetupComponentDetail {
  readonly status: "ready";
  readonly name: string;
  readonly displayName: string;
  readonly kind: "component" | "bundle";
  readonly description: string;
  readonly dependencies: readonly SetupComponentReference[];
  readonly capabilities: readonly SetupCapabilitySummary[];
  readonly artifacts: readonly SetupComponentArtifact[];
  readonly tools: readonly SetupToolSummary[];
}

export interface SetupLicenseSummary {
  readonly kind: "project" | "third-party";
  readonly spdx: string;
  readonly source?: string;
  readonly revision?: string;
  readonly noticePath: string;
}

export interface SetupActivationDisclosure {
  readonly id:
    | "codex-project-trust"
    | "codex-hooks-session-binding"
    | "codex-authenticated-execution";
  readonly status: "required" | "dormant";
  readonly message: string;
}

export interface SetupFootprint {
  readonly componentCount: number;
  readonly directComponentCount: number;
  readonly transitiveComponentCount: number;
  readonly bundleCount: number;
  readonly artifactCount: number;
  readonly targetCount: number;
  readonly skillTargetCount: number;
  readonly runtimeTargetCount: number;
}

export interface SetupAssessmentCount {
  readonly status:
    | "uninstalled"
    | "unchanged"
    | "locally-modified"
    | "upstream-changed"
    | "diverged"
    | "untracked-conflict"
    | "obsolete-unchanged"
    | "obsolete-modified";
  readonly count: number;
}

export interface SetupSelectionDrift {
  readonly assessmentCounts: readonly SetupAssessmentCount[];
  readonly conflicts: readonly SetupConflict[];
  readonly plannedWritePaths: readonly string[];
  readonly configChangeRequired: boolean;
  readonly lockChangeRequired: boolean;
}

export interface SetupSelectionPreview {
  readonly command: "plan";
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly registryRevision: string;
  readonly status: "current" | "changes-ready" | "blocked";
  readonly currentDirectComponents: readonly string[];
  readonly requestedComponents: readonly string[];
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly string[];
  readonly transitiveComponents: readonly string[];
  readonly bundleComponents: readonly string[];
  readonly footprint: SetupFootprint;
  readonly capabilities: readonly SetupCapabilitySummary[];
  readonly capabilityAvailability: "not-inspected";
  readonly licenses: readonly SetupLicenseSummary[];
  readonly trustRequired: boolean;
  readonly activations: readonly SetupActivationDisclosure[];
  readonly drift: SetupSelectionDrift;
}

export interface SetupPlanCommand {
  readonly components: readonly string[];
  readonly overrides: readonly SetupSourceOverride[];
}

export interface SetupInstallCommand {
  readonly components: readonly string[];
  readonly overrides: readonly SetupSourceOverride[];
}

export interface SetupSourceOverride {
  readonly sourcePath: string;
  readonly content: string;
}

export const MAX_SETUP_OVERRIDE_FILE_BYTES = 128 * 1024;
export const MAX_SETUP_OVERRIDE_TOTAL_BYTES = 1024 * 1024;

export interface SetupConflict {
  readonly targetPath: string;
  readonly status: string;
  readonly detail: string;
}

export type SetupInstallOutcome =
  | {
      readonly status: "applied";
      readonly snapshot: SetupSnapshot;
      readonly writtenPaths: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly snapshot: SetupSnapshot;
      readonly conflicts: readonly SetupConflict[];
    };

export function parseSetupInstallCommand(
  value: unknown,
  availableComponents: ReadonlySet<string>,
): SetupInstallCommand {
  const record = requiredObject(value, "Setup install request");
  requireExactKeys(record, ["components", "overrides"], "Setup install request");
  const valueComponents = Reflect.get(record, "components");
  if (
    !Array.isArray(valueComponents) ||
    valueComponents.length === 0 ||
    valueComponents.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error("Setup install request components must be a non-empty string array.");
  }
  const components = valueComponents.filter((entry): entry is string => typeof entry === "string");
  if (new Set(components).size !== components.length) {
    throw new Error("Setup install request components must not contain duplicates.");
  }
  const unknown = components.find((component) => !availableComponents.has(component));
  if (unknown !== undefined) {
    throw new Error(`Unknown setup component ${unknown}.`);
  }
  return { components, overrides: decodeSourceOverrides(record, "Setup install request") };
}

export function parseSetupPlanCommand(
  value: unknown,
  availableComponents: ReadonlySet<string>,
): SetupPlanCommand {
  const record = requiredObject(value, "Setup plan request");
  requireExactKeys(record, ["components", "overrides"], "Setup plan request");
  const valueComponents = Reflect.get(record, "components");
  if (
    !Array.isArray(valueComponents) ||
    valueComponents.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error("Setup plan request components must be a string array.");
  }
  const components = valueComponents.filter((entry): entry is string => typeof entry === "string");
  if (new Set(components).size !== components.length) {
    throw new Error("Setup plan request components must not contain duplicates.");
  }
  const unknown = components.find((component) => !availableComponents.has(component));
  if (unknown !== undefined) {
    throw new Error(`Unknown setup component ${unknown}.`);
  }
  return { components, overrides: decodeSourceOverrides(record, "Setup plan request") };
}

export function decodeSetupSnapshot(value: unknown): SetupSnapshot {
  const record = requiredObject(value, "Setup snapshot");
  requireExactKeys(record, [
    "status", "projectRoot", "initialized", "registryRevision",
    "installedDirectComponents", "installedResolvedComponents", "recommendedComponents", "components",
  ], "Setup snapshot");
  if (requiredString(record, "status") !== "ready") {
    throw new Error("Setup snapshot status must be ready.");
  }
  return {
    status: "ready",
    projectRoot: requiredString(record, "projectRoot"),
    initialized: requiredBoolean(record, "initialized"),
    registryRevision: requiredString(record, "registryRevision"),
    installedDirectComponents: requiredStringArray(record, "installedDirectComponents"),
    installedResolvedComponents: requiredStringArray(record, "installedResolvedComponents"),
    recommendedComponents: requiredStringArray(record, "recommendedComponents"),
    components: requiredArray(record, "components").map(decodeComponentSummary),
  };
}

export function decodeSetupComponentDetail(value: unknown): SetupComponentDetail {
  const record = requiredObject(value, "Setup component detail");
  requireExactKeys(record, [
    "status", "name", "displayName", "kind", "description", "dependencies",
    "capabilities", "artifacts", "tools",
  ], "Setup component detail");
  if (requiredString(record, "status") !== "ready") {
    throw new Error("Setup component detail status must be ready.");
  }
  const kind = requiredString(record, "kind");
  if (kind !== "component" && kind !== "bundle") {
    throw new Error("Setup component detail kind is invalid.");
  }
  return {
    status: "ready",
    name: requiredString(record, "name"),
    displayName: requiredString(record, "displayName"),
    kind,
    description: requiredString(record, "description"),
    dependencies: requiredArray(record, "dependencies").map(decodeComponentReference),
    capabilities: requiredArray(record, "capabilities").map(decodeCapabilitySummary),
    artifacts: requiredArray(record, "artifacts").map(decodeComponentArtifact),
    tools: requiredArray(record, "tools").map(decodeToolSummary),
  };
}

export function decodeSetupSelectionPreview(value: unknown): SetupSelectionPreview {
  const record = requiredObject(value, "Setup selection preview");
  requireExactKeys(record, [
    "command", "projectRoot", "initialized", "registryRevision", "status",
    "currentDirectComponents", "requestedComponents", "directComponents",
    "resolvedComponents", "transitiveComponents", "bundleComponents", "footprint",
    "capabilities", "capabilityAvailability", "licenses", "trustRequired", "activations", "drift",
  ], "Setup selection preview");
  if (requiredString(record, "command") !== "plan") throw new Error("Setup preview command must be plan.");
  const status = requiredString(record, "status");
  if (status !== "current" && status !== "changes-ready" && status !== "blocked") {
    throw new Error("Setup preview status is invalid.");
  }
  if (requiredString(record, "capabilityAvailability") !== "not-inspected") {
    throw new Error("Setup preview capability availability is invalid.");
  }
  return {
    command: "plan",
    projectRoot: requiredString(record, "projectRoot"),
    initialized: requiredBoolean(record, "initialized"),
    registryRevision: requiredString(record, "registryRevision"),
    status,
    currentDirectComponents: requiredStringArray(record, "currentDirectComponents"),
    requestedComponents: requiredStringArray(record, "requestedComponents"),
    directComponents: requiredStringArray(record, "directComponents"),
    resolvedComponents: requiredStringArray(record, "resolvedComponents"),
    transitiveComponents: requiredStringArray(record, "transitiveComponents"),
    bundleComponents: requiredStringArray(record, "bundleComponents"),
    footprint: decodeSetupFootprint(Reflect.get(record, "footprint")),
    capabilities: requiredArray(record, "capabilities").map(decodeCapabilitySummary),
    capabilityAvailability: "not-inspected",
    licenses: requiredArray(record, "licenses").map(decodeLicenseSummary),
    trustRequired: requiredBoolean(record, "trustRequired"),
    activations: requiredArray(record, "activations").map(decodeActivationDisclosure),
    drift: decodeSelectionDrift(Reflect.get(record, "drift")),
  };
}

export function decodeSetupInstallOutcome(value: unknown): SetupInstallOutcome {
  const record = requiredObject(value, "Setup install outcome");
  const status = requiredString(record, "status");
  if (status === "applied") {
    return {
      status,
      snapshot: decodeSetupSnapshot(Reflect.get(record, "snapshot")),
      writtenPaths: requiredStringArray(record, "writtenPaths"),
    };
  }
  if (status === "blocked") {
    const conflicts = requiredArray(record, "conflicts").map((entry) => {
      const conflict = requiredObject(entry, "Setup conflict");
      return {
        targetPath: requiredString(conflict, "targetPath"),
        status: requiredString(conflict, "status"),
        detail: requiredString(conflict, "detail"),
      };
    });
    if (conflicts.length === 0) throw new Error("Blocked setup outcome must contain conflicts.");
    return {
      status,
      snapshot: decodeSetupSnapshot(Reflect.get(record, "snapshot")),
      conflicts,
    };
  }
  throw new Error("Setup install outcome status must be applied or blocked.");
}

function decodeComponentSummary(value: unknown): SetupComponentSummary {
  const record = requiredObject(value, "Setup component");
  requireExactKeys(record, ["name", "displayName", "kind", "dependencies", "capabilities", "licenseCount", "artifactCount"], "Setup component");
  const kind = requiredString(record, "kind");
  if (kind !== "component" && kind !== "bundle") throw new Error("Setup component kind is invalid.");
  return {
    name: requiredString(record, "name"),
    displayName: requiredString(record, "displayName"),
    kind,
    dependencies: requiredStringArray(record, "dependencies"),
    capabilities: requiredArray(record, "capabilities").map(decodeCapabilitySummary),
    licenseCount: requiredNonNegativeInteger(record, "licenseCount"),
    artifactCount: requiredNonNegativeInteger(record, "artifactCount"),
  };
}

function decodeComponentReference(value: unknown): SetupComponentReference {
  const record = requiredObject(value, "Setup component reference");
  requireExactKeys(record, ["name", "displayName"], "Setup component reference");
  return {
    name: requiredString(record, "name"),
    displayName: requiredString(record, "displayName"),
  };
}

function decodeComponentArtifact(value: unknown): SetupComponentArtifact {
  const record = requiredObject(value, "Setup component artifact");
  requireExactKeys(record, [
    "sourcePath", "targetPath", "operation", "mediaType", "editable", "content",
  ], "Setup component artifact");
  const operation = requiredString(record, "operation");
  if (!SETUP_ARTIFACT_OPERATIONS.has(operation as SetupArtifactOperation)) {
    throw new Error("Setup component artifact operation is invalid.");
  }
  return {
    sourcePath: requiredString(record, "sourcePath"),
    targetPath: requiredString(record, "targetPath"),
    operation: operation as SetupArtifactOperation,
    mediaType: requiredString(record, "mediaType"),
    editable: requiredBoolean(record, "editable"),
    content: requiredText(record, "content"),
  };
}

function decodeToolSummary(value: unknown): SetupToolSummary {
  const record = requiredObject(value, "Setup tool");
  requireExactKeys(record, ["name", "description", "sourcePath", "modes"], "Setup tool");
  return {
    name: requiredString(record, "name"),
    description: requiredString(record, "description"),
    sourcePath: requiredString(record, "sourcePath"),
    modes: requiredArray(record, "modes").map(decodeToolModeSummary),
  };
}

function decodeToolModeSummary(value: unknown): SetupToolModeSummary {
  const record = requiredObject(value, "Setup tool mode");
  requireExactKeys(record, ["name", "description", "arguments"], "Setup tool mode");
  return {
    name: requiredString(record, "name"),
    description: requiredString(record, "description"),
    arguments: requiredArray(record, "arguments").map(decodeToolArgumentSummary),
  };
}

function decodeToolArgumentSummary(value: unknown): SetupToolArgumentSummary {
  const record = requiredObject(value, "Setup tool argument");
  requireExactKeys(record, [
    "name", "type", "required", "description", "constraints",
  ], "Setup tool argument");
  return {
    name: requiredString(record, "name"),
    type: requiredString(record, "type"),
    required: requiredBoolean(record, "required"),
    description: requiredString(record, "description"),
    constraints: requiredStringArray(record, "constraints"),
  };
}

function decodeSourceOverrides(record: object, label: string): readonly SetupSourceOverride[] {
  const overrides = requiredArray(record, "overrides").map((value) => {
    const override = requiredObject(value, `${label} source override`);
    requireExactKeys(override, ["sourcePath", "content"], `${label} source override`);
    const sourcePath = requiredString(override, "sourcePath");
    const content = requiredText(override, "content");
    const bytes = utf8Bytes(content);
    if (bytes > MAX_SETUP_OVERRIDE_FILE_BYTES) {
      throw new Error(
        `Setup source override ${sourcePath} exceeds ${MAX_SETUP_OVERRIDE_FILE_BYTES} UTF-8 bytes.`,
      );
    }
    return { sourcePath, content };
  });
  const uniquePaths = new Set(overrides.map((override) => override.sourcePath));
  if (uniquePaths.size !== overrides.length) {
    throw new Error("Setup source overrides must not contain duplicate source paths.");
  }
  const totalBytes = overrides.reduce((total, override) => total + utf8Bytes(override.content), 0);
  if (totalBytes > MAX_SETUP_OVERRIDE_TOTAL_BYTES) {
    throw new Error(
      `Setup source overrides exceed ${MAX_SETUP_OVERRIDE_TOTAL_BYTES} UTF-8 bytes.`,
    );
  }
  return overrides;
}

function decodeCapabilitySummary(value: unknown): SetupCapabilitySummary {
  const capability = requiredObject(value, "Setup capability");
  requireExactKeys(capability, ["kind", "name", "requirement"], "Setup capability");
  const kind = requiredString(capability, "kind");
  const requirement = requiredString(capability, "requirement");
  if (kind !== "codex-skill" && kind !== "runtime") throw new Error("Setup capability kind is invalid.");
  if (requirement !== "required" && requirement !== "recommended") {
    throw new Error("Setup capability requirement is invalid.");
  }
  return { kind, name: requiredString(capability, "name"), requirement };
}

function decodeLicenseSummary(value: unknown): SetupLicenseSummary {
  const record = requiredObject(value, "Setup license");
  const kind = requiredString(record, "kind");
  if (kind === "project") {
    requireExactKeys(record, ["kind", "spdx", "noticePath"], "Setup license");
    return { kind, spdx: requiredString(record, "spdx"), noticePath: requiredString(record, "noticePath") };
  }
  if (kind === "third-party") {
    requireExactKeys(record, ["kind", "spdx", "source", "revision", "noticePath"], "Setup license");
    return {
      kind,
      spdx: requiredString(record, "spdx"),
      source: requiredString(record, "source"),
      revision: requiredString(record, "revision"),
      noticePath: requiredString(record, "noticePath"),
    };
  }
  throw new Error("Setup license kind is invalid.");
}

function decodeActivationDisclosure(value: unknown): SetupActivationDisclosure {
  const record = requiredObject(value, "Setup activation");
  requireExactKeys(record, ["id", "status", "message"], "Setup activation");
  const id = requiredString(record, "id");
  const status = requiredString(record, "status");
  if (
    id !== "codex-project-trust" &&
    id !== "codex-hooks-session-binding" &&
    id !== "codex-authenticated-execution"
  ) {
    throw new Error("Setup activation id is invalid.");
  }
  if (status !== "required" && status !== "dormant") throw new Error("Setup activation status is invalid.");
  return { id, status, message: requiredString(record, "message") };
}

function decodeSetupFootprint(value: unknown): SetupFootprint {
  const record = requiredObject(value, "Setup footprint");
  requireExactKeys(record, [
    "componentCount", "directComponentCount", "transitiveComponentCount", "bundleCount",
    "artifactCount", "targetCount", "skillTargetCount", "runtimeTargetCount",
  ], "Setup footprint");
  return {
    componentCount: requiredNonNegativeInteger(record, "componentCount"),
    directComponentCount: requiredNonNegativeInteger(record, "directComponentCount"),
    transitiveComponentCount: requiredNonNegativeInteger(record, "transitiveComponentCount"),
    bundleCount: requiredNonNegativeInteger(record, "bundleCount"),
    artifactCount: requiredNonNegativeInteger(record, "artifactCount"),
    targetCount: requiredNonNegativeInteger(record, "targetCount"),
    skillTargetCount: requiredNonNegativeInteger(record, "skillTargetCount"),
    runtimeTargetCount: requiredNonNegativeInteger(record, "runtimeTargetCount"),
  };
}

function decodeSelectionDrift(value: unknown): SetupSelectionDrift {
  const record = requiredObject(value, "Setup drift");
  requireExactKeys(record, [
    "assessmentCounts", "conflicts", "plannedWritePaths", "configChangeRequired", "lockChangeRequired",
  ], "Setup drift");
  return {
    assessmentCounts: requiredArray(record, "assessmentCounts").map((entry) => {
      const count = requiredObject(entry, "Setup assessment count");
      requireExactKeys(count, ["status", "count"], "Setup assessment count");
      const status = requiredString(count, "status");
      if (!ASSESSMENT_STATUSES.has(status as SetupAssessmentCount["status"])) {
        throw new Error("Setup assessment status is invalid.");
      }
      return { status: status as SetupAssessmentCount["status"], count: requiredNonNegativeInteger(count, "count") };
    }),
    conflicts: requiredArray(record, "conflicts").map(decodeSetupConflict),
    plannedWritePaths: requiredStringArray(record, "plannedWritePaths"),
    configChangeRequired: requiredBoolean(record, "configChangeRequired"),
    lockChangeRequired: requiredBoolean(record, "lockChangeRequired"),
  };
}

function decodeSetupConflict(value: unknown): SetupConflict {
  const conflict = requiredObject(value, "Setup conflict");
  requireExactKeys(conflict, ["targetPath", "status", "detail"], "Setup conflict");
  return {
    targetPath: requiredString(conflict, "targetPath"),
    status: requiredString(conflict, "status"),
    detail: requiredString(conflict, "detail"),
  };
}

function requiredObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} contains unexpected or missing fields.`);
  }
}

function requiredString(value: object, key: string): string {
  const candidate: unknown = Reflect.get(value, key);
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return candidate;
}

function requiredText(value: object, key: string): string {
  const candidate: unknown = Reflect.get(value, key);
  if (typeof candidate !== "string") throw new Error(`${key} must be a string.`);
  return candidate;
}

function requiredBoolean(value: object, key: string): boolean {
  const candidate: unknown = Reflect.get(value, key);
  if (typeof candidate !== "boolean") throw new Error(`${key} must be a boolean.`);
  return candidate;
}

function requiredArray(value: object, key: string): readonly unknown[] {
  const candidate: unknown = Reflect.get(value, key);
  if (!Array.isArray(candidate)) throw new Error(`${key} must be an array.`);
  return candidate;
}

function requiredStringArray(value: object, key: string): readonly string[] {
  const candidate = requiredArray(value, key);
  if (candidate.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${key} must be a string array.`);
  }
  return candidate.filter((entry): entry is string => typeof entry === "string");
}

function requiredNonNegativeInteger(value: object, key: string): number {
  const candidate: unknown = Reflect.get(value, key);
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return candidate;
}

const ASSESSMENT_STATUSES = new Set<SetupAssessmentCount["status"]>([
  "uninstalled", "unchanged", "locally-modified", "upstream-changed", "diverged",
  "untracked-conflict", "obsolete-unchanged", "obsolete-modified",
]);

const SETUP_ARTIFACT_OPERATIONS = new Set<SetupArtifactOperation>([
  "file", "seed-file", "text-section", "json-members", "json-array-items",
  "json-array-values", "toml-tables", "toml-members", "runtime-workspace",
]);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
