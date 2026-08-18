import type {
  ArtifactHash,
  CommandId,
  LeaseId,
  ObjectiveId,
  RunId,
  UtcTimestamp,
} from "./identifiers.js";

export const OBJECTIVE_SCHEMA_VERSION = 1 as const;

export const OBJECTIVE_CAPABILITIES = {
  cancel: "objective:cancel",
  coordinate: "objective:coordinate",
  create: "objective:create",
  execute: "objective:execute",
} as const;

export type ObjectiveCapability =
  (typeof OBJECTIVE_CAPABILITIES)[keyof typeof OBJECTIVE_CAPABILITIES];

export interface TrustedActor {
  readonly actorId: string;
  readonly capabilities: readonly ObjectiveCapability[];
}

export type ObjectiveParent =
  | { readonly type: "root" }
  | { readonly type: "child"; readonly objectiveId: ObjectiveId };

export type ContextReference =
  | {
      readonly type: "git";
      readonly repository: string;
      readonly revision: string;
      readonly path?: string;
    }
  | {
      readonly type: "artifact";
      readonly hash: ArtifactHash;
      readonly mediaType: string;
    }
  | {
      readonly type: "external";
      readonly provider: string;
      readonly reference: string;
      readonly revision?: string;
    };

export interface AcceptanceGate {
  readonly gateId: string;
  readonly description: string;
  readonly evidenceTypes: readonly string[];
}

export interface ObjectiveBudget {
  readonly maxAttempts: number;
  readonly maxTransitions: number;
  readonly maxContextBytes: number;
  readonly maxPromptBytes: number;
  readonly maxAgentInputTokens: number;
  readonly maxAgentOutputTokens: number;
}

export interface ObjectiveAuthority {
  readonly allowedActors: "any_trusted_actor" | readonly string[];
}

export interface ObjectiveDefinition {
  readonly schemaVersion: typeof OBJECTIVE_SCHEMA_VERSION;
  readonly objectiveId: ObjectiveId;
  readonly objectiveKey: string;
  readonly purpose: string;
  readonly parent: ObjectiveParent;
  readonly dependencies: readonly ObjectiveId[];
  readonly authority: ObjectiveAuthority;
  readonly acceptance: readonly AcceptanceGate[];
  readonly budget: ObjectiveBudget;
  readonly context: readonly ContextReference[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ArtifactReference {
  readonly hash: ArtifactHash;
  readonly mediaType: string;
  readonly bytes: number;
  readonly label: string;
}

export interface ArtifactWrite {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly label: string;
}

export interface StoredArtifact {
  readonly hash: ArtifactHash;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface ObjectiveArtifactStore {
  put(artifact: ArtifactWrite): Promise<ArtifactReference>;
  get(hash: ArtifactHash): Promise<StoredArtifact | undefined>;
  has(hash: ArtifactHash): Promise<boolean>;
}

export interface ObjectiveEvidence {
  readonly evidenceType: string;
  readonly summary: string;
  readonly artifact?: ArtifactReference;
}

export interface ObjectiveUsage {
  readonly attempts: number;
  readonly transitions: number;
  readonly contextBytes: number;
  readonly promptBytes: number;
  readonly agentInputTokens: number;
  readonly agentOutputTokens: number;
}

export interface ObjectiveCheckpoint {
  readonly summary: string;
  readonly progressPercent: number;
  readonly artifacts: readonly ArtifactReference[];
  readonly resumeToken?: string;
  readonly recordedAt: UtcTimestamp;
}

interface SnapshotBase {
  readonly definition: ObjectiveDefinition;
  readonly version: number;
  readonly eventSequence: number;
  readonly usage: ObjectiveUsage;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly latestCheckpoint?: ObjectiveCheckpoint;
}

export interface ReadyObjective extends SnapshotBase {
  readonly state: "ready";
  readonly availableAt: UtcTimestamp;
}

export interface ObjectiveLease {
  readonly leaseId: LeaseId;
  readonly workerId: string;
  readonly runId: RunId;
  readonly acquiredAt: UtcTimestamp;
  readonly expiresAt: UtcTimestamp;
  readonly attempt: number;
}

export interface LeasedObjective extends SnapshotBase {
  readonly state: "leased";
  readonly lease: ObjectiveLease;
}

export type WaitCondition =
  | { readonly type: "dependency"; readonly objectiveIds: readonly ObjectiveId[] }
  | { readonly type: "children"; readonly objectiveIds: readonly ObjectiveId[] }
  | { readonly type: "timer"; readonly wakeAt: UtcTimestamp }
  | { readonly type: "external_signal"; readonly signalKey: string };

export interface WaitingObjective extends SnapshotBase {
  readonly state: "waiting";
  readonly condition: WaitCondition;
}

export type ObjectiveTerminalOutcome =
  | {
      readonly type: "completed";
      readonly summary: string;
      readonly evidence: readonly ObjectiveEvidence[];
    }
  | {
      readonly type: "failed";
      readonly code: string;
      readonly message: string;
      readonly retryable: false;
      readonly evidence: readonly ObjectiveEvidence[];
    }
  | { readonly type: "cancelled"; readonly reason: string }
  | {
      readonly type: "budget_exhausted";
      readonly dimension: keyof ObjectiveBudget;
      readonly limit: number;
      readonly observed: number;
    };

export interface TerminalObjective extends SnapshotBase {
  readonly state: "terminal";
  readonly outcome: ObjectiveTerminalOutcome;
  readonly finishedAt: UtcTimestamp;
}

export type ObjectiveSnapshot =
  | ReadyObjective
  | LeasedObjective
  | WaitingObjective
  | TerminalObjective;

interface CommandBase {
  readonly schemaVersion: typeof OBJECTIVE_SCHEMA_VERSION;
  readonly commandId: CommandId;
  readonly objectiveId: ObjectiveId;
}

interface MutationCommandBase extends CommandBase {
  readonly expectedVersion: number;
}

interface LeaseMutationCommandBase extends MutationCommandBase {
  readonly leaseId: LeaseId;
  readonly workerId: string;
  readonly runId: RunId;
}

export interface CreateObjectiveCommand extends CommandBase {
  readonly type: "create";
  readonly definition: ObjectiveDefinition;
  readonly availableAt?: UtcTimestamp;
}

export interface AcquireLeaseCommand extends MutationCommandBase {
  readonly type: "acquire_lease";
  readonly leaseId: LeaseId;
  readonly workerId: string;
  readonly runId: RunId;
  readonly durationMs: number;
}

export interface RenewLeaseCommand extends LeaseMutationCommandBase {
  readonly type: "renew_lease";
  readonly durationMs: number;
}

export interface CheckpointObjectiveCommand extends LeaseMutationCommandBase {
  readonly type: "checkpoint";
  readonly summary: string;
  readonly progressPercent: number;
  readonly artifacts: readonly ArtifactReference[];
  readonly contextBytesDelta: number;
  readonly promptBytesDelta: number;
  readonly agentInputTokensDelta: number;
  readonly agentOutputTokensDelta: number;
  readonly resumeToken?: string;
}

export interface ReleaseObjectiveCommand extends LeaseMutationCommandBase {
  readonly type: "release";
  readonly reason: string;
  readonly retryAfterMs: number;
}

export interface WaitObjectiveCommand extends LeaseMutationCommandBase {
  readonly type: "wait";
  readonly condition: WaitCondition;
  readonly checkpointSummary: string;
}

export interface WakeObjectiveCommand extends MutationCommandBase {
  readonly type: "wake";
  readonly reason: string;
}

export interface RecoverExpiredLeaseCommand extends MutationCommandBase {
  readonly type: "recover_expired_lease";
  readonly reason: string;
}

export interface CompleteObjectiveCommand extends LeaseMutationCommandBase {
  readonly type: "complete";
  readonly summary: string;
  readonly evidence: readonly ObjectiveEvidence[];
  readonly contextBytesDelta: number;
  readonly promptBytesDelta: number;
  readonly agentInputTokensDelta: number;
  readonly agentOutputTokensDelta: number;
}

export interface FailObjectiveCommand extends LeaseMutationCommandBase {
  readonly type: "fail";
  readonly code: string;
  readonly message: string;
  readonly retryable: false;
  readonly evidence: readonly ObjectiveEvidence[];
  readonly contextBytesDelta: number;
  readonly promptBytesDelta: number;
  readonly agentInputTokensDelta: number;
  readonly agentOutputTokensDelta: number;
}

export interface CancelObjectiveCommand extends MutationCommandBase {
  readonly type: "cancel";
  readonly reason: string;
}

export type ObjectiveCommand =
  | CreateObjectiveCommand
  | AcquireLeaseCommand
  | RenewLeaseCommand
  | CheckpointObjectiveCommand
  | ReleaseObjectiveCommand
  | WaitObjectiveCommand
  | WakeObjectiveCommand
  | RecoverExpiredLeaseCommand
  | CompleteObjectiveCommand
  | FailObjectiveCommand
  | CancelObjectiveCommand;

export type ObjectiveEventType = ObjectiveCommand["type"] | "budget_exhausted";

export interface ObjectiveEvent {
  readonly schemaVersion: typeof OBJECTIVE_SCHEMA_VERSION;
  readonly objectiveId: ObjectiveId;
  readonly sequence: number;
  readonly version: number;
  readonly eventType: ObjectiveEventType;
  readonly commandId: CommandId;
  readonly commandDigest: string;
  readonly actorId: string;
  readonly occurredAt: UtcTimestamp;
  readonly previousState?: ObjectiveSnapshot["state"];
  readonly snapshot: ObjectiveSnapshot;
}

export type CommandRejectionCode =
  | "already_exists"
  | "not_found"
  | "command_conflict"
  | "version_conflict"
  | "unauthorized"
  | "invalid_state"
  | "lease_mismatch"
  | "lease_expired"
  | "not_due"
  | "dependencies_unmet"
  | "invalid_command";

export type ObjectiveCommandResult =
  | {
      readonly status: "accepted" | "replayed";
      readonly snapshot: ObjectiveSnapshot;
      readonly event: ObjectiveEvent;
    }
  | {
      readonly status: "rejected";
      readonly code: CommandRejectionCode;
      readonly message: string;
      readonly currentVersion?: number;
    };

export interface ReadyObjectiveQuery {
  readonly limit: number;
  readonly parentObjectiveId?: ObjectiveId;
}

export interface ObjectiveListQuery {
  readonly states?: readonly ObjectiveSnapshot["state"][];
  readonly afterObjectiveId?: ObjectiveId;
  readonly parentObjectiveId?: ObjectiveId;
  readonly limit: number;
}

export interface ObjectiveEventQuery {
  readonly afterSequence?: number;
  readonly limit?: number;
}

export interface ObjectiveCommandStore {
  execute(command: ObjectiveCommand, actor: TrustedActor): Promise<ObjectiveCommandResult>;
  get(objectiveId: ObjectiveId): Promise<ObjectiveSnapshot | undefined>;
  listReady(query: ReadyObjectiveQuery): Promise<readonly ReadyObjective[]>;
  list(query: ObjectiveListQuery): Promise<readonly ObjectiveSnapshot[]>;
  events(
    objectiveId: ObjectiveId,
    query?: ObjectiveEventQuery,
  ): Promise<readonly ObjectiveEvent[]>;
}
