import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ContextRegistryV2 } from "@agent-context/repo-policy";

export const CONTEXT_GOVERNANCE_PATH = "registry/context-governance.json";

interface ContextGovernanceManifest {
  readonly schemaVersion: 1;
  readonly registryRevision: string;
  readonly decisionPath: string;
  readonly protectedSources: readonly ProtectedSource[];
  readonly projections: readonly ProtectedProjection[];
}

interface ProtectedSource {
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly sha256: string;
}

interface ProtectedProjection {
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly heading: string;
}

export async function checkContextGovernance(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const manifest = decodeManifest(await readJson(repositoryPath(root, CONTEXT_GOVERNANCE_PATH)));
  if (manifest.registryRevision !== registry.revision) {
    throw new Error(
      `Context governance revision ${manifest.registryRevision} does not match registry ${registry.revision}.`,
    );
  }
  if (manifest.decisionPath !== registry.decisionPath) {
    throw new Error("Context governance and registry must name the same decision record.");
  }
  await readStrictUtf8(repositoryPath(root, manifest.decisionPath), "Context governance decision");

  const protectedByPath = new Map<string, ProtectedSource>();
  for (const source of manifest.protectedSources) {
    const content = await readStrictUtf8(repositoryPath(root, source.sourcePath), source.sourcePath);
    const actual = contentHash(content);
    if (actual !== source.sha256) {
      throw new Error(
        `Protected context source changed without a governance decision update: ${source.sourcePath}.`,
      );
    }
    protectedByPath.set(source.sourcePath, source);
  }

  for (const projection of manifest.projections) {
    const protectedSource = protectedByPath.get(projection.sourcePath);
    if (!protectedSource || protectedSource.invariantId !== projection.invariantId) {
      throw new Error(`Projection ${projection.invariantId} does not name its protected source.`);
    }
    const source = normalizeLf(await readStrictUtf8(
      repositoryPath(root, projection.sourcePath),
      projection.sourcePath,
    ));
    const target = normalizeLf(await readStrictUtf8(
      repositoryPath(root, projection.targetPath),
      projection.targetPath,
    ));
    const region = markdownHeadingRegion(target, projection.heading, projection.targetPath);
    if (region !== source) {
      throw new Error(
        `Protected context projection differs from ${projection.sourcePath}: ${projection.targetPath} ${projection.heading}.`,
      );
    }
  }

  const protectedPaths = new Set(manifest.protectedSources.map((source) => source.sourcePath));
  for (const component of registry.components) {
    for (const artifact of component.artifacts) {
      if (artifact.operation === "text-section" && !protectedPaths.has(artifact.sourcePath)) {
        throw new Error(`Text instruction artifact is not protected by governance: ${artifact.sourcePath}.`);
      }
    }
  }
}

function markdownHeadingRegion(document: string, heading: string, targetPath: string): string {
  if (!/^#{1,6}\s+\S/u.test(heading)) throw new Error(`Invalid governed heading: ${heading}.`);
  const start = document.indexOf(`${heading}\n`);
  if (start < 0 || document.indexOf(`${heading}\n`, start + heading.length + 1) >= 0) {
    throw new Error(`Governed heading must occur exactly once in ${targetPath}: ${heading}.`);
  }
  const level = heading.indexOf(" ");
  const afterHeading = start + heading.length + 1;
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, "gmu");
  nextHeading.lastIndex = afterHeading;
  const next = nextHeading.exec(document);
  const end = next?.index ?? document.length;
  return document.slice(start, end).replace(/\n+$/u, "\n");
}

function decodeManifest(value: unknown): ContextGovernanceManifest {
  const record = strictRecord(value, "Context governance manifest", [
    "schemaVersion", "registryRevision", "decisionPath", "protectedSources", "projections",
  ]);
  if (record.schemaVersion !== 1) throw new Error("Context governance schemaVersion must be 1.");
  const protectedSources = decodeArray(record.protectedSources, "protectedSources", decodeProtectedSource);
  const projections = decodeArray(record.projections, "projections", decodeProjection);
  requireUnique(protectedSources.map((item) => item.invariantId), "protected invariant IDs");
  requireUnique(protectedSources.map((item) => item.sourcePath), "protected source paths");
  return {
    schemaVersion: 1,
    registryRevision: requiredString(record, "registryRevision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    protectedSources,
    projections,
  };
}

function decodeProtectedSource(value: unknown): ProtectedSource {
  const record = strictRecord(value, "Protected context source", ["invariantId", "sourcePath", "sha256"]);
  const sha256 = requiredString(record, "sha256");
  if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new Error("Protected source sha256 must be a lowercase SHA-256 hash.");
  return {
    invariantId: identifier(record, "invariantId"),
    sourcePath: portableRelativePath(record, "sourcePath"),
    sha256,
  };
}

function decodeProjection(value: unknown): ProtectedProjection {
  const record = strictRecord(value, "Protected context projection", [
    "invariantId", "sourcePath", "targetPath", "heading",
  ]);
  return {
    invariantId: identifier(record, "invariantId"),
    sourcePath: portableRelativePath(record, "sourcePath"),
    targetPath: portableRelativePath(record, "targetPath"),
    heading: requiredString(record, "heading"),
  };
}

async function readJson(candidate: string): Promise<unknown> {
  const source = await readStrictUtf8(candidate, CONTEXT_GOVERNANCE_PATH);
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error("Context governance manifest must contain valid JSON.", { cause: error });
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
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (path.isAbsolute(candidate) || candidate.includes("\\") || relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Context governance path escapes the repository: ${candidate}.`);
  }
  return resolved;
}

function portableRelativePath(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${key} must be a normalized repository-relative path.`);
  }
  return value;
}

function strictRecord(value: unknown, label: string, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Readonly<Record<string, unknown>>;
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  return record;
}

function decodeArray<T>(value: unknown, label: string, decode: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function identifier(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) throw new Error(`${key} must be kebab-case.`);
  return value;
}

function requireUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} contain duplicate ${duplicate}.`);
}

function normalizeLf(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
