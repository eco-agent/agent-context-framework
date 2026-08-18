import path from "node:path";
import { findFiles, readJsonFile } from "../filesystem.js";

interface AdoptionRecord {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly license: string;
  readonly integrity: string;
  readonly purpose: string;
  readonly alternativesConsidered: readonly string[];
  readonly maintenanceStatus: string;
  readonly securityEvidence: string;
  readonly modifications: string;
  readonly requiredNotices: string;
  readonly owner: string;
}

export async function checkDependencyAdoptions(root: string): Promise<readonly string[]> {
  const diagnostics: string[] = [];
  const records = await loadRecords(root, diagnostics);
  const manifests = await findFiles(root, (relativePath) => relativePath.endsWith("package.json"));
  const externalDependencies = new Map<string, Set<string>>();

  for (const manifestPath of manifests) {
    const manifest = await readJsonFile(path.join(root, manifestPath));
    if (!isRecord(manifest)) {
      diagnostics.push(`${manifestPath} must contain a JSON object.`);
      continue;
    }
    for (const group of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      const dependencies = manifest[group];
      if (!isRecord(dependencies)) {
        continue;
      }
      for (const [name, rawVersion] of Object.entries(dependencies)) {
        if (typeof rawVersion !== "string" || rawVersion.startsWith("workspace:")) {
          continue;
        }
        const versions = externalDependencies.get(name) ?? new Set<string>();
        versions.add(rawVersion);
        externalDependencies.set(name, versions);
      }
    }
  }

  for (const [name, versions] of externalDependencies) {
    const record = records.get(name);
    if (record === undefined) {
      diagnostics.push(`External dependency ${name} has no adoption record.`);
      continue;
    }
    for (const version of versions) {
      if (record.version !== version) {
        diagnostics.push(`${name} uses ${version}, but its adoption record approves ${record.version}.`);
      }
    }
  }

  for (const name of records.keys()) {
    if (!externalDependencies.has(name)) {
      diagnostics.push(`Adoption record ${name} does not match an installed manifest dependency.`);
    }
  }

  return diagnostics;
}

async function loadRecords(
  root: string,
  diagnostics: string[],
): Promise<ReadonlyMap<string, AdoptionRecord>> {
  const recordFiles = await findFiles(
    path.join(root, "dependency-adoptions"),
    (relativePath) => relativePath.endsWith(".json"),
  );
  const records = new Map<string, AdoptionRecord>();

  for (const relativePath of recordFiles) {
    const candidate = await readJsonFile(path.join(root, "dependency-adoptions", relativePath));
    if (!isAdoptionRecord(candidate)) {
      diagnostics.push(`dependency-adoptions/${relativePath} is incomplete.`);
      continue;
    }
    if (records.has(candidate.name)) {
      diagnostics.push(`Dependency adoption ${candidate.name} is recorded more than once.`);
      continue;
    }
    records.set(candidate.name, candidate);
  }
  return records;
}

function isAdoptionRecord(value: unknown): value is AdoptionRecord {
  return (
    isRecord(value) &&
    nonEmptyString(value.name) &&
    nonEmptyString(value.version) &&
    nonEmptyString(value.source) &&
    nonEmptyString(value.license) &&
    nonEmptyString(value.integrity) &&
    nonEmptyString(value.purpose) &&
    Array.isArray(value.alternativesConsidered) &&
    value.alternativesConsidered.every(nonEmptyString) &&
    nonEmptyString(value.maintenanceStatus) &&
    nonEmptyString(value.securityEvidence) &&
    nonEmptyString(value.modifications) &&
    nonEmptyString(value.requiredNotices) &&
    nonEmptyString(value.owner)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
