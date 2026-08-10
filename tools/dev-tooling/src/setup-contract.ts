export interface SetupCapabilitySummary {
  readonly kind: "codex-skill" | "runtime";
  readonly name: string;
  readonly requirement: "required" | "recommended";
}

export interface SetupComponentSummary {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly capabilities: readonly SetupCapabilitySummary[];
  readonly licenseCount: number;
}

export interface SetupSnapshot {
  readonly status: "ready";
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly registryRevision: string;
  readonly selectedComponents: readonly string[];
  readonly components: readonly SetupComponentSummary[];
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

export function decodeSetupSnapshot(value: unknown): SetupSnapshot {
  const record = requiredObject(value, "Setup snapshot");
  if (requiredString(record, "status") !== "ready") {
    throw new Error("Setup snapshot status must be ready.");
  }
  return {
    status: "ready",
    projectRoot: requiredString(record, "projectRoot"),
    initialized: requiredBoolean(record, "initialized"),
    registryRevision: requiredString(record, "registryRevision"),
    selectedComponents: requiredStringArray(record, "selectedComponents"),
    components: requiredArray(record, "components").map(decodeComponentSummary),
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
  return {
    name: requiredString(record, "name"),
    dependencies: requiredStringArray(record, "dependencies"),
    capabilities: requiredArray(record, "capabilities").map((entry) => {
      const capability = requiredObject(entry, "Setup capability");
      const kind = requiredString(capability, "kind");
      const requirement = requiredString(capability, "requirement");
      if (kind !== "codex-skill" && kind !== "runtime") {
        throw new Error("Setup capability kind is invalid.");
      }
      if (requirement !== "required" && requirement !== "recommended") {
        throw new Error("Setup capability requirement is invalid.");
      }
      return { kind, name: requiredString(capability, "name"), requirement };
    }),
    licenseCount: requiredNonNegativeInteger(record, "licenseCount"),
  };
}

function requiredObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
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
