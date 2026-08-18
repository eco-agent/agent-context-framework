import {
  applyObjectiveCommand,
  authorizeObjectiveCommand,
  createInitialSnapshot,
  decodeObjectiveCommand,
  decodeObjectiveEvent,
  decodeObjectiveSnapshot,
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
import { PgClient } from "@effect/sql-pg";
import type { SqlError } from "@effect/sql/SqlError";
import { Effect, ManagedRuntime, Redacted } from "effect";
import { digestObjectiveCommand } from "./digest.js";

const POSTGRES_OBJECTIVE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS objective_runtime;

CREATE TABLE IF NOT EXISTS objective_runtime.objectives (
  store_name text NOT NULL,
  objective_id uuid NOT NULL,
  objective_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('ready', 'leased', 'waiting', 'terminal')),
  version bigint NOT NULL,
  event_sequence bigint NOT NULL,
  parent_objective_id uuid,
  available_at timestamptz,
  lease_expires_at timestamptz,
  snapshot_json jsonb NOT NULL,
  PRIMARY KEY (store_name, objective_id)
);

CREATE INDEX IF NOT EXISTS objectives_ready_idx
  ON objective_runtime.objectives (store_name, state, available_at, objective_id);
CREATE INDEX IF NOT EXISTS objectives_parent_idx
  ON objective_runtime.objectives (store_name, parent_objective_id, objective_id);
CREATE INDEX IF NOT EXISTS objectives_lease_idx
  ON objective_runtime.objectives (store_name, state, lease_expires_at, objective_id);

CREATE TABLE IF NOT EXISTS objective_runtime.dependencies (
  store_name text NOT NULL,
  objective_id uuid NOT NULL,
  dependency_objective_id uuid NOT NULL,
  PRIMARY KEY (store_name, objective_id, dependency_objective_id),
  FOREIGN KEY (store_name, objective_id)
    REFERENCES objective_runtime.objectives (store_name, objective_id) ON DELETE CASCADE,
  FOREIGN KEY (store_name, dependency_objective_id)
    REFERENCES objective_runtime.objectives (store_name, objective_id)
);

CREATE TABLE IF NOT EXISTS objective_runtime.events (
  store_name text NOT NULL,
  objective_id uuid NOT NULL,
  sequence bigint NOT NULL,
  version bigint NOT NULL,
  command_id uuid NOT NULL,
  command_digest text NOT NULL,
  event_json jsonb NOT NULL,
  PRIMARY KEY (store_name, objective_id, sequence),
  UNIQUE (store_name, command_id),
  FOREIGN KEY (store_name, objective_id)
    REFERENCES objective_runtime.objectives (store_name, objective_id) ON DELETE CASCADE
);
`;

export interface PostgresObjectiveStoreOptions {
  readonly databaseUrl: string;
  readonly storeName: string;
  readonly applicationName?: string;
  readonly maxConnections?: number;
}

type PgRuntime = ManagedRuntime.ManagedRuntime<PgClient.PgClient, SqlError>;

export class PostgresObjectiveStore implements ObjectiveCommandStore {
  readonly #runtime: PgRuntime;
  readonly #storeName: string;
  #closed = false;

  private constructor(runtime: PgRuntime, storeName: string) {
    this.#runtime = runtime;
    this.#storeName = storeName;
  }

  public static async open(options: PostgresObjectiveStoreOptions): Promise<PostgresObjectiveStore> {
    validateOptions(options);
    const runtime = ManagedRuntime.make(
      PgClient.layer({
        url: Redacted.make(options.databaseUrl),
        maxConnections: options.maxConnections ?? 8,
        minConnections: 1,
        connectTimeout: "5 seconds",
        idleTimeout: "30 seconds",
        applicationName: options.applicationName ?? "objective-runtime",
      }),
    );
    const store = new PostgresObjectiveStore(runtime, options.storeName);
    try {
      await runtime.runPromise(
        Effect.gen(function*() {
          const sql = yield* PgClient.PgClient;
          yield* sql.withTransaction(
            Effect.gen(function*() {
              yield* sql`
                SELECT pg_advisory_xact_lock(
                  hashtextextended('objective_runtime_schema_v1', 0)
                )
              `;
              yield* sql.unsafe(POSTGRES_OBJECTIVE_SCHEMA_SQL);
            }),
          );
        }),
      );
      return store;
    } catch (error) {
      await runtime.dispose();
      throw error;
    }
  }

  public async execute(
    rawCommand: ObjectiveCommand,
    rawActor: TrustedActor,
  ): Promise<ObjectiveCommandResult> {
    this.#assertOpen();
    const command = decodeObjectiveCommand(rawCommand);
    const actor = decodeTrustedActor(rawActor);
    const digest = digestObjectiveCommand(command);
    return await this.#runtime.runPromise(
      Effect.gen(this, function*() {
        const sql = yield* PgClient.PgClient;
        return yield* sql.withTransaction(
          Effect.gen(this, function*() {
            yield* sql`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${`${this.#storeName}:${command.commandId}`}, 0)
              )
            `;
            const receipt = yield* sql<{ readonly commandDigest: string; readonly eventJson: unknown }>`
              SELECT
                command_digest AS "commandDigest",
                event_json AS "eventJson"
              FROM objective_runtime.events
              WHERE store_name = ${this.#storeName}
                AND command_id = ${command.commandId}::uuid
            `;
            const existing = receipt[0];
            if (existing !== undefined) {
              if (existing.commandDigest !== digest) {
                return rejected("command_conflict", "CommandId was already accepted with different canonical content.");
              }
              const event = decodeObjectiveEvent(existing.eventJson);
              return { status: "replayed", snapshot: event.snapshot, event } as const;
            }

            const now = yield* databaseNow(sql);
            if (command.type === "create") {
              if (command.definition.dependencies.includes(command.objectiveId)) {
                return rejected("invalid_command", "An objective cannot depend on itself.");
              }
              const authorization = authorizeObjectiveCommand(command.definition, command, actor);
              if (authorization?.status === "rejected") return authorization;
              if (command.definition.parent.type === "child") {
                const parent = yield* sql<{ readonly found: number }>`
                  SELECT 1 AS found
                  FROM objective_runtime.objectives
                  WHERE store_name = ${this.#storeName}
                    AND objective_id = ${command.definition.parent.objectiveId}::uuid
                `;
                if (parent.length === 0) {
                  return rejected("invalid_command", "Child objective parent does not exist.");
                }
              }
              for (const dependencyId of command.definition.dependencies) {
                const dependency = yield* sql<{ readonly found: number }>`
                  SELECT 1 AS found
                  FROM objective_runtime.objectives
                  WHERE store_name = ${this.#storeName}
                    AND objective_id = ${dependencyId}::uuid
                `;
                if (dependency.length === 0) {
                  return rejected("invalid_command", `Dependency ${dependencyId} does not exist.`);
                }
              }
              const snapshot = createInitialSnapshot(command, now);
              const inserted = yield* sql<{ readonly objectiveId: string }>`
                INSERT INTO objective_runtime.objectives (
                  store_name, objective_id, objective_key, state, version, event_sequence,
                  parent_objective_id, available_at, lease_expires_at, snapshot_json
                ) VALUES (
                  ${this.#storeName}, ${command.objectiveId}::uuid,
                  ${command.definition.objectiveKey}, ${snapshot.state}, ${snapshot.version},
                  ${snapshot.eventSequence},
                  ${command.definition.parent.type === "child" ? command.definition.parent.objectiveId : null}::uuid,
                  ${snapshot.availableAt}::timestamptz, NULL, ${JSON.stringify(snapshot)}::jsonb
                )
                ON CONFLICT (store_name, objective_id) DO NOTHING
                RETURNING objective_id::text AS "objectiveId"
              `;
              if (inserted.length === 0) return rejected("already_exists", "Objective already exists.");
              for (const dependencyId of command.definition.dependencies) {
                yield* sql`
                  INSERT INTO objective_runtime.dependencies (
                    store_name, objective_id, dependency_objective_id
                  ) VALUES (
                    ${this.#storeName}, ${command.objectiveId}::uuid, ${dependencyId}::uuid
                  )
                `;
              }
              return yield* writeEvent(sql, this.#storeName, command, actor, digest, snapshot, "create");
            }

            const rows = yield* sql<{ readonly snapshotJson: unknown }>`
              SELECT snapshot_json AS "snapshotJson"
              FROM objective_runtime.objectives
              WHERE store_name = ${this.#storeName}
                AND objective_id = ${command.objectiveId}::uuid
              FOR UPDATE
            `;
            const row = rows[0];
            if (row === undefined) return rejected("not_found", "Objective does not exist.");
            const current = decodeObjectiveSnapshot(row.snapshotJson);
            const authorization = authorizeObjectiveCommand(current.definition, command, actor);
            if (authorization?.status === "rejected") {
              return { ...authorization, currentVersion: current.version };
            }
            const dependenciesSatisfied = yield* allCompleted(
              sql,
              this.#storeName,
              current.definition.dependencies,
            );
            const waitConditionSatisfied = yield* waitSatisfied(
              sql,
              this.#storeName,
              current,
              now,
            );
            const transition = applyObjectiveCommand(current, command, {
              now,
              dependenciesSatisfied,
              waitConditionSatisfied,
            });
            if (transition.status === "rejected") {
              return { ...transition, currentVersion: current.version };
            }
            const snapshot = transition.snapshot;
            yield* sql`
              UPDATE objective_runtime.objectives
              SET state = ${snapshot.state},
                  version = ${snapshot.version},
                  event_sequence = ${snapshot.eventSequence},
                  available_at = ${snapshot.state === "ready" ? snapshot.availableAt : null}::timestamptz,
                  lease_expires_at = ${snapshot.state === "leased" ? snapshot.lease.expiresAt : null}::timestamptz,
                  snapshot_json = ${JSON.stringify(snapshot)}::jsonb
              WHERE store_name = ${this.#storeName}
                AND objective_id = ${command.objectiveId}::uuid
                AND version = ${current.version}
            `;
            return yield* writeEvent(
              sql,
              this.#storeName,
              command,
              actor,
              digest,
              snapshot,
              transition.eventType,
              current,
            );
          }),
        );
      }),
    );
  }

  public async get(objectiveId: ObjectiveId): Promise<ObjectiveSnapshot | undefined> {
    this.#assertOpen();
    return await this.#runtime.runPromise(
      Effect.gen(this, function*() {
        const sql = yield* PgClient.PgClient;
        const rows = yield* sql<{ readonly snapshotJson: unknown }>`
          SELECT snapshot_json AS "snapshotJson"
          FROM objective_runtime.objectives
          WHERE store_name = ${this.#storeName}
            AND objective_id = ${objectiveId}::uuid
        `;
        return rows[0] === undefined ? undefined : decodeObjectiveSnapshot(rows[0].snapshotJson);
      }),
    );
  }

  public async listReady(query: ReadyObjectiveQuery): Promise<readonly ReadyObjective[]> {
    this.#assertOpen();
    validateLimit(query.limit);
    return await this.#runtime.runPromise(
      Effect.gen(this, function*() {
        const sql = yield* PgClient.PgClient;
        const rows = yield* sql<{ readonly snapshotJson: unknown }>`
          SELECT objective.snapshot_json AS "snapshotJson"
          FROM objective_runtime.objectives AS objective
          WHERE objective.store_name = ${this.#storeName}
            AND objective.state = 'ready'
            AND objective.available_at <= clock_timestamp()
            AND (${query.parentObjectiveId ?? null}::uuid IS NULL
              OR objective.parent_objective_id = ${query.parentObjectiveId ?? null}::uuid)
            AND NOT EXISTS (
              SELECT 1
              FROM objective_runtime.dependencies AS dependency
              LEFT JOIN objective_runtime.objectives AS prerequisite
                ON prerequisite.store_name = dependency.store_name
               AND prerequisite.objective_id = dependency.dependency_objective_id
              WHERE dependency.store_name = objective.store_name
                AND dependency.objective_id = objective.objective_id
                AND (
                  prerequisite.state IS DISTINCT FROM 'terminal'
                  OR prerequisite.snapshot_json->'outcome'->>'type' IS DISTINCT FROM 'completed'
                )
            )
          ORDER BY objective.available_at, objective.objective_id
          LIMIT ${query.limit}
        `;
        return rows.map((row) => {
          const snapshot = decodeObjectiveSnapshot(row.snapshotJson);
          if (snapshot.state !== "ready") throw new Error("Ready objective query returned another state.");
          return snapshot;
        });
      }),
    );
  }

  public async list(query: ObjectiveListQuery): Promise<readonly ObjectiveSnapshot[]> {
    this.#assertOpen();
    validateLimit(query.limit);
    const includeAll = query.states === undefined;
    const includes = (state: ObjectiveSnapshot["state"]) => query.states?.includes(state) ?? false;
    return await this.#runtime.runPromise(
      Effect.gen(this, function*() {
        const sql = yield* PgClient.PgClient;
        const rows = yield* sql<{ readonly snapshotJson: unknown }>`
          SELECT snapshot_json AS "snapshotJson"
          FROM objective_runtime.objectives
          WHERE store_name = ${this.#storeName}
            AND (
              ${includeAll}
              OR (state = 'ready' AND ${includes("ready")})
              OR (state = 'leased' AND ${includes("leased")})
              OR (state = 'waiting' AND ${includes("waiting")})
              OR (state = 'terminal' AND ${includes("terminal")})
            )
            AND (${query.afterObjectiveId ?? null}::uuid IS NULL
              OR objective_id > ${query.afterObjectiveId ?? null}::uuid)
            AND (${query.parentObjectiveId ?? null}::uuid IS NULL
              OR parent_objective_id = ${query.parentObjectiveId ?? null}::uuid)
          ORDER BY objective_id
          LIMIT ${query.limit}
        `;
        return rows.map((row) => decodeObjectiveSnapshot(row.snapshotJson));
      }),
    );
  }

  public async events(
    objectiveId: ObjectiveId,
    query: ObjectiveEventQuery = {},
  ): Promise<readonly ObjectiveEvent[]> {
    this.#assertOpen();
    const limit = query.limit ?? 10_000;
    validateLimit(limit, 10_000);
    const after = query.afterSequence ?? 0;
    if (!Number.isSafeInteger(after) || after < 0) throw new TypeError("afterSequence must be non-negative.");
    return await this.#runtime.runPromise(
      Effect.gen(this, function*() {
        const sql = yield* PgClient.PgClient;
        const rows = yield* sql<{ readonly eventJson: unknown }>`
          SELECT event_json AS "eventJson"
          FROM objective_runtime.events
          WHERE store_name = ${this.#storeName}
            AND objective_id = ${objectiveId}::uuid
            AND sequence > ${after}
          ORDER BY sequence
          LIMIT ${limit}
        `;
        return rows.map((row) => decodeObjectiveEvent(row.eventJson));
      }),
    );
  }

  public async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.#runtime.dispose();
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("PostgreSQL objective store is closed.");
  }
}

function databaseNow(sql: PgClient.PgClient) {
  return Effect.gen(function*() {
    const rows = yield* sql<{ readonly now: string }>`
      SELECT to_char(
        clock_timestamp() AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ) AS now
    `;
    const value = rows[0]?.now;
    if (value === undefined) return yield* Effect.dieMessage("objective_database_clock_missing");
    return utcTimestamp(value);
  });
}

function writeEvent(
  sql: PgClient.PgClient,
  storeName: string,
  command: ObjectiveCommand,
  actor: TrustedActor,
  digest: string,
  snapshot: ObjectiveSnapshot,
  eventType: ObjectiveEvent["eventType"],
  previous?: ObjectiveSnapshot,
) {
  return Effect.gen(function*() {
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
    yield* sql`
      INSERT INTO objective_runtime.events (
        store_name, objective_id, sequence, version, command_id, command_digest, event_json
      ) VALUES (
        ${storeName}, ${command.objectiveId}::uuid, ${event.sequence}, ${event.version},
        ${command.commandId}::uuid, ${digest}, ${JSON.stringify(event)}::jsonb
      )
    `;
    return { status: "accepted", snapshot, event } as const;
  });
}

function allCompleted(
  sql: PgClient.PgClient,
  storeName: string,
  objectiveIds: readonly ObjectiveId[],
) {
  return Effect.gen(function*() {
    for (const objectiveId of objectiveIds) {
      const rows = yield* sql<{ readonly state: string; readonly outcomeType: string | null }>`
        SELECT
          state,
          snapshot_json->'outcome'->>'type' AS "outcomeType"
        FROM objective_runtime.objectives
        WHERE store_name = ${storeName}
          AND objective_id = ${objectiveId}::uuid
      `;
      if (rows[0]?.state !== "terminal" || rows[0]?.outcomeType !== "completed") return false;
    }
    return true;
  });
}

function waitSatisfied(
  sql: PgClient.PgClient,
  storeName: string,
  snapshot: ObjectiveSnapshot,
  now: UtcTimestamp,
) {
  if (snapshot.state !== "waiting") return Effect.succeed(false);
  switch (snapshot.condition.type) {
    case "timer": return Effect.succeed(snapshot.condition.wakeAt <= now);
    case "dependency":
    case "children": return allCompleted(sql, storeName, snapshot.condition.objectiveIds);
    case "external_signal": return Effect.succeed(true);
  }
}

function validateOptions(options: PostgresObjectiveStoreOptions): void {
  if (options.databaseUrl.length === 0) throw new TypeError("databaseUrl is required.");
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/u.test(options.storeName)) {
    throw new TypeError("storeName must contain 1 to 100 lowercase portable name characters.");
  }
  if (
    options.maxConnections !== undefined &&
    (!Number.isSafeInteger(options.maxConnections) || options.maxConnections < 1 || options.maxConnections > 100)
  ) {
    throw new TypeError("maxConnections must be between 1 and 100.");
  }
}

function validateLimit(limit: number, maximum = 1_000): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new TypeError(`limit must be between 1 and ${maximum}.`);
  }
}

function rejected(
  code: Extract<ObjectiveCommandResult, { status: "rejected" }>["code"],
  message: string,
): ObjectiveCommandResult {
  return { status: "rejected", code, message };
}
