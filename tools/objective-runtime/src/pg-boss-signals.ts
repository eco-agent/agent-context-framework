import { createHash } from "node:crypto";
import type { PgBoss } from "pg-boss";
import {
  objectiveId,
  type ObjectiveCommandStore,
  type ObjectiveId,
  type ReadyObjective,
} from "@agent-context/objective-kernel";

export const OBJECTIVE_READY_QUEUE = "objective-runtime-ready-v1";

export interface ObjectiveReadySignalV1 {
  readonly schemaVersion: 1;
  readonly storeName: string;
  readonly objectiveId: ObjectiveId;
  readonly objectiveVersion: number;
}

export async function configureObjectiveReadyQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(OBJECTIVE_READY_QUEUE, {
    policy: "standard",
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    expireInSeconds: 60,
    retentionSeconds: 86_400,
    deleteAfterSeconds: 86_400,
  });
}

export async function signalObjectiveReady(
  boss: PgBoss,
  signal: ObjectiveReadySignalV1,
): Promise<string | null> {
  const decoded = decodeObjectiveReadySignal(signal);
  return await boss.send(
    OBJECTIVE_READY_QUEUE,
    decoded,
    { id: stableSignalId(decoded) },
  );
}

export async function reconcileObjectiveReadySignals(
  boss: PgBoss,
  store: ObjectiveCommandStore,
  storeName: string,
  limit = 100,
): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new TypeError("signal reconciliation limit must be between 1 and 1000.");
  }
  const ready = await store.listReady({ limit });
  await Promise.all(
    ready.map((snapshot) =>
      signalObjectiveReady(boss, readySignal(storeName, snapshot)),
    ),
  );
  return ready.length;
}

export function decodeObjectiveReadySignal(input: unknown): ObjectiveReadySignalV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Objective ready signal must be an object.");
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 4 ||
    value.schemaVersion !== 1 ||
    typeof value.storeName !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,99}$/u.test(value.storeName) ||
    typeof value.objectiveId !== "string" ||
    !Number.isSafeInteger(value.objectiveVersion) ||
    (value.objectiveVersion as number) < 1
  ) {
    throw new TypeError("Objective ready signal is invalid.");
  }
  return {
    schemaVersion: 1,
    storeName: value.storeName,
    objectiveId: objectiveId(value.objectiveId),
    objectiveVersion: value.objectiveVersion as number,
  };
}

function readySignal(storeName: string, snapshot: ReadyObjective): ObjectiveReadySignalV1 {
  return decodeObjectiveReadySignal({
    schemaVersion: 1,
    storeName,
    objectiveId: snapshot.definition.objectiveId,
    objectiveVersion: snapshot.version,
  });
}

function stableSignalId(signal: ObjectiveReadySignalV1): string {
  const hex = createHash("sha256")
    .update(`${signal.storeName}:${signal.objectiveId}:${signal.objectiveVersion}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
