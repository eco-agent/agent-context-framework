import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  Evidence,
  EvidenceLedger,
  JsonValue,
  NewWorkflowEvent,
  WorkflowEvent,
  WorkflowEventType,
} from "./contracts.js";
import { decodeJsonValue } from "./contracts.js";
import type { Usage } from "@openai/codex-sdk";

export type JsonlAppend = (
  filePath: string,
  contents: string,
  encoding: "utf8",
) => Promise<void>;

function materializeEvent(
  runId: string,
  sequence: number,
  event: NewWorkflowEvent,
): WorkflowEvent {
  return {
    ...event,
    sequence,
    runId,
    at: new Date().toISOString(),
  };
}

export class MemoryLedger implements EvidenceLedger {
  readonly #events: WorkflowEvent[] = [];

  public constructor(public readonly runId: string) {}

  public async append(event: NewWorkflowEvent): Promise<WorkflowEvent> {
    const stored = decodeWorkflowEvent(
      materializeEvent(this.runId, this.#events.length + 1, event),
      this.#events.length + 1,
    );
    this.#events.push(stored);
    return stored;
  }

  public async list(): Promise<readonly WorkflowEvent[]> {
    return [...this.#events];
  }
}

export class JsonlLedger implements EvidenceLedger {
  readonly #events: WorkflowEvent[];
  #writes: Promise<void> = Promise.resolve();

  private constructor(
    public readonly runId: string,
    private readonly filePath: string,
    events: WorkflowEvent[],
    private readonly appendLine: JsonlAppend,
  ) {
    this.#events = events;
  }

  public static async open(
    filePath: string,
    runId: string,
    appendLine: JsonlAppend = appendFile,
  ): Promise<JsonlLedger> {
    await mkdir(dirname(filePath), { recursive: true });

    let contents = "";
    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }

    const lines = contents.split(/\r?\n/u);
    if (lines.at(-1) === "") {
      lines.pop();
    }
    const events = lines.map((line, index) => {
      const lineNumber = index + 1;
      if (line.trim().length === 0) {
        throw new Error(`Workflow ledger line ${lineNumber} is empty`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `Workflow ledger line ${lineNumber} is not valid JSON`,
          { cause: error },
        );
      }
      const event = decodeWorkflowEvent(parsed, lineNumber);
      if (event.runId !== runId) {
        throw new Error(`Ledger ${filePath} contains a different run ID`);
      }
      if (event.sequence !== lineNumber) {
        throw new Error(`Ledger ${filePath} contains a non-contiguous sequence`);
      }
      return event;
    });

    if (events.length === 0 && contents.trim().length > 0) {
      throw new Error(`Ledger ${filePath} contains no valid events`);
    }

    return new JsonlLedger(runId, filePath, events, appendLine);
  }

  public async append(event: NewWorkflowEvent): Promise<WorkflowEvent> {
    let stored: WorkflowEvent | undefined;
    this.#writes = this.#writes.then(async () => {
      stored = decodeWorkflowEvent(
        materializeEvent(this.runId, this.#events.length + 1, event),
        this.#events.length + 1,
      );
      await this.appendLine(
        this.filePath,
        `${JSON.stringify(stored)}\n`,
        "utf8",
      );
      this.#events.push(stored);
    });
    await this.#writes;
    if (stored === undefined) {
      throw new Error("Workflow ledger append did not materialize");
    }
    return stored;
  }

  public async list(): Promise<readonly WorkflowEvent[]> {
    await this.#writes.catch(() => undefined);
    return [...this.#events];
  }
}

const eventTypes = new Set<WorkflowEventType>([
  "loop.started",
  "loop.transition",
  "loop.completed",
  "loop.escalated",
  "loop.budget_exhausted",
  "codex.started",
  "codex.thread_bound",
  "codex.completed",
  "codex.failed",
  "task.accepted",
  "environment.intent",
  "environment.applied",
  "environment.failed",
]);

function decodeWorkflowEvent(input: unknown, line: number): WorkflowEvent {
  const value = decodeObject(input, `Workflow ledger line ${line}`);
  const allowed = new Set([
    "sequence",
    "runId",
    "at",
    "type",
    "loop",
    "actor",
    "threadId",
    "taskId",
    "attempt",
    "state",
    "evidence",
    "usage",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Workflow ledger line ${line} contains unknown fields: ${unknown.join(", ")}`,
    );
  }

  const sequence = value.sequence;
  if (!Number.isSafeInteger(sequence) || (sequence as number) < 1) {
    throw new Error(`Workflow ledger line ${line} has an invalid sequence`);
  }
  const runId = decodeRequiredString(value.runId, `line ${line} runId`);
  const at = decodeRequiredString(value.at, `line ${line} at`);
  if (!Number.isFinite(Date.parse(at))) {
    throw new Error(`Workflow ledger line ${line} has an invalid timestamp`);
  }
  const type = decodeRequiredString(value.type, `line ${line} type`);
  if (!eventTypes.has(type as WorkflowEventType)) {
    throw new Error(`Workflow ledger line ${line} has an unknown event type`);
  }
  const loop = decodeRequiredString(value.loop, `line ${line} loop`);
  const evidence = decodeEvidenceList(value.evidence, line);
  const state = decodeJsonValue(value.state);
  const actor = decodeOptionalString(value.actor, `line ${line} actor`);
  const threadId = decodeOptionalString(value.threadId, `line ${line} threadId`);
  const taskId = decodeOptionalString(value.taskId, `line ${line} taskId`);
  const attempt = decodeOptionalPositiveInteger(
    value.attempt,
    `line ${line} attempt`,
  );
  if ((taskId === undefined) !== (attempt === undefined)) {
    throw new Error(
      `Workflow ledger line ${line} must pair taskId with attempt`,
    );
  }
  const eventType = type as WorkflowEventType;
  assertEventMetadata(
    eventType,
    { actor, threadId, taskId, attempt },
    line,
  );
  const usage = value.usage === undefined ? undefined : decodeUsage(value.usage, line);

  return {
    sequence: sequence as number,
    runId,
    at,
    type: eventType,
    loop,
    state,
    evidence,
    ...(actor === undefined ? {} : { actor }),
    ...(threadId === undefined ? {} : { threadId }),
    ...(taskId === undefined ? {} : { taskId }),
    ...(attempt === undefined ? {} : { attempt }),
    ...(usage === undefined ? {} : { usage }),
  };
}

function assertEventMetadata(
  type: WorkflowEventType,
  metadata: {
    readonly actor: string | undefined;
    readonly threadId: string | undefined;
    readonly taskId: string | undefined;
    readonly attempt: number | undefined;
  },
  line: number,
): void {
  const taskEvents = new Set<WorkflowEventType>([
    "codex.started",
    "codex.thread_bound",
    "codex.completed",
    "codex.failed",
    "task.accepted",
  ]);
  const requiresThread =
    type === "codex.thread_bound" || type === "codex.completed";
  const permitsThread =
    requiresThread || type === "codex.failed";

  if (taskEvents.has(type)) {
    if (
      metadata.actor === undefined ||
      metadata.taskId === undefined ||
      metadata.attempt === undefined
    ) {
      throw new Error(
        `Workflow ledger line ${line} ${type} requires actor, taskId, and attempt`,
      );
    }
  } else if (metadata.taskId !== undefined || metadata.attempt !== undefined) {
    throw new Error(
      `Workflow ledger line ${line} ${type} cannot contain task metadata`,
    );
  }

  if (requiresThread && metadata.threadId === undefined) {
    throw new Error(
      `Workflow ledger line ${line} ${type} requires threadId`,
    );
  }
  if (!permitsThread && metadata.threadId !== undefined) {
    throw new Error(
      `Workflow ledger line ${line} ${type} cannot contain threadId`,
    );
  }
}

function decodeEvidenceList(input: unknown, line: number): readonly Evidence[] {
  if (!Array.isArray(input)) {
    throw new Error(`Workflow ledger line ${line} evidence must be an array`);
  }
  return input.map((item, index) => {
    const value = decodeObject(item, `line ${line} evidence ${index}`);
    const allowed = new Set(["kind", "summary", "references", "data"]);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
      throw new Error(`Workflow ledger line ${line} has invalid evidence fields`);
    }
    if (!Array.isArray(value.references)) {
      throw new Error(`Workflow ledger line ${line} evidence references must be an array`);
    }
    const references = value.references.map((reference) =>
      decodeRequiredString(reference, `line ${line} evidence reference`),
    );
    return {
      kind: decodeRequiredString(value.kind, `line ${line} evidence kind`),
      summary: decodeRequiredString(value.summary, `line ${line} evidence summary`),
      references,
      ...(value.data === undefined ? {} : { data: decodeJsonValue(value.data) }),
    };
  });
}

function decodeUsage(input: unknown, line: number): Usage {
  const value = decodeObject(input, `line ${line} usage`);
  const keys = [
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ] as const;
  if (Object.keys(value).some((key) => !keys.includes(key as typeof keys[number]))) {
    throw new Error(`Workflow ledger line ${line} has invalid usage fields`);
  }
  const result = Object.fromEntries(
    keys.map((key) => {
      const count = value[key];
      if (!Number.isSafeInteger(count) || (count as number) < 0) {
        throw new Error(`Workflow ledger line ${line} has invalid usage`);
      }
      return [key, count as number];
    }),
  );
  return result as unknown as Usage;
}

function decodeObject(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function decodeRequiredString(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return input;
}

function decodeOptionalString(
  input: unknown,
  label: string,
): string | undefined {
  return input === undefined ? undefined : decodeRequiredString(input, label);
}

function decodeOptionalPositiveInteger(
  input: unknown,
  label: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(input) || (input as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return input as number;
}
