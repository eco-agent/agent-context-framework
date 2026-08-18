import path from "node:path";
import {
  pathExists,
  readJsonFile,
  resolvesInside,
} from "../filesystem.js";

interface TypeScriptProjectReference {
  readonly path: string;
}

type ProjectOutputMode =
  | { readonly kind: "no-emit" }
  | { readonly kind: "package-dist"; readonly outDir: string };

export async function checkTypeScriptProjects(
  root: string,
): Promise<readonly string[]> {
  const solution = await readJsonFile(path.join(root, "tsconfig.json"));
  if (!isRecord(solution) || !Array.isArray(solution.references)) {
    return ["tsconfig.json must contain a references array."];
  }

  const diagnostics: string[] = [];
  for (const candidate of solution.references) {
    if (!isProjectReference(candidate)) {
      diagnostics.push("tsconfig.json contains an invalid project reference.");
      continue;
    }

    const configRelativePath = candidate.path.endsWith(".json")
      ? candidate.path
      : path.posix.join(candidate.path.replaceAll("\\", "/"), "tsconfig.json");
    if (!(await resolvesInside(root, configRelativePath))) {
      diagnostics.push(
        `TypeScript project reference resolves outside the repository: ${candidate.path}.`,
      );
      continue;
    }

    const configPath = path.resolve(root, configRelativePath);
    if (!(await pathExists(configPath))) {
      diagnostics.push(`TypeScript project reference is missing: ${configRelativePath}.`);
      continue;
    }

    const config = await readJsonFile(configPath);
    const output = decodeOutputMode(configRelativePath, config);
    if (typeof output === "string") {
      diagnostics.push(output);
      continue;
    }

    if (output.kind === "package-dist") {
      const projectRoot = path.dirname(configPath);
      const expectedDist = path.join(projectRoot, "dist");
      const resolvedOutput = path.resolve(projectRoot, output.outDir);
      if (
        !(await resolvesInside(projectRoot, output.outDir)) ||
        (resolvedOutput !== expectedDist &&
          !resolvedOutput.startsWith(`${expectedDist}${path.sep}`))
      ) {
        diagnostics.push(
          `${configRelativePath} must emit inside its package-local dist directory.`,
        );
      }
    }
  }

  return diagnostics;
}

function decodeOutputMode(
  configPath: string,
  value: unknown,
): ProjectOutputMode | string {
  if (!isRecord(value) || !isRecord(value.compilerOptions)) {
    return `${configPath} must contain compilerOptions.`;
  }

  const noEmit = value.compilerOptions.noEmit;
  const outDir = value.compilerOptions.outDir;
  if (noEmit !== undefined && typeof noEmit !== "boolean") {
    return `${configPath} compilerOptions.noEmit must be a boolean.`;
  }
  if (
    outDir !== undefined &&
    (typeof outDir !== "string" || outDir.trim().length === 0)
  ) {
    return `${configPath} compilerOptions.outDir must be a non-empty string.`;
  }
  if (noEmit === true && outDir !== undefined) {
    return `${configPath} must select noEmit or outDir, not both.`;
  }
  if (noEmit === true) {
    return { kind: "no-emit" };
  }
  if (typeof outDir === "string") {
    return { kind: "package-dist", outDir };
  }
  return `${configPath} must set noEmit: true or a package-local dist outDir.`;
}

function isProjectReference(value: unknown): value is TypeScriptProjectReference {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    value.path.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
