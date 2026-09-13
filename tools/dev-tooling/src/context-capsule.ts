import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from "node:zlib";

import {
  CONTEXT_ADAPTER,
  CONTEXT_CAPSULE_FORMAT as CONTEXT_CAPSULE_FORMAT_VALUE,
  CONTEXT_INSTALLATION_SCHEMA_VERSION,
  artifactIdentity,
  decodeContextProjectConfig,
  decodeContextRegistry,
  resolveContextComponents,
  type ContextCapsuleActivationLock,
  type ContextRegistryArtifact,
  type ContextRegistryComponent,
} from "@agent-context/repo-policy";

import { createArtifactProjection } from "./context-artifact-projection.js";
import { loadContextRegistry } from "./context-installer.js";

export const CONTEXT_CAPSULE_FORMAT = CONTEXT_CAPSULE_FORMAT_VALUE;
export const CONTEXT_CAPSULE_SCHEMA_VERSION = 2 as const;
export const CONTEXT_CAPSULE_MAGIC = Buffer.from("ACFCAP2\n", "ascii");
export const CONTEXT_CAPSULE_RUNTIME_SOURCE_PREFIX = ".codex/acf/runtime-source/";
export const CONTEXT_CAPSULE_SKILL_SOURCE_PREFIX = ".codex/skills/";

export interface ContextCapsuleRegistryV1 {
  readonly schemaVersion: typeof CONTEXT_INSTALLATION_SCHEMA_VERSION;
  readonly revision: string;
  readonly decisionPath: string;
}

export interface ContextCapsuleSelectionV1 {
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly ContextRegistryComponent[];
}

export interface ContextCapsuleEntryV1 {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly byteLength: number;
  readonly contentBase64: string;
}

export interface ContextCapsulePayloadV2 {
  readonly schemaVersion: typeof CONTEXT_CAPSULE_SCHEMA_VERSION;
  readonly format: typeof CONTEXT_CAPSULE_FORMAT;
  readonly frameworkRevision: string;
  readonly registry: ContextCapsuleRegistryV1;
  readonly selection: ContextCapsuleSelectionV1;
  readonly entries: readonly ContextCapsuleEntryV1[];
  readonly activation: readonly ContextCapsuleActivationLock[];
  readonly treeSha256: string;
}

export interface BuiltContextCapsule {
  readonly bytes: Buffer;
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly capsuleBytes: number;
  readonly payloadBytes: number;
  readonly entryCount: number;
  readonly payload: ContextCapsulePayloadV2;
}

export interface ContextCapsuleBuildRequest {
  readonly frameworkRoot: string;
  readonly frameworkRevision: string;
  readonly directComponents: readonly string[];
}

export interface ContextCapsuleInspection {
  readonly format: typeof CONTEXT_CAPSULE_FORMAT;
  readonly schemaVersion: typeof CONTEXT_CAPSULE_SCHEMA_VERSION;
  readonly capsuleSha256: string;
  readonly treeSha256: string;
  readonly frameworkRevision: string;
  readonly registryRevision: string;
  readonly directComponents: readonly string[];
  readonly resolvedComponents: readonly {
    name: string;
    revision: string;
  }[];
  readonly entries: readonly {
    sourcePath: string;
    sourceSha256: string;
    byteLength: number;
  }[];
  readonly capsuleBytes: number;
  readonly payloadBytes: number;
}

export interface ContextCapsuleDiff {
  readonly equal: boolean;
  readonly directSelectionChanged: boolean;
  readonly beforeDirectComponents: readonly string[];
  readonly afterDirectComponents: readonly string[];
  readonly addedComponents: readonly string[];
  readonly removedComponents: readonly string[];
  readonly changedComponents: readonly {
    name: string;
    beforeRevision: string;
    afterRevision: string;
  }[];
  readonly addedEntries: readonly string[];
  readonly removedEntries: readonly string[];
  readonly changedEntries: readonly {
    sourcePath: string;
    beforeSha256: string;
    afterSha256: string;
  }[];
}

export async function buildContextCapsule(
  request: ContextCapsuleBuildRequest,
): Promise<BuiltContextCapsule> {
  requireFrameworkRevision(request.frameworkRevision);
  const frameworkRoot = await realpath(request.frameworkRoot);
  const registry = await loadContextRegistry(frameworkRoot);
  const resolvedComponents = resolveContextComponents(
    registry,
    decodeDirectComponents(request.directComponents),
  );
  const entries = await loadCapsuleEntries(frameworkRoot, resolvedComponents);
  const registrySummary: ContextCapsuleRegistryV1 = {
    schemaVersion: registry.schemaVersion,
    revision: registry.revision,
    decisionPath: registry.decisionPath,
  };
  const selection: ContextCapsuleSelectionV1 = {
    directComponents: [...request.directComponents],
    resolvedComponents,
  };
  const activation = capsuleActivation(resolvedComponents, entries);
  return buildCapsule({
    schemaVersion: CONTEXT_CAPSULE_SCHEMA_VERSION,
    format: CONTEXT_CAPSULE_FORMAT,
    frameworkRevision: request.frameworkRevision,
    registry: registrySummary,
    selection,
    entries,
    activation,
  });
}

export function replaceContextCapsuleActivation(
  capsule: BuiltContextCapsule,
  activation: readonly ContextCapsuleActivationLock[],
): BuiltContextCapsule {
  const sortedActivation = [...activation].sort((left, right) =>
    compareStrings(left.identity, right.identity));
  validateCapsuleActivation(
    capsule.payload.selection.resolvedComponents,
    capsule.payload.entries,
    sortedActivation,
  );
  return buildCapsule({
    schemaVersion: capsule.payload.schemaVersion,
    format: capsule.payload.format,
    frameworkRevision: capsule.payload.frameworkRevision,
    registry: capsule.payload.registry,
    selection: capsule.payload.selection,
    entries: capsule.payload.entries,
    activation: sortedActivation,
  });
}

function buildCapsule(
  payloadWithoutTree: Omit<ContextCapsulePayloadV2, "treeSha256">,
): BuiltContextCapsule {
  const treeSha256 = hashCanonicalJson(treeDescriptor(
    payloadWithoutTree.registry,
    payloadWithoutTree.selection,
    payloadWithoutTree.entries,
    payloadWithoutTree.activation,
  ));
  const payload: ContextCapsulePayloadV2 = { ...payloadWithoutTree, treeSha256 };
  const payloadText = canonicalJson(payload);
  const payloadBytes = Buffer.from(payloadText, "utf8");
  const compressed = brotliCompressSync(payloadBytes, {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_LGWIN]: 22,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: payloadBytes.length,
    },
  });
  const bytes = Buffer.concat([CONTEXT_CAPSULE_MAGIC, compressed]);
  return {
    bytes,
    capsuleSha256: hashBytes(bytes),
    treeSha256,
    capsuleBytes: bytes.length,
    payloadBytes: payloadBytes.length,
    entryCount: payload.entries.length,
    payload,
  };
}

export function readContextCapsule(bytes: Uint8Array): BuiltContextCapsule {
  const capsuleBytes = Buffer.from(bytes);
  if (
    capsuleBytes.length <= CONTEXT_CAPSULE_MAGIC.length ||
    !capsuleBytes.subarray(0, CONTEXT_CAPSULE_MAGIC.length).equals(CONTEXT_CAPSULE_MAGIC)
  ) {
    throw new Error("Context capsule must begin with the ACFCAP2 header.");
  }
  let payloadBytes: Buffer;
  try {
    payloadBytes = brotliDecompressSync(capsuleBytes.subarray(CONTEXT_CAPSULE_MAGIC.length));
  } catch (error) {
    throw new Error("Context capsule Brotli payload is invalid.", { cause: error });
  }
  let payloadText: string;
  try {
    payloadText = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
  } catch (error) {
    throw new Error("Context capsule payload must be valid UTF-8.", { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText) as unknown;
  } catch (error) {
    throw new Error("Context capsule payload must be valid JSON.", { cause: error });
  }
  if (canonicalJson(parsed) !== payloadText) {
    throw new Error("Context capsule payload must use canonical JSON.");
  }
  const payload = decodeContextCapsulePayload(parsed);
  return {
    bytes: capsuleBytes,
    capsuleSha256: hashBytes(capsuleBytes),
    treeSha256: payload.treeSha256,
    capsuleBytes: capsuleBytes.length,
    payloadBytes: payloadBytes.length,
    entryCount: payload.entries.length,
    payload,
  };
}

export async function readContextCapsuleFile(candidate: string): Promise<BuiltContextCapsule> {
  return readContextCapsule(await readFile(candidate));
}

export async function writeContextCapsuleFile(
  candidate: string,
  capsule: BuiltContextCapsule,
): Promise<void> {
  await writeExclusiveFileAtomically(candidate, capsule.bytes, "Context capsule");
}

export function inspectContextCapsule(capsule: BuiltContextCapsule): ContextCapsuleInspection {
  return {
    format: capsule.payload.format,
    schemaVersion: capsule.payload.schemaVersion,
    capsuleSha256: capsule.capsuleSha256,
    treeSha256: capsule.treeSha256,
    frameworkRevision: capsule.payload.frameworkRevision,
    registryRevision: capsule.payload.registry.revision,
    directComponents: capsule.payload.selection.directComponents,
    resolvedComponents: capsule.payload.selection.resolvedComponents.map((component) => ({
      name: component.name,
      revision: component.revision,
    })),
    entries: capsule.payload.entries.map((entry) => ({
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      byteLength: entry.byteLength,
    })),
    capsuleBytes: capsule.capsuleBytes,
    payloadBytes: capsule.payloadBytes,
  };
}

export function diffContextCapsules(
  before: BuiltContextCapsule,
  after: BuiltContextCapsule,
): ContextCapsuleDiff {
  const beforeComponents = new Map(
    before.payload.selection.resolvedComponents.map((component) => [component.name, component]),
  );
  const afterComponents = new Map(
    after.payload.selection.resolvedComponents.map((component) => [component.name, component]),
  );
  const beforeEntries = new Map(before.payload.entries.map((entry) => [entry.sourcePath, entry]));
  const afterEntries = new Map(after.payload.entries.map((entry) => [entry.sourcePath, entry]));
  const addedComponents = sortedDifference(afterComponents.keys(), beforeComponents);
  const removedComponents = sortedDifference(beforeComponents.keys(), afterComponents);
  const changedComponents = [...beforeComponents.entries()]
    .flatMap(([name, component]) => {
      const next = afterComponents.get(name);
      return next !== undefined && next.revision !== component.revision
        ? [{ name, beforeRevision: component.revision, afterRevision: next.revision }]
        : [];
    })
    .sort((left, right) => compareStrings(left.name, right.name));
  const addedEntries = sortedDifference(afterEntries.keys(), beforeEntries);
  const removedEntries = sortedDifference(beforeEntries.keys(), afterEntries);
  const changedEntries = [...beforeEntries.entries()]
    .flatMap(([sourcePath, entry]) => {
      const next = afterEntries.get(sourcePath);
      return next !== undefined && next.sourceSha256 !== entry.sourceSha256
        ? [{
            sourcePath,
            beforeSha256: entry.sourceSha256,
            afterSha256: next.sourceSha256,
          }]
        : [];
    })
    .sort((left, right) => compareStrings(left.sourcePath, right.sourcePath));
  const directSelectionChanged = !sameValues(
    before.payload.selection.directComponents,
    after.payload.selection.directComponents,
  );
  return {
    equal: !directSelectionChanged &&
      addedComponents.length === 0 &&
      removedComponents.length === 0 &&
      changedComponents.length === 0 &&
      addedEntries.length === 0 &&
      removedEntries.length === 0 &&
      changedEntries.length === 0,
    directSelectionChanged,
    beforeDirectComponents: before.payload.selection.directComponents,
    afterDirectComponents: after.payload.selection.directComponents,
    addedComponents,
    removedComponents,
    changedComponents,
    addedEntries,
    removedEntries,
    changedEntries,
  };
}

export async function extractContextCapsule(
  capsule: BuiltContextCapsule,
  outputRoot: string,
): Promise<readonly string[]> {
  const targetRoot = path.resolve(outputRoot);
  await requireMissingPath(targetRoot, "Context capsule extraction target");
  await prepareRealParent(targetRoot, "Context capsule extraction parent");
  await mkdir(targetRoot);
  try {
    for (const entry of capsule.payload.entries) {
      const target = containedPath(targetRoot, entry.sourcePath, "Context capsule entry");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, decodeEntryBytes(entry), { flag: "wx" });
    }
  } catch (error) {
    await rm(targetRoot, { recursive: true, force: true });
    throw error;
  }
  return capsule.payload.entries.map((entry) => entry.sourcePath);
}

export function contextCapsuleEntryBytes(
  capsule: BuiltContextCapsule,
  sourcePath: string,
): Buffer {
  const entry = capsule.payload.entries.find((candidate) => candidate.sourcePath === sourcePath);
  if (entry === undefined) throw new Error(`Context capsule does not contain ${sourcePath}.`);
  return decodeEntryBytes(entry);
}

function decodeContextCapsulePayload(value: unknown): ContextCapsulePayloadV2 {
  const record = strictObject(value, "Context capsule payload", [
    "schemaVersion",
    "format",
    "frameworkRevision",
    "registry",
    "selection",
    "entries",
    "activation",
    "treeSha256",
  ]);
  if (record.schemaVersion !== CONTEXT_CAPSULE_SCHEMA_VERSION) {
    throw new Error(`Context capsule schemaVersion must be ${CONTEXT_CAPSULE_SCHEMA_VERSION}.`);
  }
  if (record.format !== CONTEXT_CAPSULE_FORMAT) {
    throw new Error(`Context capsule format must be ${CONTEXT_CAPSULE_FORMAT}.`);
  }
  const frameworkRevision = requiredString(record.frameworkRevision, "Context capsule frameworkRevision");
  requireFrameworkRevision(frameworkRevision);
  const registryRecord = strictObject(record.registry, "Context capsule registry", [
    "schemaVersion",
    "revision",
    "decisionPath",
  ]);
  const selectionRecord = strictObject(record.selection, "Context capsule selection", [
    "directComponents",
    "resolvedComponents",
  ]);
  const directComponents = decodeDirectComponents(
    requiredArray(selectionRecord.directComponents, "Context capsule directComponents")
      .map((component) => requiredString(component, "Context capsule direct component")),
  );
  const registry = decodeContextRegistry({
    schemaVersion: registryRecord.schemaVersion,
    revision: registryRecord.revision,
    decisionPath: registryRecord.decisionPath,
    components: selectionRecord.resolvedComponents,
  });
  const resolved = resolveContextComponents(registry, directComponents);
  if (!sameValues(
    resolved.map((component) => component.name),
    registry.components.map((component) => component.name),
  )) {
    throw new Error("Context capsule resolvedComponents must be the exact dependency-first closure.");
  }
  const entries = requiredArray(record.entries, "Context capsule entries").map(decodeCapsuleEntry);
  requireSortedUnique(
    entries.map((entry) => entry.sourcePath),
    "Context capsule entry source paths",
  );
  const entriesByPath = new Map(entries.map((entry) => [entry.sourcePath, entry]));
  const artifactIdentities = new Set<string>();
  for (const component of resolved) {
    for (const artifact of component.artifacts) {
      const identity = artifactIdentity(artifact);
      if (artifactIdentities.has(identity)) {
        throw new Error(`Context capsule contains duplicate artifact identity ${identity}.`);
      }
      artifactIdentities.add(identity);
      const entry = entriesByPath.get(artifact.sourcePath);
      if (entry === undefined) {
        throw new Error(
          `Context capsule is missing source ${artifact.sourcePath} for component ${component.name}.`,
        );
      }
      if (entry.sourceSha256 !== artifact.sourceSha256) {
        throw new Error(
          `Context capsule source ${artifact.sourcePath} does not match component ${component.name}.`,
        );
      }
    }
  }
  const referencedPaths = new Set(
    resolved.flatMap((component) => component.artifacts.map((artifact) => artifact.sourcePath)),
  );
  const extra = entries.find((entry) => !referencedPaths.has(entry.sourcePath));
  if (extra !== undefined) {
    throw new Error(`Context capsule contains unreferenced source ${extra.sourcePath}.`);
  }
  const registrySummary: ContextCapsuleRegistryV1 = {
    schemaVersion: registry.schemaVersion,
    revision: registry.revision,
    decisionPath: registry.decisionPath,
  };
  const selection: ContextCapsuleSelectionV1 = {
    directComponents,
    resolvedComponents: registry.components,
  };
  const activation = requiredArray(
    record.activation,
    "Context capsule activation",
  ).map(decodeCapsuleActivation);
  requireSortedUnique(
    activation.map((entry) => entry.identity),
    "Context capsule activation identities",
  );
  validateCapsuleActivation(registry.components, entries, activation);
  const expectedTreeSha256 = hashCanonicalJson(
    treeDescriptor(registrySummary, selection, entries, activation),
  );
  const treeSha256 = requiredSha256(record.treeSha256, "Context capsule treeSha256");
  if (treeSha256 !== expectedTreeSha256) {
    throw new Error(
      `Context capsule tree hash mismatch: expected ${expectedTreeSha256}, got ${treeSha256}.`,
    );
  }
  return {
    schemaVersion: CONTEXT_CAPSULE_SCHEMA_VERSION,
    format: CONTEXT_CAPSULE_FORMAT,
    frameworkRevision,
    registry: registrySummary,
    selection,
    entries,
    activation,
    treeSha256,
  };
}

function decodeCapsuleActivation(value: unknown): ContextCapsuleActivationLock {
  const record = strictObject(value, "Context capsule activation record", [
    "identity",
    "targetPath",
    "installedSha256",
  ]);
  return {
    identity: requiredString(record.identity, "Context capsule activation identity"),
    targetPath: portableRelativePath(record.targetPath, "Context capsule activation targetPath"),
    installedSha256: requiredSha256(
      record.installedSha256,
      "Context capsule activation installedSha256",
    ),
  };
}

function decodeCapsuleEntry(value: unknown): ContextCapsuleEntryV1 {
  const record = strictObject(value, "Context capsule entry", [
    "sourcePath",
    "sourceSha256",
    "byteLength",
    "contentBase64",
  ]);
  const sourcePath = portableRelativePath(record.sourcePath, "Context capsule entry sourcePath");
  const sourceSha256 = requiredSha256(
    record.sourceSha256,
    `Context capsule entry ${sourcePath} sourceSha256`,
  );
  const byteLength = requiredNonnegativeSafeInteger(
    record.byteLength,
    `Context capsule entry ${sourcePath} byteLength`,
  );
  const contentBase64 = requiredStringAllowEmpty(
    record.contentBase64,
    `Context capsule entry ${sourcePath} contentBase64`,
  );
  const entry = { sourcePath, sourceSha256, byteLength, contentBase64 };
  decodeEntryBytes(entry);
  return entry;
}

function decodeEntryBytes(entry: ContextCapsuleEntryV1): Buffer {
  if (!isCanonicalBase64(entry.contentBase64)) {
    throw new Error(`Context capsule entry ${entry.sourcePath} contains invalid Base64.`);
  }
  const bytes = Buffer.from(entry.contentBase64, "base64");
  if (bytes.length !== entry.byteLength) {
    throw new Error(
      `Context capsule entry ${entry.sourcePath} byte length mismatch: expected ${entry.byteLength}, got ${bytes.length}.`,
    );
  }
  const digest = hashBytes(bytes);
  if (digest !== entry.sourceSha256) {
    throw new Error(
      `Context capsule entry ${entry.sourcePath} hash mismatch: expected ${entry.sourceSha256}, got ${digest}.`,
    );
  }
  return bytes;
}

async function loadCapsuleEntries(
  frameworkRoot: string,
  components: readonly ContextRegistryComponent[],
): Promise<readonly ContextCapsuleEntryV1[]> {
  const expected = new Map<string, string>();
  for (const component of components) {
    for (const artifact of component.artifacts) {
      const existing = expected.get(artifact.sourcePath);
      if (existing !== undefined && existing !== artifact.sourceSha256) {
        throw new Error(
          `Registry source ${artifact.sourcePath} has conflicting hashes in the selected closure.`,
        );
      }
      expected.set(artifact.sourcePath, artifact.sourceSha256);
    }
  }
  const entries: ContextCapsuleEntryV1[] = [];
  for (const [sourcePath, sourceSha256] of [...expected.entries()].sort(([left], [right]) =>
    compareStrings(left, right))) {
    const candidate = await secureExistingFile(
      frameworkRoot,
      sourcePath,
      `Registry source ${sourcePath}`,
    );
    const bytes = await readFile(candidate);
    const digest = hashBytes(bytes);
    if (digest !== sourceSha256) {
      throw new Error(
        `Registry source hash mismatch for ${sourcePath}: expected ${sourceSha256}, got ${digest}.`,
      );
    }
    entries.push({
      sourcePath,
      sourceSha256,
      byteLength: bytes.length,
      contentBase64: bytes.toString("base64"),
    });
  }
  return entries;
}

function treeDescriptor(
  registry: ContextCapsuleRegistryV1,
  selection: ContextCapsuleSelectionV1,
  entries: readonly ContextCapsuleEntryV1[],
  activation: readonly ContextCapsuleActivationLock[],
): unknown {
  return {
    registry,
    selection: {
      directComponents: selection.directComponents,
      resolvedComponents: selection.resolvedComponents,
    },
    entries: entries.map((entry) => ({
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      byteLength: entry.byteLength,
    })),
    activation,
  };
}

export function isContextCapsuleMaterializedArtifact(
  artifact: ContextRegistryArtifact,
): boolean {
  return artifact.targetPath.startsWith(CONTEXT_CAPSULE_SKILL_SOURCE_PREFIX) ||
    artifact.targetPath.startsWith(CONTEXT_CAPSULE_RUNTIME_SOURCE_PREFIX);
}

function capsuleActivation(
  components: readonly ContextRegistryComponent[],
  entries: readonly ContextCapsuleEntryV1[],
): readonly ContextCapsuleActivationLock[] {
  const byPath = new Map(entries.map((entry) => [entry.sourcePath, entry]));
  const activation: ContextCapsuleActivationLock[] = [];
  for (const component of components) {
    for (const artifact of component.artifacts) {
      if (isContextCapsuleMaterializedArtifact(artifact)) continue;
      const entry = byPath.get(artifact.sourcePath);
      if (entry === undefined) {
        throw new Error(`Context capsule activation source is missing: ${artifact.sourcePath}.`);
      }
      const source = decodeUtf8Text(
        decodeEntryBytes(entry),
        `Context capsule activation source ${artifact.sourcePath}`,
      );
      activation.push({
        identity: artifactIdentity(artifact),
        targetPath: artifact.targetPath,
        installedSha256: createArtifactProjection(artifact, source).sourceSha256,
      });
    }
  }
  return activation.sort((left, right) => compareStrings(left.identity, right.identity));
}

function validateCapsuleActivation(
  components: readonly ContextRegistryComponent[],
  entries: readonly ContextCapsuleEntryV1[],
  activation: readonly ContextCapsuleActivationLock[],
): void {
  const expected = capsuleActivation(components, entries);
  if (activation.length !== expected.length) {
    throw new Error("Context capsule activation must cover every tracked artifact exactly once.");
  }
  const artifacts = new Map<string, ContextRegistryArtifact>();
  for (const component of components) {
    for (const artifact of component.artifacts) {
      if (!isContextCapsuleMaterializedArtifact(artifact)) {
        artifacts.set(artifactIdentity(artifact), artifact);
      }
    }
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedEntry = expected[index]!;
    const actualEntry = activation[index]!;
    requiredSha256(actualEntry.installedSha256, "Context capsule activation installedSha256");
    if (
      actualEntry.identity !== expectedEntry.identity ||
      actualEntry.targetPath !== expectedEntry.targetPath
    ) {
      throw new Error("Context capsule activation identities and targets must match the selected closure.");
    }
    const artifact = artifacts.get(actualEntry.identity);
    if (artifact === undefined) {
      throw new Error(`Context capsule activation artifact is absent: ${actualEntry.identity}.`);
    }
    if (
      artifact.operation !== "seed-file" &&
      actualEntry.installedSha256 !== expectedEntry.installedSha256
    ) {
      throw new Error("Context capsule activation must match each managed artifact projection.");
    }
  }
}

function decodeDirectComponents(values: readonly string[]): readonly string[] {
  return decodeContextProjectConfig({
    schemaVersion: CONTEXT_INSTALLATION_SCHEMA_VERSION,
    adapter: CONTEXT_ADAPTER,
    components: values,
  }).components;
}

function canonicalJson(value: unknown): string {
  return canonicalJsonValue(value, new WeakSet<object>());
}

function canonicalJsonValue(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Canonical context capsule JSON numbers must be safe integers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error("Canonical context capsule JSON must not contain cycles.");
    }
    ancestors.add(value);
    try {
      const members: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new Error("Canonical context capsule JSON arrays must not be sparse.");
        }
        members.push(canonicalJsonValue(value[index], ancestors));
      }
      return `[${members.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value !== "object") {
    throw new Error("Canonical context capsule JSON contains an unsupported value.");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Canonical context capsule JSON objects must be plain records.");
  }
  if (ancestors.has(value)) {
    throw new Error("Canonical context capsule JSON must not contain cycles.");
  }
  ancestors.add(value);
  const record = value as Record<string, unknown>;
  try {
    return `{${Object.keys(record)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function hashCanonicalJson(value: unknown): string {
  return hashBytes(Buffer.from(canonicalJson(value), "utf8"));
}

function strictObject(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareStrings);
  const expected = [...keys].sort(compareStrings);
  if (!sameValues(actual, expected)) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
  return record;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requiredStringAllowEmpty(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function decodeUtf8Text(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must contain valid UTF-8.`, { cause: error });
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not begin with a UTF-8 BOM.`);
  return text;
}

function requiredSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requiredNonnegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function portableRelativePath(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  if (
    path.posix.isAbsolute(candidate) ||
    candidate.includes("\\") ||
    candidate.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized relative path.`);
  }
  return candidate;
}

function requireFrameworkRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error("Context capsule frameworkRevision must be a full lowercase Git revision.");
  }
}

function requireSortedUnique(values: readonly string[], label: string): void {
  const sorted = [...values].sort(compareStrings);
  if (!sameValues(values, sorted)) throw new Error(`${label} must be sorted.`);
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

async function secureExistingFile(root: string, relativePath: string, label: string): Promise<string> {
  const candidate = containedPath(root, relativePath, label);
  let current = path.resolve(root);
  for (const segment of path.relative(current, candidate).split(path.sep)) {
    current = path.join(current, segment);
    const state = await lstat(current);
    if (state.isSymbolicLink()) throw new Error(`${label} traverses symbolic link ${current}.`);
  }
  const state = await lstat(candidate);
  if (!state.isFile() || state.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
  return candidate;
}

function containedPath(root: string, relativePath: string, label: string): string {
  portableRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, candidate);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes its root.`);
  }
  return candidate;
}

async function writeExclusiveFileAtomically(
  candidate: string,
  bytes: Uint8Array,
  label: string,
): Promise<void> {
  const target = path.resolve(candidate);
  await requireMissingPath(target, label);
  const parent = await prepareRealParent(target, `${label} parent`);
  const stageRoot = await mkdtemp(path.join(parent, ".acf-write-"));
  const staged = path.join(stageRoot, path.basename(target));
  try {
    await writeFile(staged, bytes, { flag: "wx" });
    await link(staged, target);
    await unlink(staged);
    await rm(stageRoot, { recursive: true });
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

async function prepareRealParent(candidate: string, label: string): Promise<string> {
  const parent = path.dirname(candidate);
  await mkdir(parent, { recursive: true });
  const resolvedParent = await realpath(parent);
  if (!samePath(parent, resolvedParent)) throw new Error(`${label} must not traverse a symbolic link.`);
  return resolvedParent;
}

async function requireMissingPath(candidate: string, label: string): Promise<void> {
  try {
    await lstat(candidate);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists: ${candidate}.`);
}

function sortedDifference(
  values: Iterable<string>,
  excluded: ReadonlyMap<string, unknown>,
): readonly string[] {
  return [...values].filter((value) => !excluded.has(value)).sort(compareStrings);
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareStrings(left: string, right: string): number {
  const leftCodePoints = [...left].map((character) => character.codePointAt(0)!);
  const rightCodePoints = [...right].map((character) => character.codePointAt(0)!);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) {
      return leftCodePoints[index]! < rightCodePoints[index]! ? -1 : 1;
    }
  }
  return leftCodePoints.length < rightCodePoints.length
    ? -1
    : leftCodePoints.length > rightCodePoints.length
      ? 1
      : 0;
}

function samePath(left: string, right: string): boolean {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  return process.platform === "win32"
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
