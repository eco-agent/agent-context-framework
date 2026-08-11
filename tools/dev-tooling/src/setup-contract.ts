export interface SetupCapabilitySummary {
  readonly kind: "codex-skill" | "runtime";
  readonly name: string;
  readonly requirement: "required" | "recommended";
}

export interface SetupComponentSummary {
  readonly name: string;
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
  readonly components: readonly SetupComponentSummary[];
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
}

export interface SetupInstallCommand {
  readonly components: readonly string[];
}

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
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "components") {
    throw new Error("Setup install request must contain only components.");
  }
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
  return { components };
}

export function parseSetupPlanCommand(
  value: unknown,
  availableComponents: ReadonlySet<string>,
): SetupPlanCommand {
  const record = requiredObject(value, "Setup plan request");
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "components") {
    throw new Error("Setup plan request must contain only components.");
  }
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
  return { components };
}

export function decodeSetupSnapshot(value: unknown): SetupSnapshot {
  const record = requiredObject(value, "Setup snapshot");
  requireExactKeys(record, [
    "status", "projectRoot", "initialized", "registryRevision",
    "installedDirectComponents", "installedResolvedComponents", "components",
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
    components: requiredArray(record, "components").map(decodeComponentSummary),
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
  requireExactKeys(record, ["name", "kind", "dependencies", "capabilities", "licenseCount", "artifactCount"], "Setup component");
  const kind = requiredString(record, "kind");
  if (kind !== "component" && kind !== "bundle") throw new Error("Setup component kind is invalid.");
  return {
    name: requiredString(record, "name"),
    kind,
    dependencies: requiredStringArray(record, "dependencies"),
    capabilities: requiredArray(record, "capabilities").map(decodeCapabilitySummary),
    licenseCount: requiredNonNegativeInteger(record, "licenseCount"),
    artifactCount: requiredNonNegativeInteger(record, "artifactCount"),
  };
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
