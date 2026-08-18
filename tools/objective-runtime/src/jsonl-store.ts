import { mkdir, open, readFile, truncate } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  decodeObjectiveCommand,
  decodeTrustedActor,
  utcTimestamp,
  type ObjectiveCommand,
  type ObjectiveCommandResult,
  type ObjectiveCommandStore,
  type ObjectiveEvent,
  type ObjectiveEventQuery,
  type ObjectiveId,
  type ObjectiveListQuery,
  type ObjectiveSnapshot,
  type ReadyObjectiveQuery,
  type ReadyObjective,
  type TrustedActor,
  type UtcTimestamp,
} from "@agent-context/objective-kernel";
import { ManualObjectiveClock, type ObjectiveClock } from "./clock.js";
import { MemoryObjectiveStore } from "./memory-store.js";

interface JournalRecord {
  readonly recordVersion: 1;
  readonly occurredAt: UtcTimestamp;
  readonly command: ObjectiveCommand;
  readonly actor: TrustedActor;
  readonly expected: {
    readonly version: number;
    readonly sequence: number;
    readonly commandDigest: string;
    readonly eventType: ObjectiveEvent["eventType"];
  };
}

export interface JsonlObjectiveStoreOptions {
  readonly clock: ObjectiveClock;
  readonly maxRecordBytes?: number;
}

const claimedJournals = new Set<string>();

export class JsonlObjectiveStore implements ObjectiveCommandStore {
  readonly #path: string;
  readonly #clock: ObjectiveClock;
  readonly #maxRecordBytes: number;
  #records: JournalRecord[];
  #memory: MemoryObjectiveStore;
  #queue: Promise<void> = Promise.resolve();
  #closed = false;
  public readonly recoveredTruncatedBytes: number;

  private constructor(
    path: string,
    options: JsonlObjectiveStoreOptions,
    records: JournalRecord[],
    memory: MemoryObjectiveStore,
    recoveredTruncatedBytes: number,
  ) {
    this.#path = path;
    this.#clock = options.clock;
    this.#maxRecordBytes = options.maxRecordBytes ?? 1_048_576;
    this.#records = records;
    this.#memory = memory;
    this.recoveredTruncatedBytes = recoveredTruncatedBytes;
  }

  public static async open(
    path: string,
    options: JsonlObjectiveStoreOptions,
  ): Promise<JsonlObjectiveStore> {
    if (!Number.isSafeInteger(options.maxRecordBytes ?? 1_048_576) || (options.maxRecordBytes ?? 1_048_576) < 1_024) {
      throw new TypeError("maxRecordBytes must be a safe integer of at least 1024 bytes.");
    }
    const absolute = resolve(path);
    if (claimedJournals.has(absolute)) {
      throw new Error(`JSONL objective journal is already open in this process: ${absolute}`);
    }
    claimedJournals.add(absolute);
    try {
      await mkdir(dirname(absolute), { recursive: true });
      const loaded = await loadJournal(absolute, options.maxRecordBytes ?? 1_048_576);
      const memory = await replayRecords(loaded.records);
      return new JsonlObjectiveStore(
        absolute,
        options,
        loaded.records,
        memory,
        loaded.recoveredTruncatedBytes,
      );
    } catch (error) {
      claimedJournals.delete(absolute);
      throw error;
    }
  }

  public execute(
    rawCommand: ObjectiveCommand,
    rawActor: TrustedActor,
  ): Promise<ObjectiveCommandResult> {
    return this.#exclusive(async () => {
      this.#assertOpen();
      const command = decodeObjectiveCommand(rawCommand);
      const actor = decodeTrustedActor(rawActor);
      const replayClock = new ManualObjectiveClock(this.#clock.now());
      const candidate = await replayRecords(this.#records, replayClock);
      replayClock.set(this.#clock.now());
      const result = await candidate.execute(command, actor);
      if (result.status !== "accepted") {
        return result;
      }
      const record: JournalRecord = {
        recordVersion: 1,
        occurredAt: replayClock.now(),
        command,
        actor,
        expected: {
          version: result.snapshot.version,
          sequence: result.event.sequence,
          commandDigest: result.event.commandDigest,
          eventType: result.event.eventType,
        },
      };
      const line = `${JSON.stringify(record)}\n`;
      if (Buffer.byteLength(line) > this.#maxRecordBytes) {
        return {
          status: "rejected",
          code: "invalid_command",
          message: `Serialized journal record exceeds ${this.#maxRecordBytes} bytes.`,
        };
      }
      await appendDurably(this.#path, line);
      this.#records = [...this.#records, record];
      this.#memory = candidate;
      return result;
    });
  }

  public get(objectiveId: ObjectiveId): Promise<ObjectiveSnapshot | undefined> {
    return this.#exclusive(async () => {
      this.#assertOpen();
      return this.#memory.get(objectiveId);
    });
  }

  public listReady(query: ReadyObjectiveQuery): Promise<readonly ReadyObjective[]> {
    return this.#exclusive(async () => {
      this.#assertOpen();
      return this.#memory.listReady(query);
    });
  }

  public list(query: ObjectiveListQuery): Promise<readonly ObjectiveSnapshot[]> {
    return this.#exclusive(async () => {
      this.#assertOpen();
      return this.#memory.list(query);
    });
  }

  public events(
    objectiveId: ObjectiveId,
    query?: ObjectiveEventQuery,
  ): Promise<readonly ObjectiveEvent[]> {
    return this.#exclusive(async () => {
      this.#assertOpen();
      return this.#memory.events(objectiveId, query);
    });
  }

  public close(): Promise<void> {
    return this.#exclusive(async () => {
      if (!this.#closed) {
        this.#closed = true;
        claimedJournals.delete(this.#path);
      }
    });
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("JSONL objective store is closed.");
  }
}

async function appendDurably(path: string, line: string): Promise<void> {
  const handle = await open(path, "a");
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function loadJournal(
  path: string,
  maxRecordBytes: number,
): Promise<{ readonly records: JournalRecord[]; readonly recoveredTruncatedBytes: number }> {
  let content: Buffer;
  try {
    content = await readFile(path);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      const handle = await open(path, "a");
      await handle.close();
      return { records: [], recoveredTruncatedBytes: 0 };
    }
    throw error;
  }
  if (content.length === 0) return { records: [], recoveredTruncatedBytes: 0 };

  const lastNewline = content.lastIndexOf(0x0a);
  const completeLength = lastNewline + 1;
  const recoveredTruncatedBytes = content.length - completeLength;
  if (recoveredTruncatedBytes > 0) {
    await truncate(path, completeLength);
    content = content.subarray(0, completeLength);
  }
  const lines = content.toString("utf8").split("\n");
  lines.pop();
  const records = lines.map((line, index) => {
    if (Buffer.byteLength(line) + 1 > maxRecordBytes) {
      throw new Error(`Objective journal record ${index + 1} exceeds ${maxRecordBytes} bytes.`);
    }
    try {
      return decodeJournalRecord(JSON.parse(line) as unknown, index + 1);
    } catch (error) {
      throw new Error(`Invalid objective journal record ${index + 1}.`, { cause: error });
    }
  });
  return { records, recoveredTruncatedBytes };
}

async function replayRecords(
  records: readonly JournalRecord[],
  clock = new ManualObjectiveClock(utcTimestamp("1970-01-01T00:00:00.000Z")),
): Promise<MemoryObjectiveStore> {
  const store = new MemoryObjectiveStore(clock);
  for (const [index, record] of records.entries()) {
    clock.set(record.occurredAt);
    const result = await store.execute(record.command, record.actor);
    if (result.status !== "accepted") {
      throw new Error(
        `Objective journal replay rejected record ${index + 1}: ${result.status === "rejected" ? result.code : result.status}.`,
      );
    }
    if (
      result.snapshot.version !== record.expected.version ||
      result.event.sequence !== record.expected.sequence ||
      result.event.commandDigest !== record.expected.commandDigest ||
      result.event.eventType !== record.expected.eventType
    ) {
      throw new Error(`Objective journal replay diverged at record ${index + 1}.`);
    }
  }
  return store;
}

function decodeJournalRecord(input: unknown, line: number): JournalRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError(`Journal line ${line} must be an object.`);
  }
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (
    keys.length !== 5 ||
    !["recordVersion", "occurredAt", "command", "actor", "expected"].every((key) => key in value)
  ) {
    throw new TypeError(`Journal line ${line} has an invalid record shape.`);
  }
  if (value.recordVersion !== 1) throw new TypeError("Unsupported journal record version.");
  const expected = value.expected;
  if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
    throw new TypeError("Journal expected proof must be an object.");
  }
  const proof = expected as Record<string, unknown>;
  const eventTypes = new Set([
    "create", "acquire_lease", "renew_lease", "checkpoint", "release", "wait",
    "wake", "recover_expired_lease", "complete", "fail", "cancel", "budget_exhausted",
  ]);
  if (
    !Number.isSafeInteger(proof.version) ||
    !Number.isSafeInteger(proof.sequence) ||
    typeof proof.commandDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(proof.commandDigest) ||
    typeof proof.eventType !== "string" ||
    !eventTypes.has(proof.eventType)
  ) {
    throw new TypeError("Journal expected proof is invalid.");
  }
  return {
    recordVersion: 1,
    occurredAt: utcTimestamp(String(value.occurredAt)),
    command: decodeObjectiveCommand(value.command),
    actor: decodeTrustedActor(value.actor),
    expected: {
      version: proof.version as number,
      sequence: proof.sequence as number,
      commandDigest: proof.commandDigest,
      eventType: proof.eventType as ObjectiveEvent["eventType"],
    },
  };
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
