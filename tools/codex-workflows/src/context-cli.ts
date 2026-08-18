#!/usr/bin/env node

import process from "node:process";

import {
  RepositoryContextTool,
  type RepositoryContextResult,
  type RepositoryReadRequest,
  type RepositorySearchRequest,
} from "./repository-context.js";

let outputFormat: OutputFormat = "model";

try {
  const parsed = parseArguments(process.argv.slice(2));
  outputFormat = parsed.format;
  const tool = await RepositoryContextTool.open(parsed.root);
  const result =
    parsed.operation === "read"
      ? await tool.read(parsed.request)
      : await tool.search(parsed.request);
  process.stdout.write(formatResult(result, parsed.format));
  process.exitCode = result.outcome === "no_match" ? 0 : result.metadata.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    outputFormat === "json"
      ? `${JSON.stringify(
          {
            outcome: "failed",
            content: "",
            metadata: {
              operation: null,
              path: null,
              contentHash: null,
              returnedRange: {},
              total: 0,
              returned: 0,
              returnedUtf8Bytes: 0,
              omitted: 0,
              nextCursor: null,
              truncated: false,
              overrideUsed: false,
              exitCode: 2,
            },
            error: { code: "invalid_request", message },
          },
          undefined,
          2,
        )}\n`
      : `context: ${message}\n`,
  );
  process.exitCode = 2;
}

type OutputFormat = "model" | "json";

type ParsedArguments =
  | {
      readonly operation: "read";
      readonly root: string;
      readonly format: OutputFormat;
      readonly request: RepositoryReadRequest;
    }
  | {
      readonly operation: "search";
      readonly root: string;
      readonly format: OutputFormat;
      readonly request: RepositorySearchRequest;
    };

function parseArguments(args: readonly string[]): ParsedArguments {
  const [operation, ...rest] = args;
  if (operation === "--help" || operation === "-h") {
    printHelp();
    process.exit(0);
  }
  if (operation !== "read" && operation !== "search") {
    throw new Error("First argument must be read or search.");
  }

  const values = new Map<string, string>();
  let all = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (
      argument === undefined ||
      ![
        "--context",
        "--cursor",
        "--format",
        "--lines",
        "--matches",
        "--path",
        "--query",
        "--root",
        "--start",
      ].includes(argument)
    ) {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
    const value = rest[index + 1];
    if (value === undefined) {
      throw new Error(`${argument} requires a value.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const root = values.get("--root") ?? process.cwd();
  const format = parseFormat(values.get("--format"));
  if (all && format !== "json") {
    throw new Error("--all requires --format json; page model output with cursors.");
  }
  const targetPath = required(values, "--path");
  const cursor = values.get("--cursor");
  if (operation === "read") {
    reject(values, ["--context", "--matches", "--query"]);
    return {
      operation,
      root,
      format,
      request: {
        path: targetPath,
        ...(values.has("--start")
          ? { startLine: integer(values, "--start") }
          : {}),
        ...(values.has("--lines")
          ? { lines: integer(values, "--lines") }
          : {}),
        ...(cursor === undefined ? {} : { cursor }),
        ...(all ? { all: true } : {}),
      },
    };
  }

  reject(values, ["--lines", "--start"]);
  return {
    operation,
    root,
    format,
    request: {
      query: required(values, "--query"),
      path: targetPath,
      ...(values.has("--matches")
        ? { maxMatches: integer(values, "--matches") }
        : {}),
      ...(values.has("--context")
        ? { contextLines: integer(values, "--context") }
        : {}),
      ...(cursor === undefined ? {} : { cursor }),
      ...(all ? { all: true } : {}),
    },
  };
}

function parseFormat(value: string | undefined): OutputFormat {
  if (value === undefined || value === "model") {
    return "model";
  }
  if (value === "json") {
    return "json";
  }
  throw new Error("--format must be model or json.");
}

function formatResult(
  result: RepositoryContextResult,
  format: OutputFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(result, undefined, 2)}\n`;
  }

  const content = result.content.length === 0 ? "" : `${result.content}\n\n`;
  const next = result.metadata.nextCursor ?? "-";
  return `${content}[context outcome=${result.outcome} path=${result.metadata.path} returned=${result.metadata.returned} omitted=${result.metadata.omitted} next=${next}]\n`;
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function integer(values: ReadonlyMap<string, string>, name: string): number {
  const value = Number(required(values, name));
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  return value;
}

function reject(
  values: ReadonlyMap<string, string>,
  names: readonly string[],
): void {
  for (const name of names) {
    if (values.has(name)) {
      throw new Error(`${name} is not valid for this operation.`);
    }
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage:",
      "  pnpm context read --path <file> [--start <line>] [--lines <count>] [--cursor <token>] [--format model|json]",
      "  pnpm context search --query <text> --path <scope> [--matches <count>] [--context <lines>] [--cursor <token>] [--format model|json]",
      "",
      "Defaults: 10000 UTF-8 output bytes, 200 read lines, 50 matches, and 2 search context lines.",
      "Model output is the default. --all is available only with --format json.",
      "",
    ].join("\n"),
  );
}
