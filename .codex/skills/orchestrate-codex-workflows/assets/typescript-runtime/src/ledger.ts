import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  EvidenceLedger,
  NewWorkflowEvent,
  WorkflowEvent,
} from "./contracts.js";

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

    const events = contents
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as WorkflowEvent);

    if (events.some((event) => event.runId !== runId)) {
      throw new Error(`Ledger ${filePath} contains a different run ID`);
    }

    return new JsonlLedger(runId, filePath, events);
  }

  public async append(event: NewWorkflowEvent): Promise<WorkflowEvent> {
    const stored = materializeEvent(this.runId, this.#events.length + 1, event);
    this.#events.push(stored);

    this.#writes = this.#writes.then(() =>
      appendFile(this.filePath, `${JSON.stringify(stored)}\n`, "utf8"),
    );
    await this.#writes;
    return stored;
  }

  public async list(): Promise<readonly WorkflowEvent[]> {
    await this.#writes;
    return [...this.#events];
  }
}
