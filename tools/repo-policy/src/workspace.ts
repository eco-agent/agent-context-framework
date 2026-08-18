import path from "node:path";
import { findFiles, readJsonFile } from "./filesystem.js";

export type PackageCategory =
  | "application"
  | "contract-policy"
  | "domain-kernel"
  | "presentation-system"
  | "runtime-integration"
  | "test-support"
  | "tooling";

export interface WorkspaceUnit {
  readonly name: string;
  readonly root: string;
  readonly category: PackageCategory;
  readonly owner: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

export async function discoverWorkspaceUnits(root: string): Promise<readonly WorkspaceUnit[]> {
  const manifests = await findFiles(
    root,
    (relativePath) => relativePath !== "package.json" && relativePath.endsWith("/package.json"),
  );
  const units: WorkspaceUnit[] = [];

  for (const manifestPath of manifests) {
    const manifest = await readJsonFile(path.join(root, manifestPath));
    if (!isRecord(manifest) || typeof manifest.name !== "string") {
      continue;
    }

    const metadata = manifest.agentContext;
    if (
      !isRecord(metadata) ||
      !isPackageCategory(metadata.category) ||
      typeof metadata.owner !== "string" ||
      metadata.owner.length === 0
    ) {
      throw new Error(`${manifestPath} needs agentContext.category and agentContext.owner.`);
    }

    units.push({
      name: manifest.name,
      root: path.posix.dirname(manifestPath),
      category: metadata.category,
      owner: metadata.owner,
      dependencies: stringRecord(manifest.dependencies),
      devDependencies: stringRecord(manifest.devDependencies),
    });
  }

  return units.sort((left, right) => left.root.localeCompare(right.root));
}

export function affectedWorkspaceUnits(
  changedFiles: readonly string[],
  units: readonly WorkspaceUnit[],
): readonly string[] {
  const directlyAffected = new Set(
    units
      .filter((unit) => changedFiles.some((file) => file === unit.root || file.startsWith(`${unit.root}/`)))
      .map((unit) => unit.name),
  );

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const unit of units) {
      const internalDependencies = Object.keys({ ...unit.dependencies, ...unit.devDependencies });
      if (
        !directlyAffected.has(unit.name) &&
        internalDependencies.some((dependency) => directlyAffected.has(dependency))
      ) {
        directlyAffected.add(unit.name);
        expanded = true;
      }
    }
  }

  return [...directlyAffected].sort();
}

function isPackageCategory(value: unknown): value is PackageCategory {
  return (
    value === "application" ||
    value === "contract-policy" ||
    value === "domain-kernel" ||
    value === "presentation-system" ||
    value === "runtime-integration" ||
    value === "test-support" ||
    value === "tooling"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
