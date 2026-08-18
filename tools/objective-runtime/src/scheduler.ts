import { randomUUID } from "node:crypto";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  leaseId,
  runId,
  type ArtifactReference,
  type LeasedObjective,
  type ObjectiveArtifactStore,
  type ObjectiveCheckpoint,
  type ObjectiveCommandResult,
  type ObjectiveCommandStore,
  type ObjectiveEvidence,
  type ObjectiveSnapshot,
  type TrustedActor,
  type WaitCondition,
} from "@agent-context/objective-kernel";
import type { ObjectiveClock } from "./clock.js";

export interface ObjectiveCheckpointUpdate {
  readonly summary: string;
  readonly progressPercent: number;
  readonly artifacts?: readonly ArtifactReference[];
  readonly contextBytesDelta?: number;
  readonly promptBytesDelta?: number;
  readonly agentInputTokensDelta?: number;
  readonly agentOutputTokensDelta?: number;
  readonly resumeToken?: string;
}

export interface ObjectiveAttemptContext {
  readonly snapshot: LeasedObjective;
  readonly signal: AbortSignal;
  readonly artifacts?: ObjectiveArtifactStore;
  checkpoint(update: ObjectiveCheckpointUpdate): Promise<ObjectiveCheckpoint>;
}

export type ObjectiveAttemptOutcome =
  | {
      readonly type: "completed";
      readonly summary: string;
      readonly evidence: readonly ObjectiveEvidence[];
      readonly contextBytes?: number;
      readonly promptBytes?: number;
      readonly agentInputTokens?: number;
      readonly agentOutputTokens?: number;
    }
  | {
      readonly type: "failed";
      readonly code: string;
      readonly message: string;
      readonly retryable: false;
      readonly evidence?: readonly ObjectiveEvidence[];
      readonly contextBytes?: number;
      readonly promptBytes?: number;
      readonly agentInputTokens?: number;
      readonly agentOutputTokens?: number;
    }
  | {
      readonly type: "retry";
      readonly reason: string;
      readonly retryAfterMs: number;
    }
  | {
      readonly type: "waiting";
      readonly condition: WaitCondition;
      readonly checkpointSummary: string;
    };

export interface ObjectiveAttemptRunner {
  run(context: ObjectiveAttemptContext): Promise<ObjectiveAttemptOutcome>;
}

export interface ObjectiveSchedulerOptions {
  readonly store: ObjectiveCommandStore;
  readonly runner: ObjectiveAttemptRunner;
  readonly clock: ObjectiveClock;
  readonly workerActor: TrustedActor;
  readonly coordinatorActor: TrustedActor;
  readonly workerId: string;
  readonly maxConcurrency: number;
  readonly leaseDurationMs: number;
  readonly pollIntervalMs?: number;
  readonly recoveryBatchSize?: number;
  readonly artifactStore?: ObjectiveArtifactStore;
}

export interface ObjectiveSchedulerSummary {
  readonly acquired: number;
  readonly completed: number;
  readonly failed: number;
  readonly retried: number;
  readonly waiting: number;
  readonly lostLeases: number;
  readonly recovered: number;
  readonly woken: number;
  readonly budgetExhausted: number;
}

interface MutableSummary {
  acquired: number;
  completed: number;
  failed: number;
  retried: number;
  waiting: number;
  lostLeases: number;
  recovered: number;
  woken: number;
  budgetExhausted: number;
}

export class ObjectiveBudgetExhaustedError extends Error {
  public constructor() {
    super("Objective reached a durable budget-exhausted terminal state.");
    this.name = "ObjectiveBudgetExhaustedError";
  }
}

export class ObjectiveScheduler {
  readonly #options: ObjectiveSchedulerOptions;
  #running = false;

  public constructor(options: ObjectiveSchedulerOptions) {
    validateOptions(options);
    this.#options = options;
  }

  public async runOnce(): Promise<ObjectiveSchedulerSummary> {
    if (this.#running) throw new Error("ObjectiveScheduler runOnce is already active.");
    this.#running = true;
    const summary = emptySummary();
    try {
      await this.#reconcile(summary);
      const candidates = await this.#options.store.listReady({
        limit: this.#options.maxConcurrency,
      });
      await Promise.all(candidates.map((candidate) => this.#attempt(candidate, summary)));
      return summary;
    } finally {
      this.#running = false;
    }
  }

  public async runUntilIdle(maxPasses = 100): Promise<ObjectiveSchedulerSummary> {
    if (!Number.isSafeInteger(maxPasses) || maxPasses < 1) {
      throw new TypeError("maxPasses must be a positive safe integer.");
    }
    const total = emptySummary();
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const current = await this.runOnce();
      mergeSummary(total, current);
      if (current.acquired === 0 && current.recovered === 0 && current.woken === 0) {
        return total;
      }
    }
    throw new Error(`ObjectiveScheduler did not become idle within ${maxPasses} passes.`);
  }

  public async runContinuously(signal: AbortSignal): Promise<ObjectiveSchedulerSummary> {
    const total = emptySummary();
    while (!signal.aborted) {
      const current = await this.runOnce();
      mergeSummary(total, current);
      if (!signal.aborted) {
        await abortableDelay(this.#options.pollIntervalMs ?? 1_000, signal);
      }
    }
    return total;
  }

  async #reconcile(summary: MutableSummary): Promise<void> {
    let cursor: ObjectiveSnapshot["definition"]["objectiveId"] | undefined;
    const limit = this.#options.recoveryBatchSize ?? 100;
    for (;;) {
      const page = await this.#options.store.list({
        states: ["leased", "waiting"],
        ...(cursor === undefined ? {} : { afterObjectiveId: cursor }),
        limit,
      });
      if (page.length === 0) return;
      for (const snapshot of page) {
        if (snapshot.state === "leased" && snapshot.lease.expiresAt <= this.#options.clock.now()) {
          const result = await this.#options.store.execute(
            {
              type: "recover_expired_lease",
              schemaVersion: 1,
              commandId: commandId(randomUUID()),
              objectiveId: snapshot.definition.objectiveId,
              expectedVersion: snapshot.version,
              reason: "scheduler reconciliation found an expired lease",
            },
            this.#options.coordinatorActor,
          );
          if (result.status === "accepted") summary.recovered += 1;
        } else if (snapshot.state === "waiting" && snapshot.condition.type !== "external_signal") {
          const result = await this.#options.store.execute(
            {
              type: "wake",
              schemaVersion: 1,
              commandId: commandId(randomUUID()),
              objectiveId: snapshot.definition.objectiveId,
              expectedVersion: snapshot.version,
              reason: "scheduler reconciliation evaluated the durable wait condition",
            },
            this.#options.coordinatorActor,
          );
          if (result.status === "accepted") summary.woken += 1;
        }
      }
      cursor = page.at(-1)?.definition.objectiveId;
      if (page.length < limit) return;
    }
  }

  async #attempt(candidate: ObjectiveSnapshot, summary: MutableSummary): Promise<void> {
    const acquired = await this.#options.store.execute(
      {
        type: "acquire_lease",
        schemaVersion: 1,
        commandId: commandId(randomUUID()),
        objectiveId: candidate.definition.objectiveId,
        expectedVersion: candidate.version,
        leaseId: leaseId(randomUUID()),
        workerId: this.#options.workerId,
        runId: runId(randomUUID()),
        durationMs: this.#options.leaseDurationMs,
      },
      this.#options.workerActor,
    );
    if (
      acquired.status === "accepted" &&
      acquired.snapshot.state === "terminal" &&
      acquired.snapshot.outcome.type === "budget_exhausted"
    ) {
      summary.budgetExhausted += 1;
      return;
    }
    if (acquired.status !== "accepted" || acquired.snapshot.state !== "leased") return;
    summary.acquired += 1;
    const session = new LeaseSession(this.#options, acquired.snapshot);
    try {
      const outcome = await this.#options.runner.run(session.context());
      const result = await session.finish(outcome);
      if (result.status !== "accepted") {
        summary.lostLeases += 1;
        return;
      }
      if (
        result.event.eventType === "budget_exhausted" ||
        (result.snapshot.state === "terminal" && result.snapshot.outcome.type === "budget_exhausted")
      ) {
        summary.budgetExhausted += 1;
        return;
      }
      switch (outcome.type) {
        case "completed": summary.completed += 1; break;
        case "failed": summary.failed += 1; break;
        case "retry": summary.retried += 1; break;
        case "waiting": summary.waiting += 1; break;
      }
    } catch (error) {
      if (error instanceof ObjectiveBudgetExhaustedError) {
        summary.budgetExhausted += 1;
        return;
      }
      const result = await session.finish({
        type: "retry",
        reason: `runner threw ${error instanceof Error ? error.name : "an unknown error"}`,
        retryAfterMs: 0,
      });
      if (result.status === "accepted") summary.retried += 1;
      else summary.lostLeases += 1;
    } finally {
      session.stop();
    }
  }
}

class LeaseSession {
  readonly #options: ObjectiveSchedulerOptions;
  readonly #abort = new AbortController();
  #snapshot: LeasedObjective;
  #queue: Promise<void> = Promise.resolve();
  #heartbeat: ReturnType<typeof setInterval>;

  public constructor(options: ObjectiveSchedulerOptions, snapshot: LeasedObjective) {
    this.#options = options;
    this.#snapshot = snapshot;
    const heartbeatMs = Math.max(250, Math.floor(options.leaseDurationMs / 3));
    this.#heartbeat = setInterval(() => {
      void this.#exclusive(async () => {
        const result = await this.#options.store.execute(
          {
            type: "renew_lease",
            schemaVersion: 1,
            commandId: commandId(randomUUID()),
            objectiveId: this.#snapshot.definition.objectiveId,
            expectedVersion: this.#snapshot.version,
            leaseId: this.#snapshot.lease.leaseId,
            workerId: this.#snapshot.lease.workerId,
            runId: this.#snapshot.lease.runId,
            durationMs: this.#options.leaseDurationMs,
          },
          this.#options.workerActor,
        );
        if (result.status === "accepted" && result.snapshot.state === "leased") {
          this.#snapshot = result.snapshot;
        } else {
          this.#abort.abort(new Error("Objective lease renewal failed."));
        }
      }).catch((error: unknown) => {
        this.#abort.abort(
          error instanceof Error ? error : new Error("Objective lease renewal failed."),
        );
      });
    }, heartbeatMs);
    this.#heartbeat.unref?.();
  }

  public context(): ObjectiveAttemptContext {
    const session = this;
    return {
      get snapshot() {
        return session.#snapshot;
      },
      signal: this.#abort.signal,
      ...(this.#options.artifactStore === undefined ? {} : { artifacts: this.#options.artifactStore }),
      checkpoint: (update) => this.#checkpoint(update),
    };
  }

  public finish(outcome: ObjectiveAttemptOutcome): Promise<ObjectiveCommandResult> {
    return this.#exclusive(async () => {
      const common = {
        schemaVersion: 1 as const,
        commandId: commandId(randomUUID()),
        objectiveId: this.#snapshot.definition.objectiveId,
        expectedVersion: this.#snapshot.version,
        leaseId: this.#snapshot.lease.leaseId,
        workerId: this.#snapshot.lease.workerId,
        runId: this.#snapshot.lease.runId,
      };
      switch (outcome.type) {
        case "completed":
          return this.#options.store.execute({
            ...common,
            type: "complete",
            summary: outcome.summary,
            evidence: outcome.evidence,
            contextBytesDelta: outcome.contextBytes ?? 0,
            promptBytesDelta: outcome.promptBytes ?? 0,
            agentInputTokensDelta: outcome.agentInputTokens ?? 0,
            agentOutputTokensDelta: outcome.agentOutputTokens ?? 0,
          }, this.#options.workerActor);
        case "failed":
          return this.#options.store.execute({
            ...common,
            type: "fail",
            code: outcome.code,
            message: outcome.message,
            retryable: false,
            evidence: outcome.evidence ?? [],
            contextBytesDelta: outcome.contextBytes ?? 0,
            promptBytesDelta: outcome.promptBytes ?? 0,
            agentInputTokensDelta: outcome.agentInputTokens ?? 0,
            agentOutputTokensDelta: outcome.agentOutputTokens ?? 0,
          }, this.#options.workerActor);
        case "retry":
          return this.#options.store.execute({
            ...common,
            type: "release",
            reason: outcome.reason,
            retryAfterMs: outcome.retryAfterMs,
          }, this.#options.workerActor);
        case "waiting":
          return this.#options.store.execute({
            ...common,
            type: "wait",
            condition: outcome.condition,
            checkpointSummary: outcome.checkpointSummary,
          }, this.#options.workerActor);
      }
    });
  }

  public stop(): void {
    clearInterval(this.#heartbeat);
  }

  #checkpoint(update: ObjectiveCheckpointUpdate): Promise<ObjectiveCheckpoint> {
    return this.#exclusive(async () => {
      const result = await this.#options.store.execute(
        {
          type: "checkpoint",
          schemaVersion: 1,
          commandId: commandId(randomUUID()),
          objectiveId: this.#snapshot.definition.objectiveId,
          expectedVersion: this.#snapshot.version,
          leaseId: this.#snapshot.lease.leaseId,
          workerId: this.#snapshot.lease.workerId,
          runId: this.#snapshot.lease.runId,
          summary: update.summary,
          progressPercent: update.progressPercent,
          artifacts: update.artifacts ?? [],
          contextBytesDelta: update.contextBytesDelta ?? 0,
          promptBytesDelta: update.promptBytesDelta ?? 0,
          agentInputTokensDelta: update.agentInputTokensDelta ?? 0,
          agentOutputTokensDelta: update.agentOutputTokensDelta ?? 0,
          ...(update.resumeToken === undefined ? {} : { resumeToken: update.resumeToken }),
        },
        this.#options.workerActor,
      );
      if (
        result.status === "accepted" &&
        result.snapshot.state === "terminal" &&
        result.snapshot.outcome.type === "budget_exhausted"
      ) {
        this.#abort.abort(new ObjectiveBudgetExhaustedError());
        throw new ObjectiveBudgetExhaustedError();
      }
      if (result.status !== "accepted" || result.snapshot.state !== "leased" || result.snapshot.latestCheckpoint === undefined) {
        this.#abort.abort(new Error("Objective checkpoint lost its lease."));
        throw new Error("Objective checkpoint was rejected.");
      }
      this.#snapshot = result.snapshot;
      return result.snapshot.latestCheckpoint;
    });
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function validateOptions(options: ObjectiveSchedulerOptions): void {
  if (!options.workerActor.capabilities.includes(OBJECTIVE_CAPABILITIES.execute)) {
    throw new TypeError("workerActor must have objective:execute.");
  }
  if (!options.coordinatorActor.capabilities.includes(OBJECTIVE_CAPABILITIES.coordinate)) {
    throw new TypeError("coordinatorActor must have objective:coordinate.");
  }
  if (!Number.isSafeInteger(options.maxConcurrency) || options.maxConcurrency < 1 || options.maxConcurrency > 1_000) {
    throw new TypeError("maxConcurrency must be an integer between 1 and 1000.");
  }
  if (!Number.isSafeInteger(options.leaseDurationMs) || options.leaseDurationMs < 1_000 || options.leaseDurationMs > 86_400_000) {
    throw new TypeError("leaseDurationMs must be between 1000 and 86400000.");
  }
  if (options.workerId.length < 1 || options.workerId.length > 200) {
    throw new TypeError("workerId must contain 1 to 200 characters.");
  }
}

function emptySummary(): MutableSummary {
  return { acquired: 0, completed: 0, failed: 0, retried: 0, waiting: 0, lostLeases: 0, recovered: 0, woken: 0, budgetExhausted: 0 };
}

function mergeSummary(target: MutableSummary, source: ObjectiveSchedulerSummary): void {
  target.acquired += source.acquired;
  target.completed += source.completed;
  target.failed += source.failed;
  target.retried += source.retried;
  target.waiting += source.waiting;
  target.lostLeases += source.lostLeases;
  target.recovered += source.recovered;
  target.woken += source.woken;
  target.budgetExhausted += source.budgetExhausted;
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
