import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeContextRegistry,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";

import { exists } from "./workspace.js";
import { checkContextGovernance } from "./context-governance.js";

export const CONTEXT_REGISTRY_SOURCE_PATH = "registry/registry.source.json";
export const CONTEXT_REGISTRY_OUTPUT_PATH = "registry/registry.json";

interface RegistrySourceCatalog {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly decisionPath: string;
  readonly components: readonly RegistrySourceComponent[];
}

interface RegistrySourceComponent {
  readonly name: unknown;
  readonly dependencies: unknown;
  readonly capabilities: unknown;
  readonly licenses: unknown;
  readonly artifacts: readonly RegistrySourceArtifact[];
}

type RegistrySourceArtifact = RegistryDirectArtifact | RegistryDirectoryArtifact;

interface RegistryDirectArtifact {
  readonly kind: "artifact";
  readonly fields: Readonly<Record<string, unknown>>;
}

interface RegistryDirectoryArtifact {
  readonly kind: "directory";
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly excludedPrefixes: readonly string[];
  readonly excludedPaths: readonly string[];
}

export async function buildContextRegistry(root: string): Promise<ContextRegistryV2> {
  const resolvedRoot = await realpath(root);
  const sourcePath = repositoryPath(resolvedRoot, CONTEXT_REGISTRY_SOURCE_PATH);
  const catalog = decodeRegistrySourceCatalog(await readJson(sourcePath, "Registry source catalog"));
  if (!(await exists(repositoryPath(resolvedRoot, catalog.decisionPath)))) {
    throw new Error(`Registry decision does not exist: ${catalog.decisionPath}.`);
  }

  const components: Array<Readonly<Record<string, unknown>>> = [];
  for (const component of catalog.components) {
    const artifacts: Array<Readonly<Record<string, unknown>>> = [];
    for (const declaration of component.artifacts) {
      if (declaration.kind === "artifact") {
        const sourcePathValue = requiredString(declaration.fields, "sourcePath");
        const bytes = await readSourceBytes(resolvedRoot, sourcePathValue);
        artifacts.push({
          ...declaration.fields,
          sourceSha256: contentHash(bytes),
        });
        continue;
      }
      const sourceDirectory = repositoryPath(resolvedRoot, declaration.sourceDirectory);
      const files = await listFiles(sourceDirectory);
      for (const relativeFile of files) {
        const portableRelativeFile = portablePath(relativeFile);
        if (
          declaration.excludedPaths.includes(portableRelativeFile) ||
          declaration.excludedPrefixes.some((prefix) => portableRelativeFile.startsWith(prefix))
        ) {
          continue;
        }
        const sourcePathValue = joinPortable(declaration.sourceDirectory, portableRelativeFile);
        const targetPath = joinPortable(declaration.targetDirectory, portableRelativeFile);
        const bytes = await readSourceBytes(resolvedRoot, sourcePathValue);
        artifacts.push({
          operation: "file",
          sourcePath: sourcePathValue,
          sourceSha256: contentHash(bytes),
          targetPath,
          mediaType: mediaTypeFor(targetPath),
        });
      }
    }
    components.push({
      name: component.name,
      dependencies: component.dependencies,
      capabilities: component.capabilities,
      licenses: component.licenses,
      artifacts,
    });
  }

  const registry = decodeContextRegistry({
    schemaVersion: 2,
    revision: catalog.revision,
    decisionPath: catalog.decisionPath,
    components,
  });
  validateNoticeCoverage(registry);
  await validatePackagedMarkdownReferences(resolvedRoot, registry);
  return registry;
}

export async function writeContextRegistry(root: string): Promise<ContextRegistryV2> {
  const registry = await buildContextRegistry(root);
  const outputPath = repositoryPath(await realpath(root), CONTEXT_REGISTRY_OUTPUT_PATH);
  await writeFile(outputPath, serializeRegistry(registry), "utf8");
  return registry;
}

export async function checkContextRegistry(root: string): Promise<ContextRegistryV2> {
  const registry = await buildContextRegistry(root);
  const outputPath = repositoryPath(await realpath(root), CONTEXT_REGISTRY_OUTPUT_PATH);
  const current = await readStrictUtf8(outputPath, "Built context registry");
  if (current !== serializeRegistry(registry)) {
    throw new Error(`Built context registry is stale. Run pnpm registry:build.`);
  }
  await checkContextGovernance(await realpath(root), registry);
  return registry;
}

function decodeRegistrySourceCatalog(value: unknown): RegistrySourceCatalog {
  const record = strictRecord(value, "Registry source catalog", [
    "schemaVersion",
    "revision",
    "decisionPath",
    "components",
  ]);
  if (record.schemaVersion !== 1) throw new Error("Registry source catalog schemaVersion must be 1.");
  const components = decodeArray(record.components, "Registry source components", decodeSourceComponent);
  return {
    schemaVersion: 1,
    revision: requiredString(record, "revision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    components,
  };
}

function decodeSourceComponent(value: unknown): RegistrySourceComponent {
  const record = strictRecord(value, "Registry source component", [
    "name",
    "dependencies",
    "capabilities",
    "licenses",
    "artifacts",
  ]);
  return {
    name: record.name,
    dependencies: record.dependencies,
    capabilities: record.capabilities,
    licenses: record.licenses,
    artifacts: decodeArray(record.artifacts, "Registry source artifacts", decodeSourceArtifact),
  };
}

function decodeSourceArtifact(value: unknown): RegistrySourceArtifact {
  if (!isRecord(value)) throw new Error("Registry source artifact must be an object.");
  if (value.kind === "directory") {
    const record = strictRecord(value, "Registry directory artifact", [
      "kind",
      "sourceDirectory",
      "targetDirectory",
      "excludedPrefixes",
      "excludedPaths",
    ]);
    const excludedPrefixes = decodeArray(
      record.excludedPrefixes,
      "Registry directory excludedPrefixes",
      (candidate) => normalizedPrefix(candidate),
    );
    const excludedPaths = record.excludedPaths === undefined
      ? []
      : decodeArray(
          record.excludedPaths,
          "Registry directory excludedPaths",
          (candidate) => portablePathValue(candidate, "Registry excluded path"),
        );
    return {
      kind: "directory",
      sourceDirectory: portableRelativePath(record, "sourceDirectory"),
      targetDirectory: portableRelativePath(record, "targetDirectory"),
      excludedPrefixes,
      excludedPaths,
    };
  }
  if (value.kind !== "artifact") {
    throw new Error("Registry source artifact kind must be artifact or directory.");
  }
  const fields = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "kind"));
  if (Object.keys(fields).length === 0) throw new Error("Direct registry artifact must not be empty.");
  if ("sourceSha256" in fields) {
    throw new Error("Registry source artifacts cannot declare sourceSha256; the builder derives it.");
  }
  return { kind: "artifact", fields };
}

function validateNoticeCoverage(registry: ContextRegistryV2): void {
  for (const component of registry.components) {
    const targets = new Set(component.artifacts.map((artifact) => artifact.targetPath));
    for (const license of component.licenses) {
      if (license.kind === "third-party" && !targets.has(license.noticePath)) {
        throw new Error(
          `Component ${component.name} does not install declared notice ${license.noticePath}.`,
        );
      }
    }
  }
}

async function validatePackagedMarkdownReferences(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const packagedSources = new Set(
    registry.components.flatMap((component) => component.artifacts.map((artifact) => artifact.sourcePath)),
  );
  for (const sourcePath of [...packagedSources].sort()) {
    if (path.posix.extname(sourcePath).toLowerCase() !== ".md") continue;
    const source = await readStrictUtf8(repositoryPath(root, sourcePath), sourcePath);
    const links = source.matchAll(/\]\((?!https?:\/\/|mailto:|#)([^)#]+)(?:#[^)]*)?\)/gu);
    for (const link of links) {
      const reference = link[1];
      if (!reference) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), reference));
      if (resolved.startsWith("../") || !packagedSources.has(resolved)) {
        throw new Error(`Packaged Markdown reference is unresolved: ${sourcePath} -> ${reference}.`);
      }
    }
  }
}

async function listFiles(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Registry directories cannot contain symbolic links: ${absolute}.`);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        result.push(path.relative(root, absolute));
      }
    }
  };
  await visit(root);
  return result.sort((left, right) => portablePath(left).localeCompare(portablePath(right)));
}

async function readSourceBytes(root: string, relativePath: string): Promise<Uint8Array> {
  const absolute = repositoryPath(root, relativePath);
  const state = await lstat(absolute);
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error(`Registry source must be a regular file: ${relativePath}.`);
  }
  const bytes = await readFile(absolute);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`Registry source must be UTF-8 without a byte-order mark: ${relativePath}.`);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Registry source must be valid UTF-8: ${relativePath}.`, { cause: error });
  }
  return bytes;
}

function contentHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function mediaTypeFor(targetPath: string): string {
  switch (path.posix.extname(targetPath).toLowerCase()) {
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".md":
      return "text/markdown";
    case ".py":
      return "text/x-python";
    case ".toml":
      return "application/toml";
    default:
      return "text/plain";
  }
}

function serializeRegistry(registry: ContextRegistryV2): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

async function readJson(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readStrictUtf8(candidate, label)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON.`, { cause: error });
    throw error;
  }
}

async function readStrictUtf8(candidate: string, label: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must be UTF-8 without a byte-order mark.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8.`, { cause: error });
  }
}

function repositoryPath(root: string, candidate: string): string {
  if (path.isAbsolute(candidate) || candidate.includes("\\")) {
    throw new Error(`Repository path must be normalized and relative: ${candidate}.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Repository path escapes the root: ${candidate}.`);
  }
  return resolved;
}

function portableRelativePath(record: Readonly<Record<string, unknown>>, key: string): string {
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

function normalizedPrefix(value: unknown): string {
  if (typeof value !== "string" || !value.endsWith("/")) {
    throw new Error("Registry excluded prefix must be a normalized directory prefix ending in slash.");
  }
  portableRelativePath({ value: value.slice(0, -1) }, "value");
  return value;
}

function portablePathValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return portableRelativePath({ value }, "value");
}

function joinPortable(parent: string, child: string): string {
  return `${parent.replace(/\/$/u, "")}/${child.replace(/^\//u, "")}`;
}

function portablePath(candidate: string): string {
  return candidate.replaceAll("\\", "/");
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function decodeArray<T>(value: unknown, label: string, decode: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}
