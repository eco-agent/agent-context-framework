import { mkdir, open, readFile, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import type { Usage } from "@openai/codex-sdk";
import {
  decodeJsonValue,
  type Evidence,
} from "@agent-context/codex-workflow-runtime";

import type {
  NewObjectiveWorkflowEvent,
  ObjectiveEvidenceLedger,
  ObjectiveWorkflowEvent,
  ObjectiveWorkflowEventType,
} from "./objective-contracts.js";
import { decodeObjectiveId } from "@agent-context/repo-policy";

function materializeEvent(
  runId: string,
  sequence: number,
  event: NewObjectiveWorkflowEvent,
): ObjectiveWorkflowEvent {
  return decodeWorkflowEvent({
    ...event,
    sequence,
    runId,
    at: new Date().toISOString(),
  }, sequence);
}

export class ObjectiveMemoryLedger implements ObjectiveEvidenceLedger {
  readonly #events: ObjectiveWorkflowEvent[] = [];

  public constructor(public readonly runId: string) {}

  public async append(
    event: NewObjectiveWorkflowEvent,
  ): Promise<ObjectiveWorkflowEvent> {
    const stored = materializeEvent(this.runId, this.#events.length + 1, event);
    this.#events.push(stored);
    return stored;
  }

  public async list(): Promise<readonly ObjectiveWorkflowEvent[]> {
    return [...this.#events];
  }
}

export class ObjectiveJsonlLedger implements ObjectiveEvidenceLedger {
  readonly #events: ObjectiveWorkflowEvent[];
  #writes: Promise<void> = Promise.resolve();

  private constructor(
    public readonly runId: string,
    private readonly filePath: string,
    events: ObjectiveWorkflowEvent[],
  ) {
    this.#events = events;
  }

  public static async open(
    filePath: string,
    runId: string,
  ): Promise<ObjectiveJsonlLedger> {
    await mkdir(dirname(filePath), { recursive: true });

    let contents = Buffer.alloc(0);
    try {
      contents = await readFile(filePath);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }

    if (contents.length > 0 && contents.at(-1) !== 0x0a) {
      const lastNewline = contents.lastIndexOf(0x0a);
      const completeLength = lastNewline + 1;
      await truncate(filePath, completeLength);
      contents = contents.subarray(0, completeLength);
    }
    const lines = contents.toString("utf8").split(/\r?\n/u);
    if (lines.at(-1) === "") {
      lines.pop();
    }
    const events = lines.map((line, index) => {
      const lineNumber = index + 1;
      if (line.trim().length === 0) {
        throw new Error(`Workflow ledger line ${lineNumber} is empty.`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `Workflow ledger line ${lineNumber} is not valid JSON.`,
          { cause: error },
        );
      }
      return decodeWorkflowEvent(parsed, lineNumber);
    });

    if (events.some((event) => event.runId !== runId)) {
      throw new Error(`Ledger ${filePath} contains a different run ID`);
    }
    if (events.some((event, index) => event.sequence !== index + 1)) {
      throw new Error(`Ledger ${filePath} contains a non-contiguous sequence`);
    }

    return new ObjectiveJsonlLedger(runId, filePath, events);
  }

  public async append(
    event: NewObjectiveWorkflowEvent,
  ): Promise<ObjectiveWorkflowEvent> {
    let stored: ObjectiveWorkflowEvent | undefined;
    this.#writes = this.#writes.then(async () => {
      stored = materializeEvent(this.runId, this.#events.length + 1, event);
      const handle = await open(this.filePath, "a");
      try {
        await handle.writeFile(`${JSON.stringify(stored)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.#events.push(stored);
    });
    await this.#writes;
    if (stored === undefined) throw new Error("Workflow ledger append did not materialize.");
    return stored;
  }

  public async list(): Promise<readonly ObjectiveWorkflowEvent[]> {
    await this.#writes;
    return [...this.#events];
  }
}

const eventTypes = new Set<ObjectiveWorkflowEventType>([
  "loop.started",
  "loop.transition",
  "loop.completed",
  "loop.escalated",
  "loop.budget_exhausted",
  "codex.started",
  "codex.completed",
  "codex.failed",
  "context.completed",
  "context.budget_exhausted",
  "environment.intent",
  "environment.applied",
  "environment.failed",
]);

function decodeWorkflowEvent(
  input: unknown,
  line: number,
): ObjectiveWorkflowEvent {
  const value = decodeObject(input, `Workflow ledger line ${line}`);
  const allowed = new Set([
    "sequence", "runId", "objectiveId", "at", "type", "loop", "actor", "threadId",
    "state", "evidence", "usage",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Workflow ledger line ${line} contains unknown fields: ${unknown.join(", ")}.`,
    );
  }

  const sequence = decodePositiveInteger(value.sequence, `line ${line} sequence`);
  const runId = decodeRequiredString(value.runId, `line ${line} runId`);
  const objectiveId = decodeObjectiveId(value.objectiveId);
  const at = decodeRequiredString(value.at, `line ${line} at`);
  if (!Number.isFinite(Date.parse(at))) {
    throw new Error(`Workflow ledger line ${line} has an invalid timestamp.`);
  }
  const eventType = decodeRequiredString(value.type, `line ${line} type`);
  if (!eventTypes.has(eventType as ObjectiveWorkflowEventType)) {
    throw new Error(`Workflow ledger line ${line} has an unknown event type.`);
  }
  const type = eventType as ObjectiveWorkflowEventType;
  const loop = decodeRequiredString(value.loop, `line ${line} loop`);
  const actor = decodeOptionalString(value.actor, `line ${line} actor`);
  const threadId = decodeOptionalString(value.threadId, `line ${line} threadId`);
  assertEventMetadata(type, actor, threadId, line);

  return {
    objectiveId,
    sequence,
    runId,
    at,
    type,
    loop,
    state: decodeJsonValue(value.state),
    evidence: decodeEvidenceList(value.evidence, line),
    ...(actor === undefined ? {} : { actor }),
    ...(threadId === undefined ? {} : { threadId }),
    ...(value.usage === undefined ? {} : { usage: decodeUsage(value.usage, line) }),
  };
}

function assertEventMetadata(
  type: ObjectiveWorkflowEventType,
  actor: string | undefined,
  threadId: string | undefined,
  line: number,
): void {
  if (type.startsWith("codex.") && actor === undefined) {
    throw new Error(`Workflow ledger line ${line} ${type} requires an actor.`);
  }
  if (type === "codex.completed" && threadId === undefined) {
    throw new Error(`Workflow ledger line ${line} ${type} requires a threadId.`);
  }
  if (
    threadId !== undefined &&
    type !== "codex.completed" &&
    type !== "codex.failed"
  ) {
    throw new Error(`Workflow ledger line ${line} ${type} cannot contain a threadId.`);
  }
}

function decodeEvidenceList(input: unknown, line: number): readonly Evidence[] {
  if (!Array.isArray(input)) {
    throw new Error(`Workflow ledger line ${line} evidence must be an array.`);
  }
  return input.map((item, index) => {
    const value = decodeObject(item, `line ${line} evidence ${index}`);
    const allowed = new Set(["kind", "summary", "references", "data"]);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
      throw new Error(`Workflow ledger line ${line} has invalid evidence fields.`);
    }
    if (!Array.isArray(value.references)) {
      throw new Error(
        `Workflow ledger line ${line} evidence references must be an array.`,
      );
    }
    const references = value.references.map((reference) =>
      decodeRequiredString(reference, `line ${line} evidence reference`)
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
    throw new Error(`Workflow ledger line ${line} has invalid usage fields.`);
  }
  const result = Object.fromEntries(
    keys.map((key) => {
      const count = value[key];
      if (!Number.isSafeInteger(count) || (count as number) < 0) {
        throw new Error(`Workflow ledger line ${line} has invalid usage.`);
      }
      return [key, count as number];
    }),
  );
  // type-invariant: every Usage key is present and decoded as a non-negative
  // safe integer above. Object.fromEntries cannot preserve that fixed key set.
  return result as unknown as Usage;
}

function decodeObject(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }
  // type-invariant: the object, array, and null checks prove string-keyed access;
  // every consumed field is decoded before it reaches the domain contract.
  return input as Record<string, unknown>;
}

function decodeRequiredString(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return input;
}

function decodeOptionalString(
  input: unknown,
  label: string,
): string | undefined {
  return input === undefined ? undefined : decodeRequiredString(input, label);
}

function decodePositiveInteger(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return input as number;
}
