import {
  OBJECTIVE_CAPABILITIES,
  OBJECTIVE_SCHEMA_VERSION,
  type AcceptanceGate,
  type ArtifactReference,
  type ContextReference,
  type ObjectiveAuthority,
  type ObjectiveBudget,
  type ObjectiveCommand,
  type ObjectiveDefinition,
  type ObjectiveEvent,
  type ObjectiveEvidence,
  type ObjectiveSnapshot,
  type ObjectiveTerminalOutcome,
  type ObjectiveParent,
  type TrustedActor,
  type WaitCondition,
} from "./contracts.js";
import {
  artifactHash,
  commandId,
  leaseId,
  objectiveId,
  runId,
  utcTimestamp,
} from "./identifiers.js";

export class ObjectiveDecodeError extends TypeError {
  public readonly path: string;

  public constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ObjectiveDecodeError";
    this.path = path;
  }
}

export function decodeObjectiveDefinition(input: unknown): ObjectiveDefinition {
  const value = record(input, "$definition");
  exactKeys(
    value,
    [
      "schemaVersion",
      "objectiveId",
      "objectiveKey",
      "purpose",
      "parent",
      "dependencies",
      "authority",
      "acceptance",
      "budget",
      "context",
      "metadata",
    ],
    "$definition",
  );
  literal(value.schemaVersion, OBJECTIVE_SCHEMA_VERSION, "$definition.schemaVersion");
  const definition: ObjectiveDefinition = {
    schemaVersion: OBJECTIVE_SCHEMA_VERSION,
    objectiveId: parseAt(objectiveId, text(value.objectiveId, "$definition.objectiveId"), "$definition.objectiveId"),
    objectiveKey: boundedText(value.objectiveKey, "$definition.objectiveKey", 1, 160),
    purpose: boundedText(value.purpose, "$definition.purpose", 1, 4_000),
    parent: decodeParent(value.parent),
    dependencies: uniqueArray(value.dependencies, "$definition.dependencies", (item, path) =>
      parseAt(objectiveId, text(item, path), path),
    ),
    authority: decodeAuthority(value.authority),
    acceptance: array(value.acceptance, "$definition.acceptance", decodeAcceptanceGate, 1, 100),
    budget: decodeBudget(value.budget),
    context: array(value.context, "$definition.context", decodeContextReference, 0, 1_000),
    metadata: stringRecord(value.metadata, "$definition.metadata", 100),
  };
  if (new Set(definition.acceptance.map((gate) => gate.gateId)).size !== definition.acceptance.length) {
    throw new ObjectiveDecodeError("$definition.acceptance", "gateId values must be unique");
  }
  return definition;
}

export function decodeTrustedActor(input: unknown): TrustedActor {
  const value = record(input, "$actor");
  exactKeys(value, ["actorId", "capabilities"], "$actor");
  const known = new Set(Object.values(OBJECTIVE_CAPABILITIES));
  const capabilities = uniqueArray(value.capabilities, "$actor.capabilities", (item, path) => {
    const capability = text(item, path);
    if (!known.has(capability as never)) {
      throw new ObjectiveDecodeError(path, "unknown objective capability");
    }
    return capability as TrustedActor["capabilities"][number];
  });
  return {
    actorId: boundedText(value.actorId, "$actor.actorId", 1, 200),
    capabilities,
  };
}

export function decodeObjectiveCommand(input: unknown): ObjectiveCommand {
  const value = record(input, "$command");
  const type = text(value.type, "$command.type");
  const common = decodeCommandCommon(value);
  switch (type) {
    case "create": {
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "definition", "availableAt"], "$command");
      const definition = decodeObjectiveDefinition(value.definition);
      if (definition.objectiveId !== common.objectiveId) {
        throw new ObjectiveDecodeError("$command.definition.objectiveId", "must match command.objectiveId");
      }
      return {
        ...common,
        type,
        definition,
        ...(value.availableAt === undefined
          ? {}
          : { availableAt: parseAt(utcTimestamp, text(value.availableAt, "$command.availableAt"), "$command.availableAt") }),
      };
    }
    case "acquire_lease":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "durationMs"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        durationMs: duration(value.durationMs, "$command.durationMs"),
      };
    case "renew_lease":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "durationMs"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        durationMs: duration(value.durationMs, "$command.durationMs"),
      };
    case "checkpoint":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "summary", "progressPercent", "artifacts", "contextBytesDelta", "promptBytesDelta", "agentInputTokensDelta", "agentOutputTokensDelta", "resumeToken"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        summary: boundedText(value.summary, "$command.summary", 1, 4_000),
        progressPercent: integerInRange(value.progressPercent, "$command.progressPercent", 0, 100),
        artifacts: array(value.artifacts, "$command.artifacts", decodeArtifactReference, 0, 100),
        contextBytesDelta: nonNegativeInteger(value.contextBytesDelta, "$command.contextBytesDelta"),
        promptBytesDelta: nonNegativeInteger(value.promptBytesDelta, "$command.promptBytesDelta"),
        agentInputTokensDelta: nonNegativeInteger(value.agentInputTokensDelta, "$command.agentInputTokensDelta"),
        agentOutputTokensDelta: nonNegativeInteger(value.agentOutputTokensDelta, "$command.agentOutputTokensDelta"),
        ...(value.resumeToken === undefined
          ? {}
          : { resumeToken: boundedText(value.resumeToken, "$command.resumeToken", 1, 2_000) }),
      };
    case "release":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "reason", "retryAfterMs"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        reason: boundedText(value.reason, "$command.reason", 1, 2_000),
        retryAfterMs: integerInRange(value.retryAfterMs, "$command.retryAfterMs", 0, 604_800_000),
      };
    case "wait":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "condition", "checkpointSummary"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        condition: decodeWaitCondition(value.condition),
        checkpointSummary: boundedText(value.checkpointSummary, "$command.checkpointSummary", 1, 4_000),
      };
    case "wake":
    case "recover_expired_lease":
    case "cancel":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "reason"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        reason: boundedText(value.reason, "$command.reason", 1, 2_000),
      };
    case "complete":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "summary", "evidence", "contextBytesDelta", "promptBytesDelta", "agentInputTokensDelta", "agentOutputTokensDelta"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        summary: boundedText(value.summary, "$command.summary", 1, 4_000),
        evidence: array(value.evidence, "$command.evidence", decodeEvidence, 1, 100),
        contextBytesDelta: nonNegativeInteger(value.contextBytesDelta, "$command.contextBytesDelta"),
        promptBytesDelta: nonNegativeInteger(value.promptBytesDelta, "$command.promptBytesDelta"),
        agentInputTokensDelta: nonNegativeInteger(value.agentInputTokensDelta, "$command.agentInputTokensDelta"),
        agentOutputTokensDelta: nonNegativeInteger(value.agentOutputTokensDelta, "$command.agentOutputTokensDelta"),
      };
    case "fail":
      exactKeys(value, ["type", "schemaVersion", "commandId", "objectiveId", "expectedVersion", "leaseId", "workerId", "runId", "code", "message", "retryable", "evidence", "contextBytesDelta", "promptBytesDelta", "agentInputTokensDelta", "agentOutputTokensDelta"], "$command");
      return {
        ...common,
        type,
        expectedVersion: positiveInteger(value.expectedVersion, "$command.expectedVersion"),
        ...decodeLeaseIdentity(value),
        code: boundedText(value.code, "$command.code", 1, 160),
        message: boundedText(value.message, "$command.message", 1, 4_000),
        retryable: falseLiteral(value.retryable, "$command.retryable"),
        evidence: array(value.evidence, "$command.evidence", decodeEvidence, 0, 100),
        contextBytesDelta: nonNegativeInteger(value.contextBytesDelta, "$command.contextBytesDelta"),
        promptBytesDelta: nonNegativeInteger(value.promptBytesDelta, "$command.promptBytesDelta"),
        agentInputTokensDelta: nonNegativeInteger(value.agentInputTokensDelta, "$command.agentInputTokensDelta"),
        agentOutputTokensDelta: nonNegativeInteger(value.agentOutputTokensDelta, "$command.agentOutputTokensDelta"),
      };
    default:
      throw new ObjectiveDecodeError("$command.type", `unsupported command type ${JSON.stringify(type)}`);
  }
}

export function decodeObjectiveSnapshot(input: unknown): ObjectiveSnapshot {
  const value = record(input, "$snapshot");
  const state = text(value.state, "$snapshot.state");
  const commonKeys = [
    "definition", "state", "version", "eventSequence", "usage", "createdAt", "updatedAt",
    "latestCheckpoint",
  ];
  const common = decodeSnapshotCommon(value);
  switch (state) {
    case "ready":
      exactKeys(value, [...commonKeys, "availableAt"], "$snapshot");
      return {
        ...common,
        state,
        availableAt: parseAt(utcTimestamp, text(value.availableAt, "$snapshot.availableAt"), "$snapshot.availableAt"),
      };
    case "leased": {
      exactKeys(value, [...commonKeys, "lease"], "$snapshot");
      const lease = record(value.lease, "$snapshot.lease");
      exactKeys(lease, ["leaseId", "workerId", "runId", "acquiredAt", "expiresAt", "attempt"], "$snapshot.lease");
      return {
        ...common,
        state,
        lease: {
          leaseId: parseAt(leaseId, text(lease.leaseId, "$snapshot.lease.leaseId"), "$snapshot.lease.leaseId"),
          workerId: boundedText(lease.workerId, "$snapshot.lease.workerId", 1, 200),
          runId: parseAt(runId, text(lease.runId, "$snapshot.lease.runId"), "$snapshot.lease.runId"),
          acquiredAt: parseAt(utcTimestamp, text(lease.acquiredAt, "$snapshot.lease.acquiredAt"), "$snapshot.lease.acquiredAt"),
          expiresAt: parseAt(utcTimestamp, text(lease.expiresAt, "$snapshot.lease.expiresAt"), "$snapshot.lease.expiresAt"),
          attempt: positiveInteger(lease.attempt, "$snapshot.lease.attempt"),
        },
      };
    }
    case "waiting":
      exactKeys(value, [...commonKeys, "condition"], "$snapshot");
      return { ...common, state, condition: decodeWaitConditionAt(value.condition, "$snapshot.condition") };
    case "terminal":
      exactKeys(value, [...commonKeys, "outcome", "finishedAt"], "$snapshot");
      return {
        ...common,
        state,
        outcome: decodeTerminalOutcome(value.outcome),
        finishedAt: parseAt(utcTimestamp, text(value.finishedAt, "$snapshot.finishedAt"), "$snapshot.finishedAt"),
      };
    default:
      throw new ObjectiveDecodeError("$snapshot.state", "unsupported objective state");
  }
}

export function decodeObjectiveEvent(input: unknown): ObjectiveEvent {
  const value = record(input, "$event");
  exactKeys(value, [
    "schemaVersion", "objectiveId", "sequence", "version", "eventType", "commandId",
    "commandDigest", "actorId", "occurredAt", "previousState", "snapshot",
  ], "$event");
  literal(value.schemaVersion, OBJECTIVE_SCHEMA_VERSION, "$event.schemaVersion");
  const snapshot = decodeObjectiveSnapshot(value.snapshot);
  const decodedObjectiveId = parseAt(objectiveId, text(value.objectiveId, "$event.objectiveId"), "$event.objectiveId");
  const eventTypes = new Set([
    "create", "acquire_lease", "renew_lease", "checkpoint", "release", "wait", "wake",
    "recover_expired_lease", "complete", "fail", "cancel", "budget_exhausted",
  ]);
  const eventType = text(value.eventType, "$event.eventType");
  if (!eventTypes.has(eventType)) throw new ObjectiveDecodeError("$event.eventType", "unsupported event type");
  const digest = text(value.commandDigest, "$event.commandDigest");
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new ObjectiveDecodeError("$event.commandDigest", "must be a SHA-256 digest");
  }
  const previousState = value.previousState;
  if (
    previousState !== undefined &&
    previousState !== "ready" && previousState !== "leased" &&
    previousState !== "waiting" && previousState !== "terminal"
  ) {
    throw new ObjectiveDecodeError("$event.previousState", "unsupported previous state");
  }
  if (snapshot.definition.objectiveId !== decodedObjectiveId) {
    throw new ObjectiveDecodeError("$event.snapshot.definition.objectiveId", "must match event.objectiveId");
  }
  const sequence = positiveInteger(value.sequence, "$event.sequence");
  const version = positiveInteger(value.version, "$event.version");
  if (snapshot.eventSequence !== sequence || snapshot.version !== version) {
    throw new ObjectiveDecodeError("$event.snapshot", "sequence and version must match the event");
  }
  return {
    schemaVersion: OBJECTIVE_SCHEMA_VERSION,
    objectiveId: decodedObjectiveId,
    sequence,
    version,
    eventType: eventType as ObjectiveEvent["eventType"],
    commandId: parseAt(commandId, text(value.commandId, "$event.commandId"), "$event.commandId"),
    commandDigest: digest,
    actorId: boundedText(value.actorId, "$event.actorId", 1, 200),
    occurredAt: parseAt(utcTimestamp, text(value.occurredAt, "$event.occurredAt"), "$event.occurredAt"),
    ...(previousState === undefined ? {} : { previousState }),
    snapshot,
  };
}

function decodeSnapshotCommon(value: Record<string, unknown>) {
  const usage = record(value.usage, "$snapshot.usage");
  exactKeys(usage, ["attempts", "transitions", "contextBytes", "promptBytes", "agentInputTokens", "agentOutputTokens"], "$snapshot.usage");
  return {
    definition: decodeObjectiveDefinition(value.definition),
    version: positiveInteger(value.version, "$snapshot.version"),
    eventSequence: positiveInteger(value.eventSequence, "$snapshot.eventSequence"),
    usage: {
      attempts: nonNegativeInteger(usage.attempts, "$snapshot.usage.attempts"),
      transitions: nonNegativeInteger(usage.transitions, "$snapshot.usage.transitions"),
      contextBytes: nonNegativeInteger(usage.contextBytes, "$snapshot.usage.contextBytes"),
      promptBytes: nonNegativeInteger(usage.promptBytes, "$snapshot.usage.promptBytes"),
      agentInputTokens: nonNegativeInteger(usage.agentInputTokens, "$snapshot.usage.agentInputTokens"),
      agentOutputTokens: nonNegativeInteger(usage.agentOutputTokens, "$snapshot.usage.agentOutputTokens"),
    },
    createdAt: parseAt(utcTimestamp, text(value.createdAt, "$snapshot.createdAt"), "$snapshot.createdAt"),
    updatedAt: parseAt(utcTimestamp, text(value.updatedAt, "$snapshot.updatedAt"), "$snapshot.updatedAt"),
    ...(value.latestCheckpoint === undefined
      ? {}
      : { latestCheckpoint: decodeCheckpoint(value.latestCheckpoint) }),
  };
}

function decodeCheckpoint(input: unknown) {
  const path = "$snapshot.latestCheckpoint";
  const value = record(input, path);
  exactKeys(value, ["summary", "progressPercent", "artifacts", "resumeToken", "recordedAt"], path);
  return {
    summary: boundedText(value.summary, `${path}.summary`, 1, 4_000),
    progressPercent: integerInRange(value.progressPercent, `${path}.progressPercent`, 0, 100),
    artifacts: array(value.artifacts, `${path}.artifacts`, decodeArtifactReference, 0, 100),
    ...(value.resumeToken === undefined ? {} : { resumeToken: boundedText(value.resumeToken, `${path}.resumeToken`, 1, 2_000) }),
    recordedAt: parseAt(utcTimestamp, text(value.recordedAt, `${path}.recordedAt`), `${path}.recordedAt`),
  };
}

function decodeTerminalOutcome(input: unknown): ObjectiveTerminalOutcome {
  const path = "$snapshot.outcome";
  const value = record(input, path);
  const type = text(value.type, `${path}.type`);
  if (type === "completed") {
    exactKeys(value, ["type", "summary", "evidence"], path);
    return { type, summary: boundedText(value.summary, `${path}.summary`, 1, 4_000), evidence: array(value.evidence, `${path}.evidence`, decodeEvidence, 1, 100) };
  }
  if (type === "failed") {
    exactKeys(value, ["type", "code", "message", "retryable", "evidence"], path);
    return {
      type,
      code: boundedText(value.code, `${path}.code`, 1, 160),
      message: boundedText(value.message, `${path}.message`, 1, 4_000),
      retryable: falseLiteral(value.retryable, `${path}.retryable`),
      evidence: array(value.evidence, `${path}.evidence`, decodeEvidence, 0, 100),
    };
  }
  if (type === "cancelled") {
    exactKeys(value, ["type", "reason"], path);
    return { type, reason: boundedText(value.reason, `${path}.reason`, 1, 2_000) };
  }
  if (type === "budget_exhausted") {
    exactKeys(value, ["type", "dimension", "limit", "observed"], path);
    const dimensions = new Set([
      "maxAttempts", "maxTransitions", "maxContextBytes", "maxPromptBytes",
      "maxAgentInputTokens", "maxAgentOutputTokens",
    ]);
    const dimension = text(value.dimension, `${path}.dimension`);
    if (!dimensions.has(dimension)) throw new ObjectiveDecodeError(`${path}.dimension`, "unknown budget dimension");
    return {
      type,
      dimension: dimension as keyof ObjectiveBudget,
      limit: positiveInteger(value.limit, `${path}.limit`),
      observed: nonNegativeInteger(value.observed, `${path}.observed`),
    };
  }
  throw new ObjectiveDecodeError(`${path}.type`, "unsupported terminal outcome");
}

function decodeCommandCommon(value: Record<string, unknown>) {
  literal(value.schemaVersion, OBJECTIVE_SCHEMA_VERSION, "$command.schemaVersion");
  return {
    schemaVersion: OBJECTIVE_SCHEMA_VERSION,
    commandId: parseAt(commandId, text(value.commandId, "$command.commandId"), "$command.commandId"),
    objectiveId: parseAt(objectiveId, text(value.objectiveId, "$command.objectiveId"), "$command.objectiveId"),
  };
}

function decodeLeaseIdentity(value: Record<string, unknown>) {
  return {
    leaseId: parseAt(leaseId, text(value.leaseId, "$command.leaseId"), "$command.leaseId"),
    workerId: boundedText(value.workerId, "$command.workerId", 1, 200),
    runId: parseAt(runId, text(value.runId, "$command.runId"), "$command.runId"),
  };
}

function decodeParent(input: unknown): ObjectiveParent {
  const value = record(input, "$definition.parent");
  const type = text(value.type, "$definition.parent.type");
  if (type === "root") {
    exactKeys(value, ["type"], "$definition.parent");
    return { type };
  }
  if (type === "child") {
    exactKeys(value, ["type", "objectiveId"], "$definition.parent");
    return {
      type,
      objectiveId: parseAt(objectiveId, text(value.objectiveId, "$definition.parent.objectiveId"), "$definition.parent.objectiveId"),
    };
  }
  throw new ObjectiveDecodeError("$definition.parent.type", "must be root or child");
}

function decodeAuthority(input: unknown): ObjectiveAuthority {
  const value = record(input, "$definition.authority");
  exactKeys(value, ["allowedActors"], "$definition.authority");
  if (value.allowedActors === "any_trusted_actor") {
    return { allowedActors: value.allowedActors };
  }
  const allowedActors = uniqueArray(value.allowedActors, "$definition.authority.allowedActors", (item, path) =>
      boundedText(item, path, 1, 200),
    );
  if (allowedActors.length === 0) {
    throw new ObjectiveDecodeError("$definition.authority.allowedActors", "must contain at least one actor");
  }
  return { allowedActors };
}

function decodeAcceptanceGate(input: unknown, path: string): AcceptanceGate {
  const value = record(input, path);
  exactKeys(value, ["gateId", "description", "evidenceTypes"], path);
  return {
    gateId: boundedText(value.gateId, `${path}.gateId`, 1, 160),
    description: boundedText(value.description, `${path}.description`, 1, 2_000),
    evidenceTypes: nonEmptyUniqueArray(value.evidenceTypes, `${path}.evidenceTypes`, (item, itemPath) =>
      boundedText(item, itemPath, 1, 160),
    ),
  };
}

function decodeBudget(input: unknown): ObjectiveBudget {
  const value = record(input, "$definition.budget");
  exactKeys(value, ["maxAttempts", "maxTransitions", "maxContextBytes", "maxPromptBytes", "maxAgentInputTokens", "maxAgentOutputTokens"], "$definition.budget");
  return {
    maxAttempts: positiveInteger(value.maxAttempts, "$definition.budget.maxAttempts"),
    maxTransitions: positiveInteger(value.maxTransitions, "$definition.budget.maxTransitions"),
    maxContextBytes: positiveInteger(value.maxContextBytes, "$definition.budget.maxContextBytes"),
    maxPromptBytes: positiveInteger(value.maxPromptBytes, "$definition.budget.maxPromptBytes"),
    maxAgentInputTokens: positiveInteger(value.maxAgentInputTokens, "$definition.budget.maxAgentInputTokens"),
    maxAgentOutputTokens: positiveInteger(value.maxAgentOutputTokens, "$definition.budget.maxAgentOutputTokens"),
  };
}

function decodeContextReference(input: unknown, path: string): ContextReference {
  const value = record(input, path);
  const type = text(value.type, `${path}.type`);
  if (type === "git") {
    exactKeys(value, ["type", "repository", "revision", "path"], path);
    return {
      type,
      repository: boundedText(value.repository, `${path}.repository`, 1, 1_000),
      revision: boundedText(value.revision, `${path}.revision`, 1, 200),
      ...(value.path === undefined ? {} : { path: boundedText(value.path, `${path}.path`, 1, 1_000) }),
    };
  }
  if (type === "artifact") {
    exactKeys(value, ["type", "hash", "mediaType"], path);
    return {
      type,
      hash: parseAt(artifactHash, text(value.hash, `${path}.hash`), `${path}.hash`),
      mediaType: boundedText(value.mediaType, `${path}.mediaType`, 1, 200),
    };
  }
  if (type === "external") {
    exactKeys(value, ["type", "provider", "reference", "revision"], path);
    return {
      type,
      provider: boundedText(value.provider, `${path}.provider`, 1, 200),
      reference: boundedText(value.reference, `${path}.reference`, 1, 2_000),
      ...(value.revision === undefined
        ? {}
        : { revision: boundedText(value.revision, `${path}.revision`, 1, 200) }),
    };
  }
  throw new ObjectiveDecodeError(`${path}.type`, "must be git, artifact, or external");
}

function decodeArtifactReference(input: unknown, path: string): ArtifactReference {
  const value = record(input, path);
  exactKeys(value, ["hash", "mediaType", "bytes", "label"], path);
  return {
    hash: parseAt(artifactHash, text(value.hash, `${path}.hash`), `${path}.hash`),
    mediaType: boundedText(value.mediaType, `${path}.mediaType`, 1, 200),
    bytes: nonNegativeInteger(value.bytes, `${path}.bytes`),
    label: boundedText(value.label, `${path}.label`, 1, 500),
  };
}

function decodeEvidence(input: unknown, path: string): ObjectiveEvidence {
  const value = record(input, path);
  exactKeys(value, ["evidenceType", "summary", "artifact"], path);
  return {
    evidenceType: boundedText(value.evidenceType, `${path}.evidenceType`, 1, 160),
    summary: boundedText(value.summary, `${path}.summary`, 1, 2_000),
    ...(value.artifact === undefined ? {} : { artifact: decodeArtifactReference(value.artifact, `${path}.artifact`) }),
  };
}

function decodeWaitCondition(input: unknown): WaitCondition {
  return decodeWaitConditionAt(input, "$command.condition");
}

function decodeWaitConditionAt(input: unknown, path: string): WaitCondition {
  const value = record(input, path);
  const type = text(value.type, `${path}.type`);
  if (type === "dependency" || type === "children") {
    exactKeys(value, ["type", "objectiveIds"], path);
    return {
      type,
      objectiveIds: uniqueArray(value.objectiveIds, `${path}.objectiveIds`, (item, itemPath) =>
        parseAt(objectiveId, text(item, itemPath), itemPath),
      ),
    };
  }
  if (type === "timer") {
    exactKeys(value, ["type", "wakeAt"], path);
    return {
      type,
      wakeAt: parseAt(utcTimestamp, text(value.wakeAt, `${path}.wakeAt`), `${path}.wakeAt`),
    };
  }
  if (type === "external_signal") {
    exactKeys(value, ["type", "signalKey"], path);
    return { type, signalKey: boundedText(value.signalKey, `${path}.signalKey`, 1, 500) };
  }
  throw new ObjectiveDecodeError(`${path}.type`, "unsupported wait condition");
}

function record(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ObjectiveDecodeError(path, "must be an object");
  }
  return input as Record<string, unknown>;
}

function text(input: unknown, path: string): string {
  if (typeof input !== "string") {
    throw new ObjectiveDecodeError(path, "must be a string");
  }
  return input;
}

function boundedText(input: unknown, path: string, minimum: number, maximum: number): string {
  const value = text(input, path);
  if (value.length < minimum || value.length > maximum) {
    throw new ObjectiveDecodeError(path, `length must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function falseLiteral(input: unknown, path: string): false {
  if (input !== false) throw new ObjectiveDecodeError(path, "must be false for a terminal failure");
  return false;
}

function positiveInteger(input: unknown, path: string): number {
  return integerInRange(input, path, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegativeInteger(input: unknown, path: string): number {
  return integerInRange(input, path, 0, Number.MAX_SAFE_INTEGER);
}

function duration(input: unknown, path: string): number {
  return integerInRange(input, path, 1_000, 86_400_000);
}

function integerInRange(input: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum || (input as number) > maximum) {
    throw new ObjectiveDecodeError(path, `must be a safe integer between ${minimum} and ${maximum}`);
  }
  return input as number;
}

function literal(input: unknown, expected: string | number, path: string): void {
  if (input !== expected) {
    throw new ObjectiveDecodeError(path, `must equal ${JSON.stringify(expected)}`);
  }
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new ObjectiveDecodeError(`${path}.${unexpected}`, "unexpected field");
  }
}

function array<T>(
  input: unknown,
  path: string,
  decode: (item: unknown, path: string) => T,
  minimum: number,
  maximum: number,
): readonly T[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum) {
    throw new ObjectiveDecodeError(path, `must be an array with ${minimum} to ${maximum} items`);
  }
  return input.map((item, index) => decode(item, `${path}[${index}]`));
}

function uniqueArray<T>(
  input: unknown,
  path: string,
  decode: (item: unknown, path: string) => T,
): readonly T[] {
  const decoded = array(input, path, decode, 0, 1_000);
  if (new Set(decoded).size !== decoded.length) {
    throw new ObjectiveDecodeError(path, "must not contain duplicates");
  }
  return decoded;
}

function nonEmptyUniqueArray<T>(
  input: unknown,
  path: string,
  decode: (item: unknown, path: string) => T,
): readonly T[] {
  const decoded = uniqueArray(input, path, decode);
  if (decoded.length === 0) throw new ObjectiveDecodeError(path, "must not be empty");
  return decoded;
}

function stringRecord(input: unknown, path: string, maximumEntries: number): Readonly<Record<string, string>> {
  const value = record(input, path);
  if (Object.keys(value).length > maximumEntries) {
    throw new ObjectiveDecodeError(path, `must contain at most ${maximumEntries} entries`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      boundedText(key, `${path} key`, 1, 160),
      boundedText(item, `${path}.${key}`, 0, 2_000),
    ]),
  );
}

function parseAt<T>(parse: (value: string) => T, value: string, path: string): T {
  try {
    return parse(value);
  } catch (error) {
    throw new ObjectiveDecodeError(path, error instanceof Error ? error.message : "invalid value");
  }
}
