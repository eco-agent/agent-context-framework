import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  open,
  mkdir,
  readFile,
  rm,
  stat,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  decodeActiveTaskBinding,
  decodeCapabilityRequest,
  decodeObjectiveId,
  type ObjectiveId,
} from "@agent-context/repo-policy";

import { ObjectiveJsonlLedger } from "./ledger.js";
import {
  ObjectiveRepositoryContext,
  RepositoryContextTool,
  type RepositoryContextResult,
  type RepositoryReadRequest,
  type RepositorySearchRequest,
} from "./repository-context.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OBJECTIVE_BUDGET_BYTES = 100_000;
const MAX_BATCH_REQUESTS = 4;
const MAX_BATCH_CONTENT_BYTES = 10_000;
export const MAX_BATCH_MODEL_VISIBLE_BYTES = 12_000;
const LOCK_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

export type RepoContextRequest =
  | {
      readonly operation: "read";
      readonly path: string;
      readonly startLine?: number;
      readonly limit?: number;
      readonly cursor?: string;
    }
  | {
      readonly operation: "search";
      readonly path: string;
      readonly query: string;
      readonly limit?: number;
      readonly contextLines?: number;
      readonly cursor?: string;
    };

export interface RepoContextBatchRequest {
  readonly operation: "batch";
  readonly requests: readonly RepoContextRequest[];
}

export interface RepoContextBatchResult {
  readonly outcome: RepositoryContextResult["outcome"];
  readonly results: readonly RepositoryContextResult[];
  readonly metadata: {
    readonly requestCount: number;
    readonly returnedUtf8Bytes: number;
    readonly maxModelVisibleBytes: number;
  };
}

export type RepoContextExecutionRequest =
  | RepoContextRequest
  | RepoContextBatchRequest;

export type RepoContextExecutionResult =
  | RepositoryContextResult
  | RepoContextBatchResult;

interface ObjectiveBinding {
  readonly id: ObjectiveId;
  readonly ledgerPath: string;
  readonly lockPath: string;
}

export class RepoContextRuntime {
  readonly #tool: RepositoryContextTool;
  readonly #root: string;
  readonly #gitDirectory: string;
  readonly #unboundId: string;
  readonly #budgetBytes: number;

  private constructor(
    tool: RepositoryContextTool,
    root: string,
    gitDirectory: string,
    unboundId: string,
    budgetBytes: number,
  ) {
    this.#tool = tool;
    this.#root = root;
    this.#gitDirectory = gitDirectory;
    this.#unboundId = unboundId;
    this.#budgetBytes = budgetBytes;
  }

  public static async open(
    cwd: string,
    options: { readonly budgetBytes?: number; readonly unboundId?: string } = {},
  ): Promise<RepoContextRuntime> {
    const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
    const gitDirectory = await git(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
    ]);
    const budgetBytes =
      options.budgetBytes ?? environmentBudget(process.env.CONTROL_TOWER_CONTEXT_BUDGET_BYTES);
    return new RepoContextRuntime(
      await RepositoryContextTool.open(root),
      root,
      gitDirectory,
      options.unboundId ?? process.env.CODEX_THREAD_ID ?? randomUUID(),
      budgetBytes,
    );
  }

  public async execute(
    request: RepoContextRequest,
  ): Promise<RepositoryContextResult>;
  public async execute(
    request: RepoContextBatchRequest,
  ): Promise<RepoContextBatchResult>;
  public async execute(
    request: RepoContextExecutionRequest,
  ): Promise<RepoContextExecutionResult> {
    const objective = await this.resolveObjective();
    await mkdir(path.dirname(objective.lockPath), { recursive: true });
    return await withFileLock(objective.lockPath, async () => {
      const ledger = await ObjectiveJsonlLedger.open(
        objective.ledgerPath,
        `repository-context:${objective.id}`,
      );
      const context = new ObjectiveRepositoryContext(this.#tool, ledger, {
        objectiveId: objective.id,
        maxRepositoryOutputBytes: this.#budgetBytes,
      });
      if (request.operation !== "batch") {
        return await executeRequest(context, request);
      }
      return await executeRepoContextBatch(context, request.requests);
    });
  }

  private async resolveObjective(): Promise<ObjectiveBinding> {
    const currentPath = path.join(this.#gitDirectory, "codex", "active-task.json");
    let boundObjectiveId = unboundObjectiveId(this.#unboundId);
    try {
      const binding = decodeActiveTaskBinding(
        JSON.parse(await readFile(currentPath, "utf8")) as unknown,
      );
      const requestPath = repositoryPath(this.#root, binding.requestPath);
      const contractPath = repositoryPath(this.#root, binding.contractPath);
      const [requestBytes, contractBytes] = await Promise.all([
        readFile(requestPath),
        readFile(contractPath),
      ]);
      if (
        sha256(requestBytes) !== binding.requestHash ||
        sha256(contractBytes) !== binding.contractHash
      ) {
        throw new Error("Active task source changed after activation.");
      }
      const request = decodeCapabilityRequest(JSON.parse(requestBytes.toString("utf8")) as unknown);
      if (request.contractPath !== binding.contractPath) {
        throw new Error("Active task contract does not match its capability request.");
      }
      if (request.objectiveId !== binding.objectiveId) {
        throw new Error("Active task objective does not match its capability request.");
      }
      boundObjectiveId = binding.objectiveId;
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }

    const directory = path.join(this.#gitDirectory, "codex", "context-ledgers");
    const safeId = boundObjectiveId.replace(/[^A-Za-z0-9._-]/gu, "-");
    return {
      id: boundObjectiveId,
      ledgerPath: path.join(directory, `${safeId}.jsonl`),
      lockPath: path.join(directory, `${safeId}.lock`),
    };
  }
}

function unboundObjectiveId(seed: string): ObjectiveId {
  const digest = createHash("sha256").update(`repo-context:${seed}`).digest("hex");
  return decodeObjectiveId(
    `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
  );
}

export function formatRepoContextResult(result: RepositoryContextResult): string {
  const content = result.content.length === 0 ? "" : `${result.content}\n\n`;
  const objective = result.metadata.objective;
  const budget = objective === undefined
    ? "-"
    : `${objective.cumulativeUtf8Bytes}/${objective.maxUtf8Bytes}`;
  return `${content}[context outcome=${result.outcome} path=${result.metadata.path} returned=${result.metadata.returned} omitted=${result.metadata.omitted} budget=${budget} next=${result.metadata.nextCursor ?? "-"}]`;
}

export function formatRepoContextBatchResult(
  result: RepoContextBatchResult,
): string {
  const sections = result.results.map((item, index) => {
    const content = item.content.length === 0 ? "" : `${item.content}\n`;
    return `${content}[context index=${index + 1} outcome=${item.outcome} returned=${item.metadata.returned} omitted=${item.metadata.omitted} next=${item.metadata.nextCursor ?? "-"}]`;
  });
  const rendered = [
    ...sections,
    `[context batch outcome=${result.outcome} requests=${result.metadata.requestCount} returnedBytes=${result.metadata.returnedUtf8Bytes} maxBytes=${result.metadata.maxModelVisibleBytes}]`,
  ].join("\n\n");
  if (Buffer.byteLength(rendered, "utf8") > MAX_BATCH_MODEL_VISIBLE_BYTES) {
    throw new Error("Repository context batch exceeded its model-visible byte ceiling.");
  }
  return rendered;
}

export async function executeRepoContextBatch(
  context: ObjectiveRepositoryContext,
  requests: readonly RepoContextRequest[],
): Promise<RepoContextBatchResult> {
  assertBatchSize(requests);
  const perRequestBytes = Math.floor(
    MAX_BATCH_CONTENT_BYTES / requests.length,
  );
  const results: RepositoryContextResult[] = [];
  for (const request of requests) {
    results.push(await executeRequest(context, request, perRequestBytes));
  }
  return {
    outcome: aggregateBatchOutcome(results),
    results,
    metadata: {
      requestCount: results.length,
      returnedUtf8Bytes: results.reduce(
        (total, result) => total + result.metadata.returnedUtf8Bytes,
        0,
      ),
      maxModelVisibleBytes: MAX_BATCH_MODEL_VISIBLE_BYTES,
    },
  };
}

async function executeRequest(
  context: ObjectiveRepositoryContext,
  request: RepoContextRequest,
  maxOutputBytes?: number,
): Promise<RepositoryContextResult> {
  return request.operation === "read"
    ? await context.read(toReadRequest(request, maxOutputBytes))
    : await context.search(toSearchRequest(request, maxOutputBytes));
}

function aggregateBatchOutcome(
  results: readonly RepositoryContextResult[],
): RepositoryContextResult["outcome"] {
  if (results.some((result) => result.outcome === "budget_exhausted")) {
    return "budget_exhausted";
  }
  return results.every((result) => result.outcome === "no_match")
    ? "no_match"
    : "success";
}

function assertBatchSize(requests: readonly RepoContextRequest[]): void {
  if (requests.length < 1 || requests.length > MAX_BATCH_REQUESTS) {
    throw new Error(`Repository context batches require 1-${MAX_BATCH_REQUESTS} requests.`);
  }
}

function toReadRequest(
  request: Extract<RepoContextRequest, { operation: "read" }>,
  maxOutputBytes?: number,
): RepositoryReadRequest {
  return {
    path: request.path,
    ...(request.startLine === undefined ? {} : { startLine: request.startLine }),
    ...(request.limit === undefined ? {} : { lines: request.limit }),
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
    ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
  };
}

function toSearchRequest(
  request: Extract<RepoContextRequest, { operation: "search" }>,
  maxOutputBytes?: number,
): RepositorySearchRequest {
  return {
    path: request.path,
    query: request.query,
    ...(request.limit === undefined ? {} : { maxMatches: request.limit }),
    ...(request.contextLines === undefined ? {} : { contextLines: request.contextLines }),
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
    ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
  };
}

async function withFileLock<T>(lockPath: string, work: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let handle: FileHandle | null = null;
  while (handle === null) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`, "utf8");
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat !== null && Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("Repository context objective is busy.");
      }
      await delay(20);
    }
  }

  try {
    return await work();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

function environmentBudget(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_OBJECTIVE_BUDGET_BYTES;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("CONTROL_TOWER_CONTEXT_BUDGET_BYTES must be a positive integer.");
  }
  return parsed;
}

function repositoryPath(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Active task path is outside the repository.");
  }
  return absolute;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
