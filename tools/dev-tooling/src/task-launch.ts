import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArtifactReference } from "@agent-context/objective-kernel";
import type { ObjectiveAttemptContext } from "@agent-context/objective-runtime";
import {
  publishTaskEnvelope,
  VerifiedTaskEnvelopeV2,
} from "@agent-context/codex-workflows/task-envelope";
import type { ActiveTaskAttemptBinding } from "@agent-context/repo-policy";

import {
  activateTaskAttempt,
  activeTaskGitDirectory,
  bindActiveTaskSession,
  prepareTaskActivation,
  releaseActiveTaskAttempt,
  validateTaskBaseline,
} from "./active-task.js";

export interface PreparedTaskLaunch {
  readonly executionDirectory: string;
  readonly envelope: VerifiedTaskEnvelopeV2;
  readonly envelopeArtifact: ArtifactReference;
  readonly binding: ActiveTaskAttemptBinding;
  readonly cachePath: string | null;
  bindSession(sessionId: string): Promise<void>;
  release(): Promise<void>;
}

export async function prepareTaskLaunch(
  context: ObjectiveAttemptContext,
  input: {
    readonly executionDirectory: string;
    readonly requestPath: string;
    readonly cache?: "best_effort" | "disabled";
  },
): Promise<PreparedTaskLaunch> {
  const executionDirectory = await realpath(input.executionDirectory);
  const prepared = await prepareTaskActivation(executionDirectory, input.requestPath);
  await validateTaskBaseline(executionDirectory, prepared.capability);
  const published = await publishTaskEnvelope(context, {
    root: executionDirectory,
    binding: prepared.binding,
    capability: prepared.capability,
    implementationContract: prepared.implementationContract,
    productPrecedentMaterialization: prepared.productPrecedentMaterialization,
  });
  const envelopeArtifact = published.artifact;
  const envelope = published.envelope;

  const binding: ActiveTaskAttemptBinding = {
    schemaVersion: 1,
    state: "attempt",
    objectiveId: context.snapshot.definition.objectiveId,
    leaseId: context.snapshot.lease.leaseId,
    runId: context.snapshot.lease.runId,
    workerId: context.snapshot.lease.workerId,
    attempt: context.snapshot.lease.attempt,
    ...prepared.binding,
    executionDirectory,
    envelopeArtifact,
  };
  await activateTaskAttempt(executionDirectory, binding);

  const cachePath = input.cache === "disabled"
    ? null
    : await writeBestEffortCache(executionDirectory, envelopeArtifact, published.bytes);
  return {
    executionDirectory,
    envelope,
    envelopeArtifact,
    binding,
    cachePath,
    async bindSession(sessionId) {
      await bindActiveTaskSession(executionDirectory, binding, sessionId);
    },
    async release() {
      await releaseActiveTaskAttempt(executionDirectory, binding);
    },
  };
}

export async function taskEnvelopeCachePath(
  root: string,
  artifact: ArtifactReference,
): Promise<string> {
  const digest = artifact.hash.slice("sha256:".length);
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error("Task envelope artifact hash is invalid.");
  }
  return path.join(
    await activeTaskGitDirectory(root),
    "codex",
    "task-envelopes",
    `${digest}.json`,
  );
}

async function writeBestEffortCache(
  root: string,
  artifact: ArtifactReference,
  bytes: Uint8Array,
): Promise<string | null> {
  const cachePath = await taskEnvelopeCachePath(root, artifact);
  try {
    await mkdir(path.dirname(cachePath), { recursive: true });
    const existing = await readFile(cachePath);
    if (Buffer.from(existing).equals(Buffer.from(bytes))) return cachePath;
  } catch (error) {
    if (!isMissingFile(error)) return null;
  }
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
