const repositoryStatuses = ["missing", "invalid", "repack-required", "blocked", "sync-required", "current"] as const;
export type RepositoryStatus = typeof repositoryStatuses[number];

interface ObservationBase {
  readonly id: string;
  readonly root: string;
  readonly issues: readonly string[];
}

export type RepositoryObservation =
  | (ObservationBase & { readonly status: "missing" | "invalid" })
  | (ObservationBase & {
      readonly status: "repack-required" | "blocked" | "sync-required" | "current";
      readonly capsuleSha256: string;
      readonly treeSha256: string;
      readonly frameworkRevision: string;
      readonly registryRevision: string;
      readonly directComponents: readonly string[];
      readonly resolvedComponents: readonly string[];
      readonly activationCount: number;
      readonly generatedFileCount: number;
    });

export interface RepositorySnapshot {
  readonly status: "current" | "attention";
  readonly catalogRoot: string;
  readonly registryRevision: string;
  readonly repositories: readonly RepositoryObservation[];
}

export function parseRepositorySnapshot(value: unknown): RepositorySnapshot {
  const snapshot = requireRecord(value, "Repository snapshot");
  const status = snapshot.status;
  if (status !== "current" && status !== "attention") fail("Repository snapshot status is invalid.");
  const repositories = requireArray(snapshot.repositories, "Repository snapshot repositories")
    .map(parseRepositoryObservation);
  return {
    status,
    catalogRoot: requireString(snapshot.catalogRoot, "Repository snapshot catalog root"),
    registryRevision: requireString(snapshot.registryRevision, "Repository snapshot registry revision"),
    repositories,
  };
}

function parseRepositoryObservation(value: unknown): RepositoryObservation {
  const observation = requireRecord(value, "Repository observation");
  const status = observation.status;
  if (!isRepositoryStatus(status)) fail("Repository observation status is invalid.");
  const base: ObservationBase = {
    id: requireString(observation.id, "Repository id"),
    root: requireString(observation.root, "Repository root"),
    issues: requireStringArray(observation.issues, "Repository issues"),
  };
  if (status === "missing" || status === "invalid") return { ...base, status };
  return {
    ...base,
    status,
    capsuleSha256: requireString(observation.capsuleSha256, "Capsule hash"),
    treeSha256: requireString(observation.treeSha256, "Tree hash"),
    frameworkRevision: requireString(observation.frameworkRevision, "Framework revision"),
    registryRevision: requireString(observation.registryRevision, "Registry revision"),
    directComponents: requireStringArray(observation.directComponents, "Direct components"),
    resolvedComponents: requireStringArray(observation.resolvedComponents, "Resolved components"),
    activationCount: requireNonNegativeInteger(observation.activationCount, "Activation count"),
    generatedFileCount: requireNonNegativeInteger(observation.generatedFileCount, "Generated file count"),
  };
}

function isRepositoryStatus(value: unknown): value is RepositoryStatus {
  return typeof value === "string" && repositoryStatuses.some((status) => status === value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string.`);
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, label).map((entry) => requireString(entry, label));
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer.`);
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}
