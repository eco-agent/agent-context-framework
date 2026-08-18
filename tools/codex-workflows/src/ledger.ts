import { mkdir, open, readFile, truncate } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  EvidenceLedger,
  NewWorkflowEvent,
  WorkflowEvent,
} from "./contracts.js";
import { decodeObjectiveId } from "@agent-context/repo-policy";

function materializeEvent(
  runId: string,
  sequence: number,
  event: NewWorkflowEvent,
): WorkflowEvent {
  const stored: WorkflowEvent = {
    ...event,
    sequence,
    runId,
    at: new Date().toISOString(),
  };
  return stored;
}

export class MemoryLedger implements EvidenceLedger {
  readonly #events: WorkflowEvent[] = [];

  public constructor(public readonly runId: string) {}

  public async append(event: NewWorkflowEvent): Promise<WorkflowEvent> {
    const stored = materializeEvent(this.runId, this.#events.length + 1, event);
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
  ) {
    this.#events = events;
  }

  public static async open(
    filePath: string,
    runId: string,
  ): Promise<JsonlLedger> {
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
    const events = contents.toString("utf8")
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line, index) => decodeWorkflowEvent(JSON.parse(line) as unknown, index + 1));

    if (events.some((event) => event.runId !== runId)) {
      throw new Error(`Ledger ${filePath} contains a different run ID`);
    }
    if (events.some((event, index) => event.sequence !== index + 1)) {
      throw new Error(`Ledger ${filePath} contains a non-contiguous sequence`);
    }

    return new JsonlLedger(runId, filePath, events);
  }

  public async append(event: NewWorkflowEvent): Promise<WorkflowEvent> {
    let stored: WorkflowEvent | undefined;
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

  public async list(): Promise<readonly WorkflowEvent[]> {
    await this.#writes;
    return [...this.#events];
  }
}

function decodeWorkflowEvent(input: unknown, line: number): WorkflowEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`Workflow ledger line ${line} must be an object.`);
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set([
    "sequence", "runId", "objectiveId", "at", "type", "loop", "actor", "threadId",
    "state", "evidence", "usage",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`Workflow ledger line ${line} contains unknown fields.`);
  }
  if (
    !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 ||
    typeof value.runId !== "string" || value.runId.length === 0 ||
    typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at)) ||
    typeof value.type !== "string" || typeof value.loop !== "string" ||
    !Array.isArray(value.evidence) || !("state" in value)
  ) {
    throw new Error(`Workflow ledger line ${line} has an invalid event shape.`);
  }
  decodeObjectiveId(value.objectiveId);
  if (value.actor !== undefined && typeof value.actor !== "string") {
    throw new Error(`Workflow ledger line ${line} has an invalid actor.`);
  }
  if (value.threadId !== undefined && typeof value.threadId !== "string") {
    throw new Error(`Workflow ledger line ${line} has an invalid threadId.`);
  }
  return value as unknown as WorkflowEvent;
}
