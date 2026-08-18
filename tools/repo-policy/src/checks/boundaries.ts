import { readFile } from "node:fs/promises";
import path from "node:path";
import { findFiles } from "../filesystem.js";
import { discoverWorkspaceUnits, type PackageCategory } from "../workspace.js";

const allowedProductionEdges: Readonly<Record<PackageCategory, readonly PackageCategory[]>> = {
  "application": [
    "application",
    "contract-policy",
    "domain-kernel",
    "presentation-system",
    "runtime-integration",
  ],
  "contract-policy": ["contract-policy", "domain-kernel"],
  "domain-kernel": ["domain-kernel"],
  "presentation-system": ["contract-policy", "domain-kernel", "presentation-system"],
  "runtime-integration": ["contract-policy", "domain-kernel", "runtime-integration"],
  "test-support": [
    "application",
    "contract-policy",
    "domain-kernel",
    "presentation-system",
    "runtime-integration",
    "test-support",
    "tooling",
  ],
  "tooling": [
    "application",
    "contract-policy",
    "domain-kernel",
    "presentation-system",
    "runtime-integration",
    "tooling",
  ],
};

export async function checkBoundaries(root: string): Promise<readonly string[]> {
  const diagnostics: string[] = [];
  const units = await discoverWorkspaceUnits(root);
  const byName = new Map(units.map((unit) => [unit.name, unit]));

  for (const unit of units) {
    for (const dependencyName of Object.keys(unit.dependencies)) {
      const dependency = byName.get(dependencyName);
      if (dependency === undefined) {
        continue;
      }
      if (!allowedProductionEdges[unit.category].includes(dependency.category)) {
        diagnostics.push(
          `${unit.name} (${unit.category}) cannot depend on ${dependency.name} (${dependency.category}).`,
        );
      }
      if (dependency.category === "test-support") {
        diagnostics.push(`${unit.name} lists test-support package ${dependency.name} as a production dependency.`);
      }
    }

    const sourceFiles = await findFiles(
      path.join(root, unit.root),
      (relativePath) => relativePath.endsWith(".ts") && !relativePath.includes("/test/"),
    );
    for (const relativeSource of sourceFiles) {
      const source = await readFile(path.join(root, unit.root, relativeSource), "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith(".")) {
          continue;
        }
        const sourceDirectory = path.dirname(path.join(root, unit.root, relativeSource));
        const resolved = path.resolve(sourceDirectory, specifier);
        const unitRoot = path.resolve(root, unit.root);
        if (resolved !== unitRoot && !resolved.startsWith(`${unitRoot}${path.sep}`)) {
          diagnostics.push(`${unit.root}/${relativeSource} imports outside its package through ${specifier}.`);
        }
      }
    }
  }

  return diagnostics;
}

function importSpecifiers(source: string): readonly string[] {
  const matches = source.matchAll(
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/gu,
  );
  return [...matches]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}
