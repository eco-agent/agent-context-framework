import {
  OBJECTIVE_CAPABILITIES,
  OBJECTIVE_SCHEMA_VERSION,
  type AcquireLeaseCommand,
  type CancelObjectiveCommand,
  type CheckpointObjectiveCommand,
  type CommandRejectionCode,
  type CompleteObjectiveCommand,
  type CreateObjectiveCommand,
  type FailObjectiveCommand,
  type LeasedObjective,
  type ObjectiveCapability,
  type ObjectiveCommand,
  type ObjectiveEventType,
  type ObjectiveSnapshot,
  type ObjectiveUsage,
  type ReleaseObjectiveCommand,
  type ReadyObjective,
  type RenewLeaseCommand,
  type TrustedActor,
  type WaitObjectiveCommand,
} from "./contracts.js";
import { compareTimestamps, utcTimestamp, type UtcTimestamp } from "./identifiers.js";

export interface TransitionContext {
  readonly now: UtcTimestamp;
  readonly dependenciesSatisfied: boolean;
  readonly waitConditionSatisfied: boolean;
}

export type TransitionResult =
  | {
      readonly status: "applied";
      readonly snapshot: ObjectiveSnapshot;
      readonly eventType: ObjectiveEventType;
    }
  | {
      readonly status: "rejected";
      readonly code: CommandRejectionCode;
      readonly message: string;
    };

export function requiredCapability(command: ObjectiveCommand): ObjectiveCapability {
  switch (command.type) {
    case "create":
      return OBJECTIVE_CAPABILITIES.create;
    case "acquire_lease":
    case "renew_lease":
    case "checkpoint":
    case "release":
    case "wait":
    case "complete":
    case "fail":
      return OBJECTIVE_CAPABILITIES.execute;
    case "wake":
    case "recover_expired_lease":
      return OBJECTIVE_CAPABILITIES.coordinate;
    case "cancel":
      return OBJECTIVE_CAPABILITIES.cancel;
  }
}

export function authorizeObjectiveCommand(
  definition: CreateObjectiveCommand["definition"],
  command: ObjectiveCommand,
  actor: TrustedActor,
): TransitionResult | undefined {
  const capability = requiredCapability(command);
  if (!actor.capabilities.includes(capability)) {
    return rejected("unauthorized", `Actor lacks ${capability}.`);
  }
  if (command.type === "create") {
    return undefined;
  }
  const allowed = definition.authority.allowedActors;
  if (allowed !== "any_trusted_actor" && !allowed.includes(actor.actorId)) {
    return rejected("unauthorized", "Actor is not allowed by the objective authority policy.");
  }
  return undefined;
}

export function createInitialSnapshot(
  command: CreateObjectiveCommand,
  now: UtcTimestamp,
): ReadyObjective {
  return {
    definition: command.definition,
    state: "ready",
    version: 1,
    eventSequence: 1,
    usage: { attempts: 0, transitions: 0, contextBytes: 0, promptBytes: 0, agentInputTokens: 0, agentOutputTokens: 0 },
    createdAt: now,
    updatedAt: now,
    availableAt: command.availableAt ?? now,
  };
}

export function applyObjectiveCommand(
  current: ObjectiveSnapshot,
  command: Exclude<ObjectiveCommand, CreateObjectiveCommand>,
  context: TransitionContext,
): TransitionResult {
  if (command.objectiveId !== current.definition.objectiveId) {
    return rejected("invalid_command", "Command objectiveId does not match the snapshot.");
  }
  if (command.expectedVersion !== current.version) {
    return rejected(
      "version_conflict",
      `Expected version ${command.expectedVersion}; current version is ${current.version}.`,
    );
  }
  if (current.state === "terminal") {
    return rejected("invalid_state", "Terminal objectives cannot transition.");
  }

  switch (command.type) {
    case "acquire_lease":
      return acquireLease(current, command, context);
    case "renew_lease":
      return withLease(current, command, context, (leased) => ({
        ...advance(leased, context.now),
        state: "leased",
        lease: {
          ...leased.lease,
          expiresAt: addMilliseconds(context.now, command.durationMs),
        },
      }), {}, false);
    case "checkpoint":
      return checkpoint(current, command, context);
    case "release":
      return release(current, command, context);
    case "wait":
      return wait(current, command, context);
    case "wake": {
      if (current.state !== "waiting") {
        return invalidState(command.type, current.state);
      }
      if (!context.waitConditionSatisfied) {
        return rejected("not_due", "The durable wait condition is not satisfied.");
      }
      return applied(
        budgetOrSnapshot(
          current,
          { ...advance(current, context.now), state: "ready", availableAt: context.now },
          {},
          context.now,
        ),
        command.type,
      );
    }
    case "recover_expired_lease": {
      if (current.state !== "leased") {
        return invalidState(command.type, current.state);
      }
      if (compareTimestamps(context.now, current.lease.expiresAt) < 0) {
        return rejected("not_due", "The active lease has not expired.");
      }
      return applied(
        budgetOrSnapshot(
          current,
          { ...advance(current, context.now), state: "ready", availableAt: context.now },
          {},
          context.now,
        ),
        command.type,
      );
    }
    case "complete":
      return finishCompleted(current, command, context);
    case "fail":
      return finishFailed(current, command, context);
    case "cancel":
      return cancel(current, command, context.now);
  }
}

function acquireLease(
  current: ObjectiveSnapshot,
  command: AcquireLeaseCommand,
  context: TransitionContext,
): TransitionResult {
  if (current.state !== "ready") {
    return invalidState(command.type, current.state);
  }
  if (compareTimestamps(context.now, current.availableAt) < 0) {
    return rejected("not_due", "The objective is not available yet.");
  }
  if (!context.dependenciesSatisfied) {
    return rejected("dependencies_unmet", "One or more objective dependencies are incomplete.");
  }
  const attempt = current.usage.attempts + 1;
  const next = {
    ...advance(current, context.now),
    state: "leased" as const,
    lease: {
      leaseId: command.leaseId,
      workerId: command.workerId,
      runId: command.runId,
      acquiredAt: context.now,
      expiresAt: addMilliseconds(context.now, command.durationMs),
      attempt,
    },
  };
  return applied(
    budgetOrSnapshot(current, next, { attempts: 1 }, context.now),
    command.type,
  );
}

function checkpoint(
  current: ObjectiveSnapshot,
  command: CheckpointObjectiveCommand,
  context: TransitionContext,
): TransitionResult {
  return withLease(current, command, context, (leased) => ({
    ...advance(leased, context.now),
    state: "leased",
    lease: leased.lease,
    latestCheckpoint: {
      summary: command.summary,
      progressPercent: command.progressPercent,
      artifacts: command.artifacts,
      ...(command.resumeToken !== undefined
        ? { resumeToken: command.resumeToken }
        : leased.latestCheckpoint?.resumeToken !== undefined
          ? { resumeToken: leased.latestCheckpoint.resumeToken }
          : {}),
      recordedAt: context.now,
    },
  }), {
    contextBytes: command.contextBytesDelta,
    promptBytes: command.promptBytesDelta,
    agentInputTokens: command.agentInputTokensDelta,
    agentOutputTokens: command.agentOutputTokensDelta,
  });
}

function release(
  current: ObjectiveSnapshot,
  command: ReleaseObjectiveCommand,
  context: TransitionContext,
): TransitionResult {
  return withLease(current, command, context, (leased) => ({
    ...advance(leased, context.now),
    state: "ready",
    availableAt: addMilliseconds(context.now, command.retryAfterMs),
  }));
}

function wait(
  current: ObjectiveSnapshot,
  command: WaitObjectiveCommand,
  context: TransitionContext,
): TransitionResult {
  return withLease(current, command, context, (leased) => ({
    ...advance(leased, context.now),
    state: "waiting",
    condition: command.condition,
    latestCheckpoint: {
      summary: command.checkpointSummary,
      progressPercent: leased.latestCheckpoint?.progressPercent ?? 0,
      artifacts: leased.latestCheckpoint?.artifacts ?? [],
      ...(leased.latestCheckpoint?.resumeToken === undefined
        ? {}
        : { resumeToken: leased.latestCheckpoint.resumeToken }),
      recordedAt: context.now,
    },
  }));
}

function finishCompleted(
  current: ObjectiveSnapshot,
  command: CompleteObjectiveCommand,
  context: TransitionContext,
): TransitionResult {
  const unsatisfiedGate = current.definition.acceptance.find(
    (gate) =>
      !command.evidence.some((item) => gate.evidenceTypes.includes(item.evidenceType)),
  );
  if (unsatisfiedGate !== undefined) {
    return rejected(
      "invalid_command",
      `Acceptance gate ${unsatisfiedGate.gateId} has no matching evidence.`,
    );
  }
  return withLease(current, command, context, (leased) => ({
    ...advance(leased, context.now),
    state: "terminal",
    outcome: { type: "completed", summary: command.summary, evidence: command.evidence },
    finishedAt: context.now,
  }), {
    contextBytes: command.contextBytesDelta,
    promptBytes: command.promptBytesDelta,
    agentInputTokens: command.agentInputTokensDelta,
    agentOutputTokens: command.agentOutputTokensDelta,
  });
}

function finishFailed(
  current: ObjectiveSnapshot,
  command: FailObjectiveCommand,
  context: TransitionContext,
): TransitionResult {
  return withLease(current, command, context, (leased) => ({
    ...advance(leased, context.now),
    state: "terminal",
    outcome: {
      type: "failed",
      code: command.code,
      message: command.message,
      retryable: command.retryable,
      evidence: command.evidence,
    },
    finishedAt: context.now,
  }), {
    contextBytes: command.contextBytesDelta,
    promptBytes: command.promptBytesDelta,
    agentInputTokens: command.agentInputTokensDelta,
    agentOutputTokens: command.agentOutputTokensDelta,
  });
}

function cancel(
  current: ObjectiveSnapshot,
  command: CancelObjectiveCommand,
  now: UtcTimestamp,
): TransitionResult {
  const next: ObjectiveSnapshot = {
    ...advance(current, now),
    state: "terminal",
    outcome: { type: "cancelled", reason: command.reason },
    finishedAt: now,
  };
  return applied(budgetOrSnapshot(current, next, {}, now), command.type);
}

function withLease(
  current: ObjectiveSnapshot,
  command:
    | RenewLeaseCommand
    | CheckpointObjectiveCommand
    | ReleaseObjectiveCommand
    | WaitObjectiveCommand
    | CompleteObjectiveCommand
    | FailObjectiveCommand,
  context: TransitionContext,
  build: (leased: LeasedObjective) => ObjectiveSnapshot,
  delta: Partial<ObjectiveUsage> = {},
  countTransition = true,
): TransitionResult {
  if (current.state !== "leased") {
    return invalidState(command.type, current.state);
  }
  if (
    current.lease.leaseId !== command.leaseId ||
    current.lease.workerId !== command.workerId ||
    current.lease.runId !== command.runId
  ) {
    return rejected("lease_mismatch", "Command does not own the current objective lease.");
  }
  if (compareTimestamps(context.now, current.lease.expiresAt) >= 0) {
    return rejected("lease_expired", "The objective lease has expired.");
  }
  return applied(
    budgetOrSnapshot(current, build(current), delta, context.now, countTransition),
    command.type,
  );
}

function budgetOrSnapshot(
  previous: ObjectiveSnapshot,
  proposed: ObjectiveSnapshot,
  delta: Partial<ObjectiveUsage>,
  now: UtcTimestamp,
  countTransition = true,
): ObjectiveSnapshot {
  const usage: ObjectiveUsage = {
    attempts: previous.usage.attempts + (delta.attempts ?? 0),
    transitions: previous.usage.transitions + (countTransition ? 1 : 0),
    contextBytes: previous.usage.contextBytes + (delta.contextBytes ?? 0),
    promptBytes: previous.usage.promptBytes + (delta.promptBytes ?? 0),
    agentInputTokens: previous.usage.agentInputTokens + (delta.agentInputTokens ?? 0),
    agentOutputTokens: previous.usage.agentOutputTokens + (delta.agentOutputTokens ?? 0),
  };
  const budget = previous.definition.budget;
  const exceeded = [
    ["maxAttempts", usage.attempts, budget.maxAttempts],
    ["maxTransitions", usage.transitions, budget.maxTransitions],
    ["maxContextBytes", usage.contextBytes, budget.maxContextBytes],
    ["maxPromptBytes", usage.promptBytes, budget.maxPromptBytes],
    ["maxAgentInputTokens", usage.agentInputTokens, budget.maxAgentInputTokens],
    ["maxAgentOutputTokens", usage.agentOutputTokens, budget.maxAgentOutputTokens],
  ] as const;
  const violation = exceeded.find(([, observed, limit]) => observed > limit);
  if (violation !== undefined) {
    const [dimension, observed, limit] = violation;
    return {
      ...advance(previous, now),
      usage,
      state: "terminal",
      outcome: { type: "budget_exhausted", dimension, limit, observed },
      finishedAt: now,
    };
  }
  return { ...proposed, usage };
}

function advance(current: ObjectiveSnapshot, now: UtcTimestamp) {
  return {
    definition: current.definition,
    version: current.version + 1,
    eventSequence: current.eventSequence + 1,
    usage: current.usage,
    createdAt: current.createdAt,
    updatedAt: now,
    ...(current.latestCheckpoint === undefined
      ? {}
      : { latestCheckpoint: current.latestCheckpoint }),
  };
}

function addMilliseconds(now: UtcTimestamp, milliseconds: number): UtcTimestamp {
  return utcTimestamp(new Date(Date.parse(now) + milliseconds).toISOString());
}

function applied(snapshot: ObjectiveSnapshot, normalType: ObjectiveEventType): TransitionResult {
  return {
    status: "applied",
    snapshot,
    eventType:
      snapshot.state === "terminal" && snapshot.outcome.type === "budget_exhausted"
        ? "budget_exhausted"
        : normalType,
  };
}

function invalidState(commandType: string, state: ObjectiveSnapshot["state"]): TransitionResult {
  return rejected("invalid_state", `${commandType} is not valid while objective is ${state}.`);
}

function rejected(code: CommandRejectionCode, message: string): TransitionResult {
  return { status: "rejected", code, message };
}
