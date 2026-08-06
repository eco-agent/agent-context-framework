export const CONTEXT_INSTALLATION_SCHEMA_VERSION = 1 as const;
export const CONTEXT_ADAPTER = "codex" as const;

export interface ContextRegistryV1 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly revision: string;
  readonly components: readonly ContextRegistryComponent[];
}

export interface ContextRegistryComponent {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly artifacts: readonly ContextRegistryArtifact[];
}

export type ContextRegistryArtifact = ContextManagedFile | ContextManagedSection;

export interface ContextManagedFile {
  readonly ownership: "managed-file";
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface ContextManagedSection {
  readonly ownership: "managed-section";
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sectionId: string;
}

export interface ContextProjectConfigV1 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly adapter: typeof CONTEXT_ADAPTER;
  readonly components: readonly string[];
}

export interface ContextInstallationLockV1 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly registryRevision: string;
  readonly components: readonly string[];
  readonly artifacts: readonly ContextLockedArtifact[];
}

export type ContextLockedArtifact = ContextLockedFile | ContextLockedSection;

export interface ContextLockedFile extends ContextManagedFile {
  readonly sha256: string;
}

export interface ContextLockedSection extends ContextManagedSection {
  readonly sha256: string;
}

export function decodeContextRegistry(value: unknown): ContextRegistryV1 {
  const record = strictRecord(value, "Context registry", [
    "schemaVersion",
    "revision",
    "components",
  ]);
  requireSchemaVersion(record.schemaVersion, "Context registry");
  const components = decodeArray(record.components, "Context registry components", decodeComponent);
  requireUnique(components.map((component) => component.name), "Context registry component names");
  return {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    revision: requiredRevision(record, "revision"),
    components,
  };
}

export function decodeContextProjectConfig(value: unknown): ContextProjectConfigV1 {
  const record = strictRecord(value, "Context project config", [
    "schemaVersion",
    "adapter",
    "components",
  ]);
  requireSchemaVersion(record.schemaVersion, "Context project config");
  if (record.adapter !== CONTEXT_ADAPTER) {
    throw new Error(`Context project config adapter must be ${CONTEXT_ADAPTER}.`);
  }
  const components = decodeArray(
    record.components,
    "Context project config components",
    (component) => componentName(component, "Context project config component"),
  );
  if (components.length === 0) {
    throw new Error("Context project config components must not be empty.");
  }
  requireUnique(components, "Context project config components");
  return {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    adapter: CONTEXT_ADAPTER,
    components,
  };
}

export function decodeContextInstallationLock(value: unknown): ContextInstallationLockV1 {
  const record = strictRecord(value, "Context installation lock", [
    "schemaVersion",
    "registryRevision",
    "components",
    "artifacts",
  ]);
  requireSchemaVersion(record.schemaVersion, "Context installation lock");
  const components = decodeArray(
    record.components,
    "Context installation lock components",
    (component) => componentName(component, "Context installation lock component"),
  );
  requireUnique(components, "Context installation lock components");
  const artifacts = decodeArray(
    record.artifacts,
    "Context installation lock artifacts",
    decodeLockedArtifact,
  );
  requireUnique(artifacts.map(artifactIdentity), "Context installation lock artifact identities");
  return {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    registryRevision: requiredRevision(record, "registryRevision"),
    components,
    artifacts,
  };
}

export function resolveContextComponents(
  registry: ContextRegistryV1,
  selectedNames: readonly string[],
): readonly ContextRegistryComponent[] {
  const byName = new Map(registry.components.map((component) => [component.name, component]));
  const result: ContextRegistryComponent[] = [];
  const resolved = new Set<string>();
  const active: string[] = [];

  const visit = (name: string): void => {
    if (resolved.has(name)) return;
    const cycleIndex = active.indexOf(name);
    if (cycleIndex >= 0) {
      throw new Error(
        `Context registry dependency cycle: ${[...active.slice(cycleIndex), name].join(" -> ")}.`,
      );
    }
    const component = byName.get(name);
    if (!component) {
      const owner = active.at(-1);
      throw new Error(
        owner
          ? `Context registry component ${owner} depends on unknown component ${name}.`
          : `Unknown context registry component ${name}.`,
      );
    }
    active.push(name);
    for (const dependency of component.dependencies) visit(dependency);
    active.pop();
    resolved.add(name);
    result.push(component);
  };

  for (const selectedName of selectedNames) visit(selectedName);
  return result;
}

export function artifactIdentity(artifact: ContextRegistryArtifact | ContextLockedArtifact): string {
  return artifact.ownership === "managed-file"
    ? `file:${artifact.targetPath}`
    : `section:${artifact.targetPath}:${artifact.sectionId}`;
}

function decodeComponent(value: unknown): ContextRegistryComponent {
  const record = strictRecord(value, "Context registry component", [
    "name",
    "dependencies",
    "artifacts",
  ]);
  const dependencies = decodeArray(
    record.dependencies,
    "Context registry component dependencies",
    (dependency) => componentName(dependency, "Context registry dependency"),
  );
  requireUnique(dependencies, "Context registry component dependencies");
  const artifacts = decodeArray(
    record.artifacts,
    "Context registry component artifacts",
    decodeRegistryArtifact,
  );
  if (artifacts.length === 0) {
    throw new Error("Context registry component artifacts must not be empty.");
  }
  requireUnique(artifacts.map(artifactIdentity), "Context registry component artifact identities");
  return {
    name: componentName(record.name, "Context registry component name"),
    dependencies,
    artifacts,
  };
}

function decodeRegistryArtifact(value: unknown): ContextRegistryArtifact {
  const ownership = discriminant(value, "Context registry artifact");
  if (ownership === "managed-file") {
    const record = strictRecord(value, "Managed file", ["ownership", "sourcePath", "targetPath"]);
    return {
      ownership,
      sourcePath: portableRelativePath(record, "sourcePath"),
      targetPath: portableRelativePath(record, "targetPath"),
    };
  }
  const record = strictRecord(value, "Managed section", [
    "ownership",
    "sourcePath",
    "targetPath",
    "sectionId",
  ]);
  return {
    ownership,
    sourcePath: portableRelativePath(record, "sourcePath"),
    targetPath: portableRelativePath(record, "targetPath"),
    sectionId: sectionId(record.sectionId),
  };
}

function decodeLockedArtifact(value: unknown): ContextLockedArtifact {
  const ownership = discriminant(value, "Context installation lock artifact");
  if (ownership === "managed-file") {
    const record = strictRecord(value, "Locked managed file", [
      "ownership",
      "sourcePath",
      "targetPath",
      "sha256",
    ]);
    return {
      ownership,
      sourcePath: portableRelativePath(record, "sourcePath"),
      targetPath: portableRelativePath(record, "targetPath"),
      sha256: sha256(record, "sha256"),
    };
  }
  const record = strictRecord(value, "Locked managed section", [
    "ownership",
    "sourcePath",
    "targetPath",
    "sectionId",
    "sha256",
  ]);
  return {
    ownership,
    sourcePath: portableRelativePath(record, "sourcePath"),
    targetPath: portableRelativePath(record, "targetPath"),
    sectionId: sectionId(record.sectionId),
    sha256: sha256(record, "sha256"),
  };
}

function discriminant(value: unknown, label: string): ContextRegistryArtifact["ownership"] {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.ownership !== "managed-file" && value.ownership !== "managed-section") {
    throw new Error(`${label} ownership must be managed-file or managed-section.`);
  }
  return value.ownership;
}

function requireSchemaVersion(value: unknown, label: string): void {
  if (value !== CONTEXT_INSTALLATION_SCHEMA_VERSION) {
    throw new Error(`${label} schemaVersion must be ${CONTEXT_INSTALLATION_SCHEMA_VERSION}.`);
  }
}

function componentName(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${label} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function sectionId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error("Managed section sectionId must be a lowercase kebab-case identifier.");
  }
  return value;
}

function portableRelativePath(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${key} must be a normalized portable repository-relative path.`);
  }
  return value;
}

function requiredRevision(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`${key} must be a stable version identifier.`);
  }
  return value;
}

function sha256(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${key} must be a lowercase SHA-256 hash.`);
  }
  return value;
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

function decodeArray<T>(
  value: unknown,
  label: string,
  decode: (item: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}

function requireUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} contains duplicate ${duplicate}.`);
}
