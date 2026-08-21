export const CONTEXT_INSTALLATION_SCHEMA_VERSION = 2 as const;
export const CONTEXT_ADAPTER = "codex" as const;

export interface ContextRegistryV2 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly revision: string;
  readonly decisionPath: string;
  readonly components: readonly ContextRegistryComponent[];
}

export interface ContextRegistryComponent {
  readonly name: string;
  readonly revision: string;
  readonly dependencies: readonly string[];
  readonly capabilities: readonly ContextCapability[];
  readonly licenses: readonly ContextLicense[];
  readonly artifacts: readonly ContextRegistryArtifact[];
}

export interface ContextCapability {
  readonly kind: "codex-skill" | "runtime";
  readonly name: string;
  readonly requirement: "required" | "recommended";
}

export type ContextLicense =
  | {
      readonly kind: "project";
      readonly spdx: string;
      readonly sourcePath: string;
      readonly noticePath: string;
      readonly noticeSha256: string;
    }
  | {
      readonly kind: "third-party";
      readonly spdx: string;
      readonly source: string;
      readonly revision: string;
      readonly noticePath: string;
      readonly noticeSha256: string;
    };

interface ContextArtifactBase {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly targetPath: string;
}

export interface ContextFileArtifact extends ContextArtifactBase {
  readonly operation: "file";
  readonly mediaType: string;
}

export interface ContextSeedFileArtifact extends ContextArtifactBase {
  readonly operation: "seed-file";
}

export interface ContextTextSectionArtifact extends ContextArtifactBase {
  readonly operation: "text-section";
  readonly sectionId: string;
  readonly markerStyle: "markdown" | "toml" | "javascript";
}

export interface ContextJsonMembersArtifact extends ContextArtifactBase {
  readonly operation: "json-members";
  readonly ownedPointers: readonly string[];
}

export interface ContextJsonArrayItemOwnership {
  readonly arrayPointer: string;
  readonly identityPointer: string;
  readonly identity: string;
}

export interface ContextJsonArrayItemsArtifact extends ContextArtifactBase {
  readonly operation: "json-array-items";
  readonly ownedItems: readonly ContextJsonArrayItemOwnership[];
}

export interface ContextJsonArrayValueOwnership {
  readonly arrayPointer: string;
  readonly value: string;
}

export interface ContextJsonArrayValuesArtifact extends ContextArtifactBase {
  readonly operation: "json-array-values";
  readonly ownedValues: readonly ContextJsonArrayValueOwnership[];
}

export interface ContextTomlTablesArtifact extends ContextArtifactBase {
  readonly operation: "toml-tables";
  readonly ownedTables: readonly string[];
  readonly sectionId: string;
}

export interface ContextTomlMembersArtifact extends ContextArtifactBase {
  readonly operation: "toml-members";
  readonly ownedMembers: readonly string[];
}

export interface ContextRuntimeWorkspaceArtifact extends ContextArtifactBase {
  readonly operation: "runtime-workspace";
  readonly workspaceId: string;
  readonly mediaType: string;
}

export type ContextRegistryArtifact =
  | ContextFileArtifact
  | ContextSeedFileArtifact
  | ContextTextSectionArtifact
  | ContextJsonMembersArtifact
  | ContextJsonArrayItemsArtifact
  | ContextJsonArrayValuesArtifact
  | ContextTomlTablesArtifact
  | ContextTomlMembersArtifact
  | ContextRuntimeWorkspaceArtifact;

export interface ContextProjectConfigV2 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly adapter: typeof CONTEXT_ADAPTER;
  readonly components: readonly string[];
}

export interface ContextInstallationLockV2 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly registryRevision: string;
  readonly components: readonly string[];
  readonly artifacts: readonly ContextLockedArtifact[];
}

export type ContextLockedArtifact = ContextRegistryArtifact & {
  readonly component: string;
  readonly installedSha256: string;
};

export function decodeContextRegistry(value: unknown): ContextRegistryV2 {
  const record = strictRecord(value, "Context registry", [
    "schemaVersion",
    "revision",
    "decisionPath",
    "components",
  ]);
  requireSchemaVersion(record.schemaVersion, "Context registry");
  const components = decodeArray(record.components, "Context registry components", decodeComponent);
  requireUnique(components.map((component) => component.name), "Context registry component names");
  return {
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    revision: requiredRevision(record, "revision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    components,
  };
}

export function decodeContextProjectConfig(value: unknown): ContextProjectConfigV2 {
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

export function decodeContextInstallationLock(value: unknown): ContextInstallationLockV2 {
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
  registry: ContextRegistryV2,
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
  switch (artifact.operation) {
    case "file":
      return `file:${artifact.targetPath}`;
    case "seed-file":
      return `seed-file:${artifact.targetPath}`;
    case "text-section":
      return `text-section:${artifact.targetPath}:${artifact.sectionId}`;
    case "json-members":
      return `json-members:${artifact.targetPath}:${artifact.ownedPointers.join(",")}`;
    case "json-array-items":
      return `json-array-items:${artifact.targetPath}:${artifact.ownedItems.map(jsonArrayItemIdentity).join(",")}`;
    case "json-array-values":
      return `json-array-values:${artifact.targetPath}:${artifact.ownedValues.map(jsonArrayValueIdentity).join(",")}`;
    case "toml-tables":
      return `toml-tables:${artifact.targetPath}:${artifact.ownedTables.join(",")}`;
    case "toml-members":
      return `toml-members:${artifact.targetPath}:${artifact.ownedMembers.join(",")}`;
    case "runtime-workspace":
      return `runtime-workspace:${artifact.workspaceId}:${artifact.targetPath}`;
  }
}

function decodeComponent(value: unknown): ContextRegistryComponent {
  const record = strictRecord(value, "Context registry component", [
    "name",
    "revision",
    "dependencies",
    "capabilities",
    "licenses",
    "artifacts",
  ]);
  const dependencies = decodeArray(
    record.dependencies,
    "Context registry component dependencies",
    (dependency) => componentName(dependency, "Context registry dependency"),
  );
  requireUnique(dependencies, "Context registry component dependencies");
  const capabilities = decodeArray(
    record.capabilities,
    "Context registry component capabilities",
    decodeCapability,
  );
  requireUnique(
    capabilities.map((capability) => `${capability.kind}:${capability.name}`),
    "Context registry component capabilities",
  );
  const licenses = decodeArray(
    record.licenses,
    "Context registry component licenses",
    decodeLicense,
  );
  if (licenses.length === 0) {
    throw new Error("Context registry component licenses must not be empty.");
  }
  const artifacts = decodeArray(
    record.artifacts,
    "Context registry component artifacts",
    decodeRegistryArtifact,
  );
  if (artifacts.length === 0 && dependencies.length === 0) {
    throw new Error("Context registry component must declare artifacts or dependencies.");
  }
  requireUnique(artifacts.map(artifactIdentity), "Context registry component artifact identities");
  return {
    name: componentName(record.name, "Context registry component name"),
    revision: componentRevision(record.revision),
    dependencies,
    capabilities,
    licenses,
    artifacts,
  };
}

function componentRevision(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Context registry component revision must be a content-addressed SHA-256 identifier.");
  }
  return value;
}

function decodeCapability(value: unknown): ContextCapability {
  const record = strictRecord(value, "Context capability", ["kind", "name", "requirement"]);
  if (record.kind !== "codex-skill" && record.kind !== "runtime") {
    throw new Error("Context capability kind must be codex-skill or runtime.");
  }
  if (record.requirement !== "required" && record.requirement !== "recommended") {
    throw new Error("Context capability requirement must be required or recommended.");
  }
  return {
    kind: record.kind,
    name: componentName(record.name, "Context capability name"),
    requirement: record.requirement,
  };
}

function decodeLicense(value: unknown): ContextLicense {
  if (!isRecord(value)) throw new Error("Context license must be an object.");
  if (value.kind === "project") {
    const record = strictRecord(value, "Project context license", [
      "kind",
      "spdx",
      "sourcePath",
      "noticePath",
      "noticeSha256",
    ]);
    return {
      kind: "project",
      spdx: requiredString(record, "spdx"),
      sourcePath: portableRelativePath(record, "sourcePath"),
      noticePath: portableRelativePath(record, "noticePath"),
      noticeSha256: sha256(record, "noticeSha256"),
    };
  }
  if (value.kind !== "third-party") {
    throw new Error("Context license kind must be project or third-party.");
  }
  const record = strictRecord(value, "Third-party context license", [
    "kind",
    "spdx",
    "source",
    "revision",
    "noticePath",
    "noticeSha256",
  ]);
  return {
    kind: "third-party",
    spdx: requiredString(record, "spdx"),
    source: requiredString(record, "source"),
    revision: requiredRevision(record, "revision"),
    noticePath: portableRelativePath(record, "noticePath"),
    noticeSha256: sha256(record, "noticeSha256"),
  };
}

function decodeRegistryArtifact(value: unknown): ContextRegistryArtifact {
  if (!isRecord(value)) throw new Error("Context registry artifact must be an object.");
  return decodeArtifact(value, "Context registry artifact");
}

function decodeLockedArtifact(value: unknown): ContextLockedArtifact {
  if (!isRecord(value)) throw new Error("Context installation lock artifact must be an object.");
  const component = componentName(value.component, "Context installation lock artifact component");
  const installedSha256 = sha256(value, "installedSha256");
  const withoutComponent = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "component" && key !== "installedSha256"),
  );
  return {
    ...decodeArtifact(withoutComponent, "Context installation lock artifact"),
    component,
    installedSha256,
  };
}

function decodeArtifact(record: Record<string, unknown>, label: string): ContextRegistryArtifact {
  const operation = record.operation;
  const baseKeys = ["operation", "sourcePath", "sourceSha256", "targetPath"] as const;
  const base = (): ContextArtifactBase => ({
    sourcePath: portableRelativePath(record, "sourcePath"),
    sourceSha256: sha256(record, "sourceSha256"),
    targetPath: portableRelativePath(record, "targetPath"),
  });
  switch (operation) {
    case "file": {
      strictRecord(record, label, [...baseKeys, "mediaType"]);
      return { operation, ...base(), mediaType: requiredString(record, "mediaType") };
    }
    case "seed-file": {
      strictRecord(record, label, baseKeys);
      return { operation, ...base() };
    }
    case "text-section": {
      strictRecord(record, label, [...baseKeys, "sectionId", "markerStyle"]);
      const markerStyle = record.markerStyle;
      if (markerStyle !== "markdown" && markerStyle !== "toml" && markerStyle !== "javascript") {
        throw new Error("Text section markerStyle must be markdown, toml, or javascript.");
      }
      return { operation, ...base(), sectionId: sectionId(record.sectionId), markerStyle };
    }
    case "json-members": {
      strictRecord(record, label, [...baseKeys, "ownedPointers"]);
      const ownedPointers = decodeArray(
        record.ownedPointers,
        "JSON member ownedPointers",
        jsonPointer,
      );
      if (ownedPointers.length === 0) throw new Error("JSON member ownedPointers must not be empty.");
      requireSortedUnique(ownedPointers, "JSON member ownedPointers");
      return { operation, ...base(), ownedPointers };
    }
    case "json-array-items": {
      strictRecord(record, label, [...baseKeys, "ownedItems"]);
      const ownedItems = decodeArray(
        record.ownedItems,
        "JSON array ownedItems",
        decodeJsonArrayItemOwnership,
      );
      if (ownedItems.length === 0) throw new Error("JSON array ownedItems must not be empty.");
      requireSortedUnique(
        ownedItems.map(jsonArrayItemIdentity),
        "JSON array ownedItems",
      );
      return { operation, ...base(), ownedItems };
    }
    case "json-array-values": {
      strictRecord(record, label, [...baseKeys, "ownedValues"]);
      const ownedValues = decodeArray(
        record.ownedValues,
        "JSON array ownedValues",
        decodeJsonArrayValueOwnership,
      );
      if (ownedValues.length === 0) throw new Error("JSON array ownedValues must not be empty.");
      requireSortedUnique(
        ownedValues.map(jsonArrayValueIdentity),
        "JSON array ownedValues",
      );
      return { operation, ...base(), ownedValues };
    }
    case "toml-tables": {
      strictRecord(record, label, [...baseKeys, "ownedTables", "sectionId"]);
      const ownedTables = decodeArray(record.ownedTables, "TOML ownedTables", tomlTablePath);
      if (ownedTables.length === 0) throw new Error("TOML ownedTables must not be empty.");
      requireSortedUnique(ownedTables, "TOML ownedTables");
      return { operation, ...base(), ownedTables, sectionId: sectionId(record.sectionId) };
    }
    case "toml-members": {
      strictRecord(record, label, [...baseKeys, "ownedMembers"]);
      const ownedMembers = decodeArray(record.ownedMembers, "TOML ownedMembers", tomlMemberPath);
      if (ownedMembers.length === 0) throw new Error("TOML ownedMembers must not be empty.");
      requireSortedUnique(ownedMembers, "TOML ownedMembers");
      return { operation, ...base(), ownedMembers };
    }
    case "runtime-workspace": {
      strictRecord(record, label, [...baseKeys, "workspaceId", "mediaType"]);
      return {
        operation,
        ...base(),
        workspaceId: componentName(record.workspaceId, "Runtime workspaceId"),
        mediaType: requiredString(record, "mediaType"),
      };
    }
    default:
      throw new Error(
        "Context registry artifact operation must be file, seed-file, text-section, json-members, json-array-items, json-array-values, toml-tables, toml-members, or runtime-workspace.",
      );
  }
}

function decodeJsonArrayItemOwnership(value: unknown): ContextJsonArrayItemOwnership {
  const record = strictRecord(value, "JSON array item ownership", [
    "arrayPointer",
    "identityPointer",
    "identity",
  ]);
  return {
    arrayPointer: jsonPointer(record.arrayPointer),
    identityPointer: jsonPointer(record.identityPointer),
    identity: requiredString(record, "identity"),
  };
}

function jsonArrayItemIdentity(item: ContextJsonArrayItemOwnership): string {
  return `${item.arrayPointer}:${item.identityPointer}:${JSON.stringify(item.identity)}`;
}

function decodeJsonArrayValueOwnership(value: unknown): ContextJsonArrayValueOwnership {
  const record = strictRecord(value, "JSON array value ownership", ["arrayPointer", "value"]);
  return {
    arrayPointer: jsonPointer(record.arrayPointer),
    value: requiredString(record, "value"),
  };
}

function jsonArrayValueIdentity(value: ContextJsonArrayValueOwnership): string {
  return `${value.arrayPointer}:${JSON.stringify(value.value)}`;
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
  return componentName(value, "Context sectionId");
}

function jsonPointer(value: unknown): string {
  if (typeof value !== "string" || !/^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/u.test(value)) {
    throw new Error("JSON member pointer must be a non-root RFC 6901 pointer.");
  }
  return value;
}

function tomlTablePath(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u.test(value)) {
    throw new Error("TOML table path must be a dotted bare-key path.");
  }
  return value;
}

function tomlMemberPath(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/u.test(value)) {
    throw new Error("TOML member path must be a dotted bare-key path below the root.");
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

function requireSortedUnique(values: readonly string[], label: string): void {
  requireUnique(values, label);
  if (values.some((value, index) => index > 0 && value < (values[index - 1] ?? ""))) {
    throw new Error(`${label} must be sorted.`);
  }
}
