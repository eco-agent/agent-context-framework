import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function typescriptCli() {
  const executable = path.join(
    runtimeRoot,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  if (!existsSync(executable)) {
    throw new Error(
      "Runtime dependencies are missing. Bootstrap .agent-context/runtime before building.",
    );
  }
  return executable;
}

export function runtimePackageProjects() {
  const packagesRoot = path.join(runtimeRoot, "packages");
  if (!existsSync(packagesRoot)) {
    throw new Error("Runtime packages directory is missing.");
  }
  const projects = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("packages", entry.name))
    .filter((project) =>
      existsSync(path.join(runtimeRoot, project, "package.json")) &&
      existsSync(path.join(runtimeRoot, project, "tsconfig.json")))
    .sort();
  if (!projects.includes(path.join("packages", "shared"))) {
    throw new Error("Runtime shared package is required.");
  }
  return projects;
}
