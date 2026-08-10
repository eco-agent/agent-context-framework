import { createHash } from "node:crypto";

import type {
  ContextJsonArrayItemOwnership,
  ContextRegistryArtifact,
} from "@agent-context/repo-policy";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

export type ProjectedScope =
  | { readonly state: "absent" }
  | { readonly state: "present"; readonly sha256: string; readonly display: string }
  | { readonly state: "malformed"; readonly detail: string };

export interface ArtifactProjection {
  readonly sourceSha256: string;
  readonly sourceDisplay: string;
  read(target: string | null): ProjectedScope;
  install(target: string | null): string;
  replace(target: string): string;
  remove(target: string, preserveContent: boolean): string | null;
}

interface SectionLocation {
  readonly blockStart: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly blockEnd: number;
}

export function createArtifactProjection(
  artifact: ContextRegistryArtifact,
  source: string,
): ArtifactProjection {
  switch (artifact.operation) {
    case "file":
    case "runtime-workspace":
      return wholeFileProjection(source);
    case "seed-file":
      return seedFileProjection(source);
    case "text-section":
      return textSectionProjection(source, markerPair(artifact.sectionId, artifact.markerStyle));
    case "json-members":
      return jsonMembersProjection(source, artifact.ownedPointers);
    case "json-array-items":
      return jsonArrayItemsProjection(source, artifact.ownedItems);
    case "toml-tables":
      return tomlTablesProjection(source, artifact.ownedTables);
    case "toml-members":
      return tomlMembersProjection(source, artifact.ownedMembers);
  }
}

export function createArtifactRemovalProjection(
  artifact: ContextRegistryArtifact,
): ArtifactProjection {
  switch (artifact.operation) {
    case "file":
    case "runtime-workspace":
      return wholeFileProjection("");
    case "seed-file":
      return seedFileRemovalProjection();
    case "text-section": {
      const markers = markerPair(artifact.sectionId, artifact.markerStyle);
      return removalOnlyProjection(
        (target) => readMarkedScope(target, markers, (inner) => inner),
        (target, preserveContent) => removeMarkedSection(target, preserveContent, markers),
      );
    }
    case "json-members":
      return removalOnlyProjection(
        (target) => readJsonMembers(target, artifact.ownedPointers),
        (target, preserveContent) => removeJsonMembers(target, preserveContent, artifact.ownedPointers),
      );
    case "json-array-items":
      return removalOnlyProjection(
        (target) => readJsonArrayItems(target, artifact.ownedItems),
        (target, preserveContent) => removeJsonArrayItems(target, preserveContent, artifact.ownedItems),
      );
    case "toml-tables":
      return removalOnlyProjection(
        (target) => readTomlMembers(target, artifact.ownedTables),
        (target, preserveContent) => removeTomlMembers(target, preserveContent, artifact.ownedTables),
      );
    case "toml-members":
      return removalOnlyProjection(
        (target) => readTomlMembers(target, artifact.ownedMembers),
        (target, preserveContent) => removeTomlMembers(target, preserveContent, artifact.ownedMembers),
      );
  }
}

function removalOnlyProjection(
  read: ArtifactProjection["read"],
  remove: ArtifactProjection["remove"],
): ArtifactProjection {
  const unavailable = (): never => {
    throw new Error("An ownership-only projection cannot install or replace content.");
  };
  return {
    sourceSha256: "",
    sourceDisplay: "",
    read,
    install: unavailable,
    replace: unavailable,
    remove,
  };
}

function wholeFileProjection(source: string): ArtifactProjection {
  return {
    sourceSha256: contentHash(source),
    sourceDisplay: source,
    read: (target) => target === null
      ? { state: "absent" }
      : { state: "present", sha256: contentHash(target), display: target },
    install: () => source,
    replace: () => source,
    remove: (target, preserveContent) => preserveContent ? target : null,
  };
}

function seedFileProjection(source: string): ArtifactProjection {
  return {
    sourceSha256: contentHash(source),
    sourceDisplay: source,
    read: (target) => target === null
      ? { state: "absent" }
      : { state: "present", sha256: contentHash(target), display: target },
    install: (target) => target ?? source,
    replace: (target) => target,
    remove: (target) => target,
  };
}

function seedFileRemovalProjection(): ArtifactProjection {
  return {
    sourceSha256: "",
    sourceDisplay: "",
    read: (target) => target === null
      ? { state: "absent" }
      : { state: "present", sha256: contentHash(target), display: target },
    install: () => {
      throw new Error("A seed-file removal projection cannot install content.");
    },
    replace: () => {
      throw new Error("A seed-file removal projection cannot replace content.");
    },
    remove: (target) => target,
  };
}

function textSectionProjection(
  source: string,
  markers: { readonly start: string; readonly end: string },
): ArtifactProjection {
  if (!source.endsWith("\n")) throw new Error("Text-section source must end with a newline.");
  return {
    sourceSha256: contentHash(source),
    sourceDisplay: source,
    read: (target) => readMarkedScope(target === null ? null : normalizeLf(target), markers, (inner) => inner),
    install: (target) => withLineEnding(
      appendMarkedSection(normalizeLf(target ?? ""), source, markers),
      lineEndingFor(target),
    ),
    replace: (target) => withLineEnding(
      replaceMarkedSection(normalizeLf(target), source, markers),
      lineEndingFor(target),
    ),
    remove: (target, preserveContent) => {
      const removed = removeMarkedSection(normalizeLf(target), preserveContent, markers);
      return removed === null ? null : withLineEnding(removed, lineEndingFor(target));
    },
  };
}

function jsonMembersProjection(source: string, pointers: readonly string[]): ArtifactProjection {
  const sourceValue = parseJsonObject(source, "JSON member source");
  const sourceScope = projectJsonPointers(sourceValue, pointers, true);
  const sourceDisplay = stableJson(sourceScope);
  return {
    sourceSha256: contentHash(sourceDisplay),
    sourceDisplay,
    read: (target) => readJsonMembers(target, pointers),
    install: (target) => {
      const targetValue = target === null ? {} : parseJsonObject(target, "JSON member target");
      for (const pointer of pointers) {
        if (hasJsonPointer(targetValue, pointer)) {
          throw new Error(`JSON target already contains owned pointer ${pointer}.`);
        }
        setJsonPointer(targetValue, pointer, getJsonPointer(sourceValue, pointer));
      }
      return stableJson(targetValue);
    },
    replace: (target) => {
      const targetValue = parseJsonObject(target, "JSON member target");
      for (const pointer of pointers) {
        setJsonPointer(targetValue, pointer, getJsonPointer(sourceValue, pointer));
      }
      return stableJson(targetValue);
    },
    remove: (target, preserveContent) => removeJsonMembers(target, preserveContent, pointers),
  };
}

function readJsonMembers(target: string | null, pointers: readonly string[]): ProjectedScope {
  if (target === null) return { state: "absent" };
  const targetValue = parseJsonObject(target, "JSON member target");
  const presence = pointers.map((pointer) => hasJsonPointer(targetValue, pointer));
  if (presence.every((present) => !present)) return { state: "absent" };
  if (presence.some((present) => !present)) {
    return { state: "malformed", detail: "JSON target contains only part of the owned member set." };
  }
  const display = stableJson(projectJsonPointers(targetValue, pointers, true));
  return { state: "present", sha256: contentHash(display), display };
}

function removeJsonMembers(
  target: string,
  preserveContent: boolean,
  pointers: readonly string[],
): string {
  if (preserveContent) return target;
  const targetValue = parseJsonObject(target, "JSON member target");
  for (const pointer of [...pointers].sort((left, right) => right.length - left.length)) {
    deleteJsonPointer(targetValue, pointer);
  }
  return stableJson(targetValue);
}

function jsonArrayItemsProjection(
  source: string,
  ownedItems: readonly ContextJsonArrayItemOwnership[],
): ArtifactProjection {
  const sourceValue = parseJsonObject(source, "JSON array item source");
  const sourceItems = selectJsonArrayItems(sourceValue, ownedItems, "source");
  const sourceDisplay = stableJson(sourceItems);
  return {
    sourceSha256: contentHash(sourceDisplay),
    sourceDisplay,
    read: (target) => readJsonArrayItems(target, ownedItems),
    install: (target) => {
      const targetValue = target === null ? {} : parseJsonObject(target, "JSON array item target");
      for (const [index, ownership] of ownedItems.entries()) {
        const targetArray = getOrCreateJsonArray(targetValue, ownership.arrayPointer);
        if (findJsonArrayItemIndexes(targetArray, ownership).length > 0) {
          throw new Error(`JSON target already contains owned array item ${jsonArrayItemLabel(ownership)}.`);
        }
        targetArray.push(cloneJson(sourceItems[index]));
      }
      return stableJson(targetValue);
    },
    replace: (target) => {
      const targetValue = parseJsonObject(target, "JSON array item target");
      for (const [index, ownership] of ownedItems.entries()) {
        const targetArray = requireJsonArray(targetValue, ownership.arrayPointer, "target");
        const matches = findJsonArrayItemIndexes(targetArray, ownership);
        if (matches.length !== 1) {
          throw new Error(`JSON target must contain exactly one owned array item ${jsonArrayItemLabel(ownership)}.`);
        }
        const match = matches[0];
        if (match === undefined) throw new Error("JSON array item match disappeared unexpectedly.");
        targetArray[match] = cloneJson(sourceItems[index]);
      }
      return stableJson(targetValue);
    },
    remove: (target, preserveContent) => removeJsonArrayItems(target, preserveContent, ownedItems),
  };
}

function readJsonArrayItems(
  target: string | null,
  ownedItems: readonly ContextJsonArrayItemOwnership[],
): ProjectedScope {
  if (target === null) return { state: "absent" };
  let targetValue: Record<string, unknown>;
  try {
    targetValue = parseJsonObject(target, "JSON array item target");
  } catch (error) {
    return { state: "malformed", detail: error instanceof Error ? error.message : String(error) };
  }
  const selected: unknown[] = [];
  const presence: boolean[] = [];
  for (const ownership of ownedItems) {
    if (!hasJsonPointer(targetValue, ownership.arrayPointer)) {
      presence.push(false);
      continue;
    }
    let targetArray: unknown[];
    try {
      targetArray = requireJsonArray(targetValue, ownership.arrayPointer, "target");
    } catch (error) {
      return { state: "malformed", detail: error instanceof Error ? error.message : String(error) };
    }
    const matches = findJsonArrayItemIndexes(targetArray, ownership);
    if (matches.length > 1) {
      return {
        state: "malformed",
        detail: `JSON target contains duplicate owned array item ${jsonArrayItemLabel(ownership)}.`,
      };
    }
    const match = matches[0];
    presence.push(match !== undefined);
    if (match !== undefined) selected.push(cloneJson(targetArray[match]));
  }
  if (presence.every((present) => !present)) return { state: "absent" };
  if (presence.some((present) => !present)) {
    return { state: "malformed", detail: "JSON target contains only part of the owned array item set." };
  }
  const display = stableJson(selected);
  return { state: "present", sha256: contentHash(display), display };
}

function removeJsonArrayItems(
  target: string,
  preserveContent: boolean,
  ownedItems: readonly ContextJsonArrayItemOwnership[],
): string {
  if (preserveContent) return target;
  const targetValue = parseJsonObject(target, "JSON array item target");
  for (const ownership of ownedItems) {
    if (!hasJsonPointer(targetValue, ownership.arrayPointer)) continue;
    const targetArray = requireJsonArray(targetValue, ownership.arrayPointer, "target");
    const matches = findJsonArrayItemIndexes(targetArray, ownership);
    if (matches.length > 1) {
      throw new Error(`JSON target contains duplicate owned array item ${jsonArrayItemLabel(ownership)}.`);
    }
    const match = matches[0];
    if (match !== undefined) targetArray.splice(match, 1);
  }
  return stableJson(targetValue);
}

function selectJsonArrayItems(
  value: Record<string, unknown>,
  ownedItems: readonly ContextJsonArrayItemOwnership[],
  label: string,
): readonly unknown[] {
  return ownedItems.map((ownership) => {
    const sourceArray = requireJsonArray(value, ownership.arrayPointer, label);
    const matches = findJsonArrayItemIndexes(sourceArray, ownership);
    if (matches.length !== 1) {
      throw new Error(
        `JSON ${label} must contain exactly one owned array item ${jsonArrayItemLabel(ownership)}.`,
      );
    }
    const match = matches[0];
    if (match === undefined) throw new Error("JSON array item match disappeared unexpectedly.");
    return cloneJson(sourceArray[match]);
  });
}

function findJsonArrayItemIndexes(
  items: readonly unknown[],
  ownership: ContextJsonArrayItemOwnership,
): readonly number[] {
  const matches: number[] = [];
  for (const [index, item] of items.entries()) {
    if (!isObject(item) || !hasJsonPointer(item, ownership.identityPointer)) continue;
    if (getJsonPointer(item, ownership.identityPointer) === ownership.identity) matches.push(index);
  }
  return matches;
}

function requireJsonArray(
  value: Record<string, unknown>,
  pointer: string,
  label: string,
): unknown[] {
  const selected = getJsonPointerValue(value, pointer);
  if (!Array.isArray(selected)) throw new Error(`JSON ${label} pointer is not an array: ${pointer}.`);
  return selected;
}

function getOrCreateJsonArray(value: Record<string, unknown>, pointer: string): unknown[] {
  if (!hasJsonPointer(value, pointer)) setJsonPointer(value, pointer, []);
  return requireJsonArray(value, pointer, "target");
}

function jsonArrayItemLabel(ownership: ContextJsonArrayItemOwnership): string {
  return `${ownership.arrayPointer} where ${ownership.identityPointer} is ${JSON.stringify(ownership.identity)}`;
}

function tomlTablesProjection(
  source: string,
  tablePaths: readonly string[],
): ArtifactProjection {
  const sourceValue = parseTomlObject(source, "TOML table source");
  const sourceScope = projectObjectPaths(sourceValue, tablePaths, true);
  const sourceDisplay = stableJson(sourceScope);
  selectObjectPaths(sourceValue, tablePaths);
  return {
    sourceSha256: contentHash(sourceDisplay),
    sourceDisplay,
    read: (target) => readTomlMembers(target, tablePaths),
    install: (target) => {
      const targetValue = target === null || target.trim().length === 0
        ? {}
        : parseTomlObject(target, "TOML target");
      for (const tablePath of tablePaths) {
        if (hasObjectPath(targetValue, tablePath)) {
          throw new Error(`TOML target already contains owned table ${tablePath}.`);
        }
        setObjectPath(targetValue, tablePath, getObjectPath(sourceValue, tablePath));
      }
      return serializeTomlObject(targetValue);
    },
    replace: (target) => {
      const targetValue = parseTomlObject(target, "TOML table target");
      for (const tablePath of tablePaths) {
        setObjectPath(targetValue, tablePath, getObjectPath(sourceValue, tablePath));
      }
      return serializeTomlObject(targetValue);
    },
    remove: (target, preserveContent) => removeTomlMembers(target, preserveContent, tablePaths),
  };
}

function tomlMembersProjection(source: string, memberPaths: readonly string[]): ArtifactProjection {
  const sourceValue = parseTomlObject(source, "TOML member source");
  const sourceScope = projectObjectPaths(sourceValue, memberPaths, true);
  const sourceDisplay = stableJson(sourceScope);
  return {
    sourceSha256: contentHash(sourceDisplay),
    sourceDisplay,
    read: (target) => readTomlMembers(target, memberPaths),
    install: (target) => {
      const targetValue = target === null || target.trim().length === 0
        ? {}
        : parseTomlObject(target, "TOML member target");
      for (const memberPath of memberPaths) {
        if (hasObjectPath(targetValue, memberPath)) {
          throw new Error(`TOML target already contains owned member ${memberPath}.`);
        }
        setObjectPath(targetValue, memberPath, getObjectPath(sourceValue, memberPath));
      }
      return serializeTomlObject(targetValue);
    },
    replace: (target) => {
      const targetValue = parseTomlObject(target, "TOML member target");
      for (const memberPath of memberPaths) {
        setObjectPath(targetValue, memberPath, getObjectPath(sourceValue, memberPath));
      }
      return serializeTomlObject(targetValue);
    },
    remove: (target, preserveContent) => removeTomlMembers(target, preserveContent, memberPaths),
  };
}

function readTomlMembers(target: string | null, memberPaths: readonly string[]): ProjectedScope {
  if (target === null) return { state: "absent" };
  let targetValue: Record<string, unknown>;
  try {
    targetValue = parseTomlObject(target, "TOML member target");
  } catch (error) {
    return { state: "malformed", detail: error instanceof Error ? error.message : String(error) };
  }
  const presence = memberPaths.map((memberPath) => hasObjectPath(targetValue, memberPath));
  if (presence.every((present) => !present)) return { state: "absent" };
  if (presence.some((present) => !present)) {
    return { state: "malformed", detail: "TOML target contains only part of the owned member set." };
  }
  const display = stableJson(projectObjectPaths(targetValue, memberPaths, true));
  return { state: "present", sha256: contentHash(display), display };
}

function removeTomlMembers(
  target: string,
  preserveContent: boolean,
  memberPaths: readonly string[],
): string | null {
  if (preserveContent) return target;
  const targetValue = parseTomlObject(target, "TOML member target");
  for (const memberPath of [...memberPaths].sort((left, right) => right.length - left.length)) {
    deleteObjectPath(targetValue, memberPath);
  }
  return Object.keys(targetValue).length === 0 ? null : serializeTomlObject(targetValue);
}

function selectObjectPaths(
  value: Record<string, unknown>,
  paths: readonly string[],
): Record<string, unknown> {
  const selection: Record<string, unknown> = {};
  for (const objectPath of paths) {
    const table = getObjectPath(value, objectPath);
    if (!isObject(table)) {
      throw new Error(`Source owned TOML path is not a table: ${objectPath}.`);
    }
    setObjectPath(selection, objectPath, table);
  }
  return selection;
}

function setObjectPath(
  value: Record<string, unknown>,
  objectPath: string,
  nextValue: unknown,
): void {
  const segments = objectPath.split(".");
  const leaf = segments.at(-1);
  if (!leaf) throw new Error("Owned TOML path cannot address the root.");
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (child === undefined) {
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    } else if (isObject(child)) {
      current = child;
    } else {
      throw new Error(`TOML table parent is not an object: ${objectPath}.`);
    }
  }
  current[leaf] = cloneJson(nextValue);
}

function deleteObjectPath(value: Record<string, unknown>, objectPath: string): void {
  const segments = objectPath.split(".");
  const parents: Array<{ readonly parent: Record<string, unknown>; readonly segment: string }> = [];
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!isObject(child)) return;
    parents.push({ parent: current, segment });
    current = child;
  }
  const leaf = segments.at(-1);
  if (!leaf) return;
  delete current[leaf];
  for (const { parent, segment } of parents.reverse()) {
    const child = parent[segment];
    if (isObject(child) && Object.keys(child).length === 0) delete parent[segment];
  }
}

function serializeTomlObject(value: Record<string, unknown>): string {
  const serialized = stringifyToml(value);
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

function readMarkedScope(
  target: string | null,
  markers: { readonly start: string; readonly end: string },
  normalize: (inner: string) => string,
): ProjectedScope {
  if (target === null) return { state: "absent" };
  const section = locateMarkedSection(target, markers);
  if (section === null) {
    return target.includes(markers.start) || target.includes(markers.end)
      ? { state: "malformed", detail: "Owned section markers are duplicated, missing, or reversed." }
      : { state: "absent" };
  }
  const display = normalize(target.slice(section.innerStart, section.innerEnd));
  return { state: "present", sha256: contentHash(display), display };
}

function appendMarkedSection(
  target: string,
  source: string,
  markers: { readonly start: string; readonly end: string },
): string {
  const separator = target.length === 0
    ? ""
    : target.endsWith("\n\n")
      ? ""
      : target.endsWith("\n")
        ? "\n"
        : "\n\n";
  return `${target}${separator}${markers.start}\n${source}${markers.end}\n`;
}

function replaceMarkedSection(
  target: string,
  source: string,
  markers: { readonly start: string; readonly end: string },
): string {
  const section = locateMarkedSection(target, markers);
  if (!section) throw new Error("Cannot replace a missing or malformed owned section.");
  return `${target.slice(0, section.innerStart)}${source}${target.slice(section.innerEnd)}`;
}

function removeMarkedSection(
  target: string,
  preserveContent: boolean,
  markers: { readonly start: string; readonly end: string },
): string | null {
  const section = locateMarkedSection(target, markers);
  if (!section) throw new Error("Cannot remove a missing or malformed owned section.");
  const replacement = preserveContent ? target.slice(section.innerStart, section.innerEnd) : "";
  const removalStart = preserveContent ? section.innerStart - `${markers.start}\n`.length : section.blockStart;
  const result = `${target.slice(0, removalStart)}${replacement}${target.slice(section.blockEnd)}`;
  const normalized = result.replace(/^\n+/u, "").replace(/\n{3,}/gu, "\n\n");
  return normalized.length === 0 ? null : normalized;
}

function lineEndingFor(target: string | null): "\n" | "\r\n" {
  return target?.includes("\r\n") === true ? "\r\n" : "\n";
}

function normalizeLf(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function withLineEnding(value: string, lineEnding: "\n" | "\r\n"): string {
  return lineEnding === "\n" ? value : value.replaceAll("\n", "\r\n");
}

function locateMarkedSection(
  target: string,
  markers: { readonly start: string; readonly end: string },
): SectionLocation | null {
  const startToken = `${markers.start}\n`;
  const firstStart = target.indexOf(startToken);
  if (firstStart < 0 || target.indexOf(startToken, firstStart + startToken.length) >= 0) return null;
  const innerStart = firstStart + startToken.length;
  const firstEnd = target.indexOf(markers.end, innerStart);
  if (firstEnd < 0 || target.indexOf(markers.end, firstEnd + markers.end.length) >= 0) return null;
  if (target.indexOf(markers.end) < firstStart) return null;
  const blockStart = firstStart >= 2 && target.slice(firstStart - 2, firstStart) === "\n\n"
    ? firstStart - 1
    : firstStart;
  const afterEnd = firstEnd + markers.end.length;
  const blockEnd = target[afterEnd] === "\n" ? afterEnd + 1 : afterEnd;
  return { blockStart, innerStart, innerEnd: firstEnd, blockEnd };
}

function markerPair(
  sectionId: string,
  style: "markdown" | "toml" | "javascript",
): { readonly start: string; readonly end: string } {
  switch (style) {
    case "markdown":
      return {
        start: `<!-- agent-context:${sectionId}:start -->`,
        end: `<!-- agent-context:${sectionId}:end -->`,
      };
    case "toml":
      return {
        start: `# agent-context:${sectionId}:start`,
        end: `# agent-context:${sectionId}:end`,
      };
    case "javascript":
      return {
        start: `// agent-context:${sectionId}:start`,
        end: `// agent-context:${sectionId}:end`,
      };
  }
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`${label} must contain valid JSON.`, { cause: error });
  }
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function parseTomlObject(source: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = parseToml(source);
    if (!isObject(value)) throw new Error(`${label} must be an object.`);
    return value;
  } catch (error) {
    throw new Error(`${label} must contain valid TOML.`, { cause: error });
  }
}

function projectJsonPointers(
  value: Record<string, unknown>,
  pointers: readonly string[],
  requirePresent: boolean,
): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const pointer of pointers) {
    if (!hasJsonPointer(value, pointer)) {
      if (requirePresent) throw new Error(`Source does not contain owned JSON pointer ${pointer}.`);
      continue;
    }
    projection[pointer] = getJsonPointer(value, pointer);
  }
  return projection;
}

function projectObjectPaths(
  value: Record<string, unknown>,
  paths: readonly string[],
  requirePresent: boolean,
): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const objectPath of paths) {
    if (!hasObjectPath(value, objectPath)) {
      if (requirePresent) throw new Error(`Source does not contain owned TOML table ${objectPath}.`);
      continue;
    }
    projection[objectPath] = getObjectPath(value, objectPath);
  }
  return projection;
}

function hasJsonPointer(value: Record<string, unknown>, pointer: string): boolean {
  const segments = jsonPointerSegments(pointer);
  let current: unknown = value;
  for (const segment of segments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function getJsonPointer(value: Record<string, unknown>, pointer: string): unknown {
  return cloneJson(getJsonPointerValue(value, pointer));
}

function getJsonPointerValue(value: Record<string, unknown>, pointer: string): unknown {
  const segments = jsonPointerSegments(pointer);
  let current: unknown = value;
  for (const segment of segments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`JSON pointer is missing: ${pointer}.`);
    }
    current = current[segment];
  }
  return current;
}

function setJsonPointer(value: Record<string, unknown>, pointer: string, nextValue: unknown): void {
  const segments = jsonPointerSegments(pointer);
  const leaf = segments.at(-1);
  if (!leaf) throw new Error("Owned JSON pointer cannot address the root.");
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (child === undefined) {
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    } else if (isObject(child)) {
      current = child;
    } else {
      throw new Error(`JSON pointer parent is not an object: ${pointer}.`);
    }
  }
  current[leaf] = cloneJson(nextValue);
}

function deleteJsonPointer(value: Record<string, unknown>, pointer: string): void {
  const segments = jsonPointerSegments(pointer);
  const leaf = segments.at(-1);
  if (!leaf) return;
  let current: Record<string, unknown> = value;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!isObject(child)) return;
    current = child;
  }
  delete current[leaf];
}

function jsonPointerSegments(pointer: string): readonly string[] {
  return pointer.slice(1).split("/").map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function hasObjectPath(value: Record<string, unknown>, objectPath: string): boolean {
  try {
    getObjectPath(value, objectPath);
    return true;
  } catch {
    return false;
  }
}

function getObjectPath(value: Record<string, unknown>, objectPath: string): unknown {
  let current: unknown = value;
  for (const segment of objectPath.split(".")) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`Object path is missing: ${objectPath}.`);
    }
    current = current[segment];
  }
  return cloneJson(current);
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
