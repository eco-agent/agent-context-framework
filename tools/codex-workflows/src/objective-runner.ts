import { resolve } from "node:path";

import type {
  ArtifactReference,
  LeasedObjective,
  ObjectiveEvidence,
} from "@agent-context/objective-kernel";
import type {
  ObjectiveAttemptContext,
  ObjectiveAttemptOutcome,
  ObjectiveAttemptRunner,
} from "@agent-context/objective-runtime";
import {
  ObjectiveCodexClient,
  PromptBudgetExceededError,
  type StructuredInvocation,
  type WorkflowObjective,
} from "./objective-codex-client.js";
import type {
  Authority,
  CodexRole,
  JsonValue,
} from "@agent-context/codex-workflow-runtime";
import type { ObjectiveDelegation } from "./objective-contracts.js";
import {
  assertEnvelopeArtifact,
  decodeTaskEnvelope,
  renderTaskEnvelopeContext,
  serializeTaskEnvelope,
  TaskEnvelopeCapacityExceededError,
  TASK_ENVELOPE_MEDIA_TYPE,
  type VerifiedTaskEnvelopeV2,
  verifyEnvelopeSourceHashes,
} from "./task-envelope.js";

export interface CodexObjectiveInvocation<T> {
  readonly role: CodexRole;
  readonly delegation: ObjectiveDelegation;
  readonly repository: WorkflowObjective["repository"];
  readonly authority: readonly Authority[];
  readonly input: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (value: unknown) => T;
  readonly threadPolicy?: WorkflowObjective["threadPolicy"];
}

export interface CodexObjectiveLaunch<T> {
  readonly executionDirectory: string;
  readonly envelope: VerifiedTaskEnvelopeV2;
  readonly envelopeArtifact: ArtifactReference;
  readonly invocation: CodexObjectiveInvocation<T>;
  release(): Promise<void>;
}

export interface CodexObjectiveRunnerOptions<T> {
  readonly clientFor: (snapshot: LeasedObjective) => ObjectiveCodexClient;
  readonly launchFor: (
    context: ObjectiveAttemptContext,
  ) => CodexObjectiveLaunch<T> | Promise<CodexObjectiveLaunch<T>>;
  readonly outcomeFor: (
    value: T,
    snapshot: LeasedObjective,
  ) => ObjectiveAttemptOutcome | Promise<ObjectiveAttemptOutcome>;
  readonly checkpointProgressPercent?: number;
  readonly maxLedgerStateBytes?: number;
  readonly invocationEvidence?: (
    value: T,
    threadId: string,
  ) => readonly ObjectiveEvidence[];
}

export class CodexObjectiveRunner<T> implements ObjectiveAttemptRunner {
  readonly #options: CodexObjectiveRunnerOptions<T>;

  public constructor(options: CodexObjectiveRunnerOptions<T>) {
    this.#options = options;
  }

  public async run(context: ObjectiveAttemptContext): Promise<ObjectiveAttemptOutcome> {
    let launch: CodexObjectiveLaunch<T>;
    try {
      launch = await this.#options.launchFor(context);
    } catch (error) {
      if (error instanceof TaskEnvelopeCapacityExceededError) {
        await context.checkpoint({
          summary: `Mandatory task sources exceeded the remaining measured ${error.dimension} capacity; no source was truncated.`,
          progressPercent: context.snapshot.latestCheckpoint?.progressPercent ?? 0,
          artifacts: context.snapshot.latestCheckpoint?.artifacts ?? [],
          ...(error.dimension === "context"
            ? { contextBytesDelta: error.remainingBytes + 1 }
            : { promptBytesDelta: error.remainingBytes + 1 }),
        });
        throw new Error("Unreachable after durable task envelope budget exhaustion.");
      }
      throw error;
    }
    try {
      const snapshot = context.snapshot;
      const invocation = launch.invocation;
      await verifyLaunch(context, launch);
      if (invocation.role.identity !== snapshot.lease.workerId) {
        throw new Error("Codex role does not match the active objective worker lease.");
      }
      if (invocation.delegation.objectiveId !== snapshot.definition.objectiveId) {
        throw new Error("Codex delegation does not match the durable objective.");
      }
      if (
        typeof invocation.role.thread.workingDirectory !== "string" ||
        resolve(invocation.role.thread.workingDirectory) !== resolve(launch.executionDirectory)
      ) {
        throw new Error("Codex execution directory does not match the verified task launch.");
      }
      const inputBytes = Buffer.byteLength(JSON.stringify(invocation.input), "utf8");
      const remainingContext =
        snapshot.definition.budget.maxContextBytes - snapshot.usage.contextBytes;
      if (inputBytes > remainingContext) {
        await context.checkpoint({
          summary: "Codex input exceeded the remaining durable context budget.",
          progressPercent: snapshot.latestCheckpoint?.progressPercent ?? 0,
          artifacts: mergeArtifacts(
            snapshot.latestCheckpoint?.artifacts ?? [],
            launch.envelopeArtifact,
          ),
          contextBytesDelta: remainingContext + 1,
        });
        throw new Error("Unreachable after durable context budget exhaustion.");
      }
      const remainingPrompt =
        snapshot.definition.budget.maxPromptBytes - snapshot.usage.promptBytes;
      if (remainingPrompt < 1) {
        await context.checkpoint({
          summary: "Codex objective has no remaining prompt budget.",
          progressPercent: snapshot.latestCheckpoint?.progressPercent ?? 0,
          artifacts: mergeArtifacts(
            snapshot.latestCheckpoint?.artifacts ?? [],
            launch.envelopeArtifact,
          ),
          promptBytesDelta: 1,
        });
        throw new Error("Unreachable after durable prompt budget exhaustion.");
      }

      const objective: WorkflowObjective = {
        objectiveId: snapshot.definition.objectiveId,
        repository: invocation.repository,
        authority: invocation.authority,
        acceptanceGates: snapshot.definition.acceptance.map((gate) => gate.description),
        previousResult: checkpointAsJson(snapshot),
        maxPromptBytes: remainingPrompt,
        maxLedgerStateBytes: this.#options.maxLedgerStateBytes ?? remainingPrompt,
        threadPolicy: invocation.threadPolicy ?? "reuse_within_objective",
        terminalAfterTurn: false,
      };
      const structured: StructuredInvocation<T> = {
        objective,
        role: invocation.role,
        delegation: invocation.delegation,
        input: invocation.input,
        initialContext: renderTaskEnvelopeContext(
          launch.envelope,
          launch.envelopeArtifact,
        ),
        outputSchema: invocation.outputSchema,
        decode: invocation.decode,
        signal: context.signal,
        ...(snapshot.latestCheckpoint?.resumeToken === undefined
          ? {}
          : {
              continuation: {
                objectiveId: snapshot.definition.objectiveId,
                threadId: snapshot.latestCheckpoint.resumeToken,
              },
            }),
      };

      let result;
      try {
        result = await this.#options.clientFor(snapshot).invoke(structured);
      } catch (error) {
        if (error instanceof PromptBudgetExceededError) {
          await context.checkpoint({
            summary: "Rendered Codex prompt exceeded the remaining durable prompt budget.",
            progressPercent: snapshot.latestCheckpoint?.progressPercent ?? 0,
            artifacts: mergeArtifacts(
              snapshot.latestCheckpoint?.artifacts ?? [],
              launch.envelopeArtifact,
            ),
            promptBytesDelta: remainingPrompt + 1,
          });
        }
        throw error;
      }

      await context.checkpoint({
        summary: `Codex thread ${result.threadId} returned decoded structured output.`,
        progressPercent: this.#options.checkpointProgressPercent ?? 90,
        artifacts: mergeArtifacts(
          context.snapshot.latestCheckpoint?.artifacts ?? [],
          launch.envelopeArtifact,
        ),
        contextBytesDelta: inputBytes,
        promptBytesDelta: result.renderedPromptBytes,
        agentInputTokensDelta: result.usage?.input_tokens ?? 0,
        agentOutputTokensDelta:
          (result.usage?.output_tokens ?? 0) +
          (result.usage?.reasoning_output_tokens ?? 0),
        resumeToken: result.threadId,
      });
      const outcome = await this.#options.outcomeFor(result.value, context.snapshot);
      const envelopeEvidence: ObjectiveEvidence = {
        evidenceType: "task-envelope",
        summary: `Attempt used verified TaskEnvelopeV2 ${launch.envelopeArtifact.hash}.`,
        artifact: launch.envelopeArtifact,
      };
      if (outcome.type === "completed") {
        return {
          ...outcome,
          evidence: [
            ...outcome.evidence,
            envelopeEvidence,
            ...(this.#options.invocationEvidence?.(result.value, result.threadId) ?? []),
          ],
        };
      }
      if (outcome.type === "failed") {
        return {
          ...outcome,
          evidence: [...(outcome.evidence ?? []), envelopeEvidence],
        };
      }
      return outcome;
    } finally {
      await launch.release();
    }
  }
}

async function verifyLaunch<T>(
  context: ObjectiveAttemptContext,
  launch: CodexObjectiveLaunch<T>,
): Promise<void> {
  launch.envelope.assertSnapshot(context.snapshot);
  assertEnvelopeArtifact(launch.envelopeArtifact, launch.envelope.value);
  const checkpointArtifacts = context.snapshot.latestCheckpoint?.artifacts ?? [];
  if (!checkpointArtifacts.some((artifact) => artifact.hash === launch.envelopeArtifact.hash)) {
    throw new Error("Task envelope was not committed through the supplied checkpoint.");
  }
  const artifacts = context.artifacts;
  if (artifacts === undefined) {
    throw new Error("Codex objective launch requires an authoritative artifact store.");
  }
  const stored = await artifacts.get(launch.envelopeArtifact.hash);
  if (stored === undefined || stored.mediaType !== TASK_ENVELOPE_MEDIA_TYPE) {
    throw new Error("Authoritative task envelope artifact is missing or has the wrong type.");
  }
  const decoded = decodeTaskEnvelope(
    JSON.parse(Buffer.from(stored.bytes).toString("utf8")) as unknown,
  );
  if (serializeTaskEnvelope(decoded) !== serializeTaskEnvelope(launch.envelope.value)) {
    throw new Error("Verified task envelope differs from authoritative artifact bytes.");
  }
  await verifyEnvelopeSourceHashes(launch.executionDirectory, launch.envelope.value);
}

function mergeArtifacts(
  existing: readonly ArtifactReference[],
  envelope: ArtifactReference,
): readonly ArtifactReference[] {
  return [
    ...existing.filter((artifact) => artifact.hash !== envelope.hash),
    envelope,
  ];
}

function checkpointAsJson(snapshot: LeasedObjective): JsonValue {
  const checkpoint = snapshot.latestCheckpoint;
  if (checkpoint === undefined) return null;
  return {
    summary: checkpoint.summary,
    progressPercent: checkpoint.progressPercent,
    artifacts: checkpoint.artifacts.map((artifact) => ({
      hash: artifact.hash,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes,
      label: artifact.label,
    })),
    recordedAt: checkpoint.recordedAt,
  };
}
