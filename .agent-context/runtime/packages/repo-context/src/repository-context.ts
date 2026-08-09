import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { JsonValue } from "@agent-context-runtime/shared";

const DEFAULT_READ_LINES = 200;
const DEFAULT_SEARCH_MATCHES = 50;
const DEFAULT_OUTPUT_BYTES = 10_000;
const HARD_OUTPUT_BYTES = 1_000_000;
const HARD_SOURCE_BYTES = 32 * 1024 * 1024;
const HARD_SEARCH_PROCESS_BYTES = 32 * 1024 * 1024;

export type RepositoryContextOutcome =
  | "success"
  | "no_match"
  | "budget_exhausted"
  | "failed";

export interface RepositoryContextMetadata {
  readonly operation: "read" | "search";
  readonly path: string;
  readonly contentHash: string | null;
  readonly returnedRange: JsonValue;
  readonly total: number;
  readonly returned: number;
  readonly returnedUtf8Bytes: number;
  readonly omitted: number;
  readonly nextCursor: string | null;
  readonly truncated: boolean;
  readonly overrideUsed: boolean;
  readonly exitCode: number;
}

export interface RepositoryContextResult {
  readonly outcome: RepositoryContextOutcome;
  readonly content: string;
  readonly metadata: RepositoryContextMetadata;
}

export interface RepositoryReadRequest {
  readonly path: string;
  readonly startLine?: number;
  readonly lines?: number;
  readonly cursor?: string;
  readonly all?: boolean;
  readonly maxOutputBytes?: number;
}

export interface RepositorySearchRequest {
  readonly query: string;
  readonly path: string;
  readonly cursor?: string;
  readonly all?: boolean;
  readonly maxMatches?: number;
  readonly contextLines?: number;
  readonly maxOutputBytes?: number;
}


interface ReadCursor {
  readonly version: 1;
  readonly kind: "read";
  readonly contentHash: string;
  readonly line: number;
  readonly column: number;
}

interface SearchCursor {
  readonly version: 1;
  readonly kind: "search";
  readonly offset: number;
}

interface SearchBlock {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  readonly before: readonly ContextLine[];
  readonly after: readonly ContextLine[];
}

interface ContextLine {
  readonly line: number;
  readonly text: string;
}

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class RepositoryContextTool {
  readonly #root: string;

  private constructor(root: string) {
    this.#root = root;
  }

  public static async open(root: string): Promise<RepositoryContextTool> {
    const resolvedRoot = await realpath(root);
    if (!(await stat(resolvedRoot)).isDirectory()) {
      throw new Error("Authorized repository root must be a directory.");
    }
    return new RepositoryContextTool(resolvedRoot);
  }

  public async read(
    request: RepositoryReadRequest,
  ): Promise<RepositoryContextResult> {
    const target = await resolveTarget(this.#root, request.path, "file");
    const targetStat = await stat(target.absolute);
    if (targetStat.size > HARD_SOURCE_BYTES) {
      throw new Error(
        `Source exceeds the ${HARD_SOURCE_BYTES}-byte reader safety ceiling.`,
      );
    }

    const bytes = await readFile(target.absolute);
    const afterStat = await stat(target.absolute);
    if (
      targetStat.dev !== afterStat.dev ||
      targetStat.ino !== afterStat.ino ||
      targetStat.size !== afterStat.size ||
      targetStat.mtimeMs !== afterStat.mtimeMs
    ) {
      throw new Error("Source identity changed while it was being read.");
    }

    const contentHash = sha256(bytes);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const sourceLines = splitPhysicalLines(text);
    const cursor =
      request.cursor === undefined
        ? null
        : decodeCursor<ReadCursor>(request.cursor, "read");
    if (cursor !== null && cursor.contentHash !== contentHash) {
      throw new Error("Read cursor no longer matches the source content.");
    }

    const startLine = cursor?.line ?? request.startLine ?? 1;
    const startColumn = cursor?.column ?? 0;
    assertPositiveInteger(startLine, "startLine");
    assertNonnegativeInteger(startColumn, "cursor column");

    const overrideUsed = request.all === true;
    const requestedLines = overrideUsed
      ? Number.POSITIVE_INFINITY
      : request.lines ?? DEFAULT_READ_LINES;
    if (!overrideUsed) {
      assertPositiveInteger(requestedLines, "lines");
      if (requestedLines > DEFAULT_READ_LINES) {
        throw new Error(
          `Read lines cannot exceed ${DEFAULT_READ_LINES} without --all.`,
        );
      }
    }

    const outputLimit = resolveOutputLimit(
      request.maxOutputBytes,
      overrideUsed,
    );
    const read = renderReadWindow(
      sourceLines,
      startLine,
      startColumn,
      requestedLines,
      outputLimit,
      contentHash,
    );

    return {
      outcome: "success",
      content: read.content,
      metadata: {
        operation: "read",
        path: target.relative,
        contentHash,
        returnedRange: read.returnedRange,
        total: sourceLines.length,
        returned: read.returnedLines,
        returnedUtf8Bytes: Buffer.byteLength(read.content, "utf8"),
        omitted: Math.max(0, sourceLines.length - read.returnedLines),
        nextCursor: read.nextCursor,
        truncated: read.nextCursor !== null,
        overrideUsed,
        exitCode: 0,
      },
    };
  }

  public async search(
    request: RepositorySearchRequest,
  ): Promise<RepositoryContextResult> {
    if (request.query.length === 0) {
      throw new Error("Search query cannot be empty.");
    }
    const target = await resolveTarget(this.#root, request.path, "any");
    const cursor =
      request.cursor === undefined
        ? null
        : decodeCursor<SearchCursor>(request.cursor, "search");
    const offset = cursor?.offset ?? 0;
    assertNonnegativeInteger(offset, "search cursor offset");

    const overrideUsed = request.all === true;
    const maxMatches = overrideUsed
      ? Number.POSITIVE_INFINITY
      : request.maxMatches ?? DEFAULT_SEARCH_MATCHES;
    if (!overrideUsed) {
      assertPositiveInteger(maxMatches, "maxMatches");
      if (maxMatches > DEFAULT_SEARCH_MATCHES) {
        throw new Error(
          `Search matches cannot exceed ${DEFAULT_SEARCH_MATCHES} without --all.`,
        );
      }
    }
    const contextLines = request.contextLines ?? 2;
    assertNonnegativeInteger(contextLines, "contextLines");
    if (contextLines > 10) {
      throw new Error("contextLines cannot exceed 10.");
    }
    const outputLimit = resolveOutputLimit(
      request.maxOutputBytes,
      overrideUsed,
    );

    const count = await runRipgrep(
      [
        "--count-matches",
        "--fixed-strings",
        "--no-messages",
        "--",
        request.query,
        target.relative === "." ? "." : target.relative,
      ],
      this.#root,
    );
    if (count.exitCode === 1) {
      return emptySearchResult(target.relative, overrideUsed, 1);
    }
    if (count.exitCode !== 0) {
      return failedSearchResult(target.relative, overrideUsed, count.exitCode);
    }
    const totalMatches = parseMatchCount(count.stdout);
    if (offset >= totalMatches) {
      return {
        outcome: "success",
        content: "",
        metadata: {
          operation: "search",
          path: target.relative,
          contentHash: null,
          returnedRange: { matchOffset: offset, matchEndOffset: offset },
          total: totalMatches,
          returned: 0,
          returnedUtf8Bytes: 0,
          omitted: totalMatches,
          nextCursor: null,
          truncated: false,
          overrideUsed,
          exitCode: 0,
        },
      };
    }

    const matches = await collectSearchBlocks(
      this.#root,
      target.relative,
      request.query,
      contextLines,
      offset,
      maxMatches,
    );
    const rendered = renderSearchBlocks(matches, outputLimit);
    if (rendered.oversized) {
      return {
        outcome: "budget_exhausted",
        content: "",
        metadata: {
          operation: "search",
          path: target.relative,
          contentHash: null,
          returnedRange: {
            matchOffset: offset,
            matchEndOffset: offset,
          },
          total: totalMatches,
          returned: 0,
          returnedUtf8Bytes: 0,
          omitted: totalMatches,
          nextCursor: encodeCursor({
            version: 1,
            kind: "search",
            offset,
          }),
          truncated: true,
          overrideUsed,
          exitCode: 126,
        },
      };
    }
    const consumedMatches = rendered.returned;
    const nextOffset = offset + consumedMatches;
    const nextCursor =
      nextOffset < totalMatches
        ? encodeCursor({
            version: 1,
            kind: "search",
            offset: nextOffset,
          })
        : null;

    return {
      outcome: "success",
      content: rendered.content,
      metadata: {
        operation: "search",
        path: target.relative,
        contentHash: sha256(Buffer.from(rendered.content, "utf8")),
        returnedRange: {
          matchOffset: offset,
          matchEndOffset: nextOffset,
        },
        total: totalMatches,
        returned: consumedMatches,
        returnedUtf8Bytes: Buffer.byteLength(rendered.content, "utf8"),
        omitted: Math.max(0, totalMatches - consumedMatches),
        nextCursor,
        truncated: nextCursor !== null,
        overrideUsed,
        exitCode: 0,
      },
    };
  }
}

function renderReadWindow(
  lines: readonly string[],
  startLine: number,
  startColumn: number,
  requestedLines: number,
  outputLimit: number,
  contentHash: string,
): {
  readonly content: string;
  readonly returnedLines: number;
  readonly returnedRange: JsonValue;
  readonly nextCursor: string | null;
} {
  if (startLine > lines.length || lines.length === 0) {
    return {
      content: "",
      returnedLines: 0,
      returnedRange: { startLine, endLine: null },
      nextCursor: null,
    };
  }

  const endLine = Math.min(lines.length, startLine + requestedLines - 1);
  let content = "";
  let remaining = outputLimit;
  let line = startLine;
  let column = startColumn;
  let returnedLines = 0;
  let finalLine = startLine;
  let finalColumn = startColumn;

  while (line <= endLine && remaining > 0) {
    const source = lines[line - 1] ?? "";
    if (column > source.length) {
      throw new Error("Read cursor column exceeds the source line.");
    }
    const separator = content.length === 0 ? "" : "\n";
    const fragment = `${separator}${source.slice(column)}`;
    const prefix = utf8Prefix(fragment, remaining);
    content += prefix.text;
    remaining -= prefix.bytes;
    returnedLines += 1;
    finalLine = line;

    if (prefix.characters < fragment.length) {
      const consumedFromSource = Math.max(
        0,
        prefix.characters - separator.length,
      );
      finalColumn = column + consumedFromSource;
      return {
        content,
        returnedLines,
        returnedRange: {
          startLine,
          endLine: finalLine,
          endColumn: finalColumn,
        },
        nextCursor: encodeCursor({
          version: 1,
          kind: "read",
          contentHash,
          line,
          column: finalColumn,
        }),
      };
    }

    line += 1;
    column = 0;
    finalColumn = source.length;
  }

  const hasMore = line <= lines.length;
  return {
    content,
    returnedLines,
    returnedRange: {
      startLine,
      endLine: finalLine,
      endColumn: finalColumn,
    },
    nextCursor: hasMore
      ? encodeCursor({
          version: 1,
          kind: "read",
          contentHash,
          line,
          column: 0,
        })
      : null,
  };
}

async function collectSearchBlocks(
  root: string,
  target: string,
  query: string,
  contextLines: number,
  offset: number,
  maxMatches: number,
): Promise<readonly SearchBlock[]> {
  const result = await runRipgrep(
    [
      "--json",
      "--fixed-strings",
      "--no-messages",
      "--max-columns",
      "1000",
      "--max-columns-preview",
      "--context",
      `${contextLines}`,
      "--",
      query,
      target === "." ? "." : target,
    ],
    root,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `rg content collection exited with code ${result.exitCode}.`,
    );
  }

  const blocks: SearchBlock[] = [];
  const recentContext = new Map<string, ContextLine[]>();
  let matchIndex = 0;
  let active: {
    path: string;
    line: number;
    text: string;
    before: ContextLine[];
    after: ContextLine[];
  } | null = null;

  for (const rawLine of result.stdout.split(/\r?\n/u)) {
    if (rawLine.length === 0) {
      continue;
    }
    const event = JSON.parse(rawLine) as unknown;
    if (!isRecord(event) || !isRecord(event.data)) {
      continue;
    }
    const eventType = event.type;
    const eventPath = nestedText(event.data.path);
    const lineNumber = numeric(event.data.line_number);
    const lineText = trimLineEnding(nestedText(event.data.lines));
    if (eventType === "context" && eventPath !== null && lineNumber !== null) {
      const context = { line: lineNumber, text: lineText ?? "" };
      const recent = recentContext.get(eventPath) ?? [];
      recent.push(context);
      recentContext.set(eventPath, recent.slice(-contextLines));
      if (
        active !== null &&
        active.path === eventPath &&
        lineNumber > active.line &&
        active.after.length < contextLines
      ) {
        active.after.push(context);
      }
      continue;
    }
    if (eventType !== "match" || eventPath === null || lineNumber === null) {
      continue;
    }

    if (active !== null) {
      blocks.push(active);
      active = null;
    }
    const include =
      matchIndex >= offset &&
      (maxMatches === Number.POSITIVE_INFINITY ||
        matchIndex < offset + maxMatches);
    if (include) {
      active = {
        path: normalizeSlashes(eventPath),
        line: lineNumber,
        text: lineText ?? "",
        before: [...(recentContext.get(eventPath) ?? [])],
        after: [],
      };
    }
    matchIndex += 1;
    recentContext.set(eventPath, []);
    if (
      maxMatches !== Number.POSITIVE_INFINITY &&
      matchIndex >= offset + maxMatches &&
      active === null
    ) {
      break;
    }
  }
  if (active !== null) {
    blocks.push(active);
  }
  return blocks;
}

function renderSearchBlocks(
  blocks: readonly SearchBlock[],
  outputLimit: number,
): {
  readonly content: string;
  readonly returned: number;
  readonly oversized: boolean;
} {
  let content = "";
  let returned = 0;
  for (const block of blocks) {
    const rendered = formatSearchBlock(block);
    const separator = content.length === 0 ? "" : "\n--\n";
    const candidate = `${separator}${rendered}`;
    const bytes = Buffer.byteLength(candidate, "utf8");
    if (Buffer.byteLength(content, "utf8") + bytes > outputLimit) {
      if (returned === 0) {
        return { content: "", returned: 0, oversized: true };
      }
      break;
    }
    content += candidate;
    returned += 1;
  }
  return { content, returned, oversized: false };
}

function formatSearchBlock(block: SearchBlock): string {
  const header = `${block.path}:${block.line} sha256:${sha256(
    Buffer.from(block.text, "utf8"),
  )}`;
  const before = block.before.map(
    (line) => `${block.path}-${line.line}-${line.text}`,
  );
  const match = `${block.path}:${block.line}:${block.text}`;
  const after = block.after.map(
    (line) => `${block.path}-${line.line}-${line.text}`,
  );
  return [header, ...before, match, ...after].join("\n");
}

async function runRipgrep(
  arguments_: readonly string[],
  cwd: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", arguments_, {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > HARD_SEARCH_PROCESS_BYTES) {
        child.kill();
        reject(
          new Error(
            `rg output exceeded the ${HARD_SEARCH_PROCESS_BYTES}-byte process ceiling.`,
          ),
        );
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdout,
        stderr: utf8Prefix(stderr, DEFAULT_OUTPUT_BYTES).text,
        exitCode: code ?? 2,
      });
    });
  });
}

async function resolveTarget(
  root: string,
  candidate: string,
  expected: "file" | "any",
): Promise<{ readonly absolute: string; readonly relative: string }> {
  const absolute = path.resolve(root, candidate);
  if (!isInside(root, absolute)) {
    throw new Error("Repository context path resolves outside the root.");
  }
  const resolved = await realpath(absolute);
  if (!isInside(root, resolved)) {
    throw new Error("Repository context path links outside the root.");
  }
  const targetStat = await stat(resolved);
  if (expected === "file" && !targetStat.isFile()) {
    throw new Error("Repository read target must be a file.");
  }
  if (!targetStat.isFile() && !targetStat.isDirectory()) {
    throw new Error("Repository context target must be a file or directory.");
  }
  return {
    absolute: resolved,
    relative: normalizeSlashes(path.relative(root, resolved)) || ".",
  };
}

function emptySearchResult(
  target: string,
  overrideUsed: boolean,
  exitCode: number,
): RepositoryContextResult {
  return {
    outcome: "no_match",
    content: "",
    metadata: {
      operation: "search",
      path: target,
      contentHash: null,
      returnedRange: { matchOffset: 0, matchEndOffset: 0 },
      total: 0,
      returned: 0,
      returnedUtf8Bytes: 0,
      omitted: 0,
      nextCursor: null,
      truncated: false,
      overrideUsed,
      exitCode,
    },
  };
}

function failedSearchResult(
  target: string,
  overrideUsed: boolean,
  exitCode: number,
): RepositoryContextResult {
  return {
    outcome: "failed",
    content: "",
    metadata: {
      operation: "search",
      path: target,
      contentHash: null,
      returnedRange: { matchOffset: 0, matchEndOffset: 0 },
      total: 0,
      returned: 0,
      returnedUtf8Bytes: 0,
      omitted: 0,
      nextCursor: null,
      truncated: false,
      overrideUsed,
      exitCode,
    },
  };
}

function splitPhysicalLines(value: string): readonly string[] {
  if (value.length === 0) {
    return [];
  }
  const lines = value.split(/\r?\n/u);
  if (value.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function parseMatchCount(output: string): number {
  let total = 0;
  for (const line of output.split(/\r?\n/u)) {
    const match = /(?:^|:)(\d+)\s*$/u.exec(line);
    if (match !== null) {
      total += Number(match[1]);
    }
  }
  return total;
}

function resolveOutputLimit(
  requested: number | undefined,
  overrideUsed: boolean,
): number {
  const defaultLimit = overrideUsed ? HARD_OUTPUT_BYTES : DEFAULT_OUTPUT_BYTES;
  const limit = requested ?? defaultLimit;
  assertPositiveInteger(limit, "maxOutputBytes");
  const ceiling = overrideUsed ? HARD_OUTPUT_BYTES : DEFAULT_OUTPUT_BYTES;
  if (limit > ceiling) {
    throw new Error(
      `maxOutputBytes cannot exceed ${ceiling}${
        overrideUsed ? "" : " without --all"
      }.`,
    );
  }
  return limit;
}

function utf8Prefix(
  value: string,
  maximumBytes: number,
): { readonly text: string; readonly bytes: number; readonly characters: number } {
  let bytes = 0;
  let characters = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maximumBytes) {
      break;
    }
    bytes += characterBytes;
    characters += character.length;
  }
  return { text: value.slice(0, characters), bytes, characters };
}

function encodeCursor(value: ReadCursor | SearchCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor<T extends ReadCursor | SearchCursor>(
  value: string,
  expectedKind: T["kind"],
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Repository context cursor is invalid.");
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.kind !== expectedKind
  ) {
    throw new Error(`Repository context ${expectedKind} cursor is invalid.`);
  }
  return parsed as unknown as T;
}

function nestedText(value: unknown): string | null {
  return isRecord(value) && typeof value.text === "string"
    ? value.text
    : null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function trimLineEnding(value: string | null): string | null {
  return value === null ? null : value.replace(/\r?\n$/u, "");
}

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join("/");
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

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
