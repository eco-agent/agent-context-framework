import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  portableRelativePath,
  requiredString,
  sha256Digest,
  strictRecord,
  stringArray,
} from "@agent-context-runtime/shared";

export type HookInput =
  | {
      readonly event: "pre-tool-use-patch";
      readonly sessionId: string;
      readonly patch: string;
    }
  | {
      readonly event: "session-start-compact";
      readonly sessionId: string;
    }
  | { readonly event: "unsupported" };

export interface ScopedSessionBinding {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly writablePaths: readonly string[];
  readonly sources: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly compactContext: string;
}

export type HookDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "context"; readonly additionalContext: string }
  | { readonly kind: "noop" };

export function decodeHookInput(value: unknown): HookInput {
  const record = strictRecord(value, "Hook input", [
    "hook_event_name",
    "cwd",
    "session_id",
    "source",
    "tool_name",
    "tool_input",
  ]);
  if (
    record.hook_event_name === "PreToolUse" &&
    record.tool_name === "apply_patch"
  ) {
    const toolInput = strictRecord(record.tool_input, "Hook tool input", ["command"]);
    return {
      event: "pre-tool-use-patch",
      sessionId: sessionId(record.session_id),
      patch: requiredString(toolInput, "command"),
    };
  }
  if (
    record.hook_event_name === "SessionStart" &&
    record.source === "compact"
  ) {
    return {
      event: "session-start-compact",
      sessionId: sessionId(record.session_id),
    };
  }
  return { event: "unsupported" };
}

export function decodeScopedSessionBinding(value: unknown): ScopedSessionBinding {
  const record = strictRecord(value, "Scoped session binding", [
    "schemaVersion",
    "sessionId",
    "writablePaths",
    "sources",
    "compactContext",
  ]);
  if (record.schemaVersion !== 1) {
    throw new Error("Scoped session binding schemaVersion must be 1.");
  }
  if (!Array.isArray(record.sources)) {
    throw new Error("Scoped session binding sources must be an array.");
  }
  const writablePaths = stringArray(record.writablePaths, "writablePaths").map(
    decodeWritablePath,
  );
  const sources = record.sources.map((candidate) => {
    const source = strictRecord(candidate, "Scoped session source", ["path", "sha256"]);
    return {
      path: portableRelativePath(source.path, "source path"),
      sha256: sha256Digest(source.sha256, "source sha256"),
    };
  });
  return {
    schemaVersion: 1,
    sessionId: sessionId(record.sessionId),
    writablePaths,
    sources,
    compactContext: requiredString(record, "compactContext"),
  };
}

export async function loadScopedSessionBinding(
  root: string,
  bindingPath: string,
  expectedSessionId: string,
): Promise<ScopedSessionBinding> {
  const resolvedRoot = await realpath(root);
  const binding = decodeScopedSessionBinding(
    JSON.parse(
      await readFile(
        await resolveRepositoryFile(resolvedRoot, bindingPath),
        "utf8",
      ),
    ) as unknown,
  );
  if (binding.sessionId !== expectedSessionId) {
    throw new Error("Scoped session binding does not match the hook session.");
  }
  for (const source of binding.sources) {
    const bytes = await readFile(
      await resolveRepositoryFile(resolvedRoot, source.path),
    );
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== source.sha256) {
      throw new Error(`Scoped session source changed: ${source.path}.`);
    }
  }
  return binding;
}

export function evaluateHook(
  input: HookInput,
  binding: ScopedSessionBinding,
): HookDecision {
  if (input.event === "unsupported") {
    return { kind: "noop" };
  }
  if (input.sessionId !== binding.sessionId) {
    throw new Error("Hook input and scoped session binding differ.");
  }
  if (input.event === "session-start-compact") {
    return { kind: "context", additionalContext: binding.compactContext };
  }
  const outsideScope = extractPatchPaths(input.patch).find(
    (candidate) =>
      !binding.writablePaths.some((pattern) =>
        matchesWritablePath(candidate, pattern),
      ),
  );
  return outsideScope === undefined
    ? { kind: "allow" }
    : {
        kind: "deny",
        reason: `${outsideScope} is outside the active session's writable paths.`,
      };
}

export function extractPatchPaths(patch: string): readonly string[] {
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/u)) {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/u.exec(
      line,
    );
    if (match?.[1] !== undefined) {
      paths.push(normalizeRepositoryPath(match[1]));
    }
  }
  return paths;
}

export function matchesWritablePath(file: string, pattern: string): boolean {
  const normalizedFile = normalizeRepositoryPath(file);
  const normalizedPattern = decodeWritablePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  return normalizedFile === normalizedPattern;
}

async function resolveRepositoryFile(root: string, candidate: string): Promise<string> {
  const relativePath = portableRelativePath(candidate, "repository path");
  const absolute = path.resolve(root, relativePath);
  if (!isInside(root, absolute)) {
    throw new Error(`Repository path escapes the explicit root: ${candidate}.`);
  }
  const resolved = await realpath(absolute);
  if (!isInside(root, resolved) || !(await stat(resolved)).isFile()) {
    throw new Error(`Repository path is not an authorized file: ${candidate}.`);
  }
  return resolved;
}

function decodeWritablePath(value: string): string {
  const normalized = normalizeRepositoryPath(value);
  const recursive = normalized.endsWith("/**");
  const base = recursive ? normalized.slice(0, -3) : normalized;
  portableRelativePath(base, "writable path");
  return recursive ? `${base}/**` : base;
}

function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
}

function sessionId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error("sessionId must contain only safe identifier characters.");
  }
  return value;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
