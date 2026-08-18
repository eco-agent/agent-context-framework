import {
  applyObjectiveCommand,
  authorizeObjectiveCommand,
  decodeObjectiveCommand,
  decodeObjectiveEvent,
  decodeObjectiveSnapshot,
  decodeTrustedActor,
  createInitialSnapshot,
  type CommandId,
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
} from "@agent-context/objective-kernel";
import type { ObjectiveClock } from "./clock.js";
import { digestObjectiveCommand } from "./digest.js";

interface CommandReceipt {
  readonly digest: string;
  readonly result: {
    readonly status: "accepted";
    readonly snapshot: ObjectiveSnapshot;
    readonly event: ObjectiveEvent;
  };
}

export class MemoryObjectiveStore implements ObjectiveCommandStore {
  readonly #clock: ObjectiveClock;
  readonly #snapshots = new Map<ObjectiveId, ObjectiveSnapshot>();
  readonly #events = new Map<ObjectiveId, ObjectiveEvent[]>();
  readonly #receipts = new Map<CommandId, CommandReceipt>();

  public constructor(clock: ObjectiveClock) {
    this.#clock = clock;
  }

  public async execute(
    rawCommand: ObjectiveCommand,
    rawActor: TrustedActor,
  ): Promise<ObjectiveCommandResult> {
    const command = decodeObjectiveCommand(rawCommand);
    const actor = decodeTrustedActor(rawActor);
    const digest = digestObjectiveCommand(command);
    const receipt = this.#receipts.get(command.commandId);
    if (receipt !== undefined) {
      if (receipt.digest !== digest) {
        return {
          status: "rejected",
          code: "command_conflict",
          message: "CommandId was already accepted with different canonical content.",
        };
      }
      return {
        status: "replayed",
        snapshot: decodeObjectiveSnapshot(receipt.result.snapshot),
        event: decodeObjectiveEvent(receipt.result.event),
      };
    }

    const now = this.#clock.now();
    if (command.type === "create") {
      if (this.#snapshots.has(command.objectiveId)) {
        return rejected("already_exists", "Objective already exists.");
      }
      if (command.definition.dependencies.includes(command.objectiveId)) {
        return rejected("invalid_command", "An objective cannot depend on itself.");
      }
      const missingRelationship = this.#missingRelationship(command);
      if (missingRelationship !== undefined) {
        return rejected("invalid_command", missingRelationship);
      }
      const authorization = authorizeObjectiveCommand(command.definition, command, actor);
      if (authorization?.status === "rejected") {
        return authorization;
      }
      const snapshot = createInitialSnapshot(command, now);
      return this.#accept(command, actor, digest, snapshot, "create");
    }

    const current = this.#snapshots.get(command.objectiveId);
    if (current === undefined) {
      return rejected("not_found", "Objective does not exist.");
    }
    const authorization = authorizeObjectiveCommand(current.definition, command, actor);
    if (authorization?.status === "rejected") {
      return {
        status: "rejected",
        code: authorization.code,
        message: authorization.message,
        currentVersion: current.version,
      };
    }
    const transition = applyObjectiveCommand(current, command, {
      now,
      dependenciesSatisfied: this.#allCompleted(current.definition.dependencies),
      waitConditionSatisfied: this.#waitSatisfied(current, now),
    });
    if (transition.status === "rejected") {
      return { ...transition, currentVersion: current.version };
    }
    return this.#accept(command, actor, digest, transition.snapshot, transition.eventType, current);
  }

  public async get(objectiveId: ObjectiveId): Promise<ObjectiveSnapshot | undefined> {
    const snapshot = this.#snapshots.get(objectiveId);
    return snapshot === undefined ? undefined : decodeObjectiveSnapshot(snapshot);
  }

  public async listReady(query: ReadyObjectiveQuery): Promise<readonly ReadyObjective[]> {
    const now = this.#clock.now();
    return [...this.#snapshots.values()]
      .filter((snapshot) => {
        if (snapshot.state !== "ready" || snapshot.availableAt > now) return false;
        if (!this.#allCompleted(snapshot.definition.dependencies)) return false;
        if (query.parentObjectiveId === undefined) return true;
        return (
          snapshot.definition.parent.type === "child" &&
          snapshot.definition.parent.objectiveId === query.parentObjectiveId
        );
      })
      .sort((left, right) =>
        left.state === "ready" && right.state === "ready"
          ? left.availableAt.localeCompare(right.availableAt) ||
            left.definition.objectiveId.localeCompare(right.definition.objectiveId)
          : 0,
      )
      .slice(0, query.limit)
      .map((snapshot) => {
        const decoded = decodeObjectiveSnapshot(snapshot);
        if (decoded.state !== "ready") throw new Error("Ready objective index returned another state.");
        return decoded;
      });
  }

  public async list(query: ObjectiveListQuery): Promise<readonly ObjectiveSnapshot[]> {
    const states = query.states === undefined ? undefined : new Set(query.states);
    return [...this.#snapshots.values()]
      .filter((snapshot) => {
        if (states !== undefined && !states.has(snapshot.state)) return false;
        if (
          query.afterObjectiveId !== undefined &&
          snapshot.definition.objectiveId <= query.afterObjectiveId
        ) return false;
        if (query.parentObjectiveId === undefined) return true;
        return (
          snapshot.definition.parent.type === "child" &&
          snapshot.definition.parent.objectiveId === query.parentObjectiveId
        );
      })
      .sort((left, right) =>
        left.definition.objectiveId.localeCompare(right.definition.objectiveId),
      )
      .slice(0, query.limit)
      .map((snapshot) => decodeObjectiveSnapshot(snapshot));
  }

  public async events(
    objectiveId: ObjectiveId,
    query: ObjectiveEventQuery = {},
  ): Promise<readonly ObjectiveEvent[]> {
    const after = query.afterSequence ?? 0;
    const limit = query.limit ?? Number.MAX_SAFE_INTEGER;
    return (this.#events.get(objectiveId) ?? [])
      .filter((event) => event.sequence > after)
      .slice(0, limit)
      .map((event) => decodeObjectiveEvent(event));
  }

  #accept(
    command: ObjectiveCommand,
    actor: TrustedActor,
    digest: string,
    snapshot: ObjectiveSnapshot,
    eventType: ObjectiveEvent["eventType"],
    previous?: ObjectiveSnapshot,
  ): ObjectiveCommandResult {
    const event: ObjectiveEvent = {
      schemaVersion: 1,
      objectiveId: command.objectiveId,
      sequence: snapshot.eventSequence,
      version: snapshot.version,
      eventType,
      commandId: command.commandId,
      commandDigest: digest,
      actorId: actor.actorId,
      occurredAt: snapshot.updatedAt,
      ...(previous === undefined ? {} : { previousState: previous.state }),
      snapshot,
    };
    const storedSnapshot = decodeObjectiveSnapshot(snapshot);
    const storedEvent = decodeObjectiveEvent({ ...event, snapshot: storedSnapshot });
    this.#snapshots.set(command.objectiveId, storedSnapshot);
    const events = this.#events.get(command.objectiveId) ?? [];
    events.push(storedEvent);
    this.#events.set(command.objectiveId, events);
    const result = { status: "accepted" as const, snapshot: storedSnapshot, event: storedEvent };
    this.#receipts.set(command.commandId, { digest, result });
    return {
      status: "accepted",
      snapshot: decodeObjectiveSnapshot(storedSnapshot),
      event: decodeObjectiveEvent(storedEvent),
    };
  }

  #allCompleted(objectiveIds: readonly ObjectiveId[]): boolean {
    return objectiveIds.every((id) => {
      const snapshot = this.#snapshots.get(id);
      return snapshot?.state === "terminal" && snapshot.outcome.type === "completed";
    });
  }

  #waitSatisfied(snapshot: ObjectiveSnapshot, now: string): boolean {
    if (snapshot.state !== "waiting") return false;
    switch (snapshot.condition.type) {
      case "timer":
        return snapshot.condition.wakeAt <= now;
      case "dependency":
      case "children":
        return this.#allCompleted(snapshot.condition.objectiveIds);
      case "external_signal":
        // The authenticated wake command is itself the durable external signal record.
        return true;
    }
  }

  #missingRelationship(command: Extract<ObjectiveCommand, { type: "create" }>): string | undefined {
    if (
      command.definition.parent.type === "child" &&
      !this.#snapshots.has(command.definition.parent.objectiveId)
    ) {
      return "Child objective parent does not exist.";
    }
    const missing = command.definition.dependencies.find((id) => !this.#snapshots.has(id));
    return missing === undefined ? undefined : `Dependency ${missing} does not exist.`;
  }
}

function rejected(
  code: Extract<ObjectiveCommandResult, { status: "rejected" }>["code"],
  message: string,
): ObjectiveCommandResult {
  return { status: "rejected", code, message };
}
