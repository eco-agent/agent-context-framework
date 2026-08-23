import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ArtifactReference,
  LeasedObjective,
  ObjectiveCheckpoint,
} from "@agent-context/objective-kernel";
import {
  decodeImplementationContract,
  decodeProductPrecedentMaterialization,
  matchesWritablePath,
  validateImplementationSkill,
  type CapabilityRequest,
  type ImplementationContractV2,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import type { ObjectiveAttemptContext } from "@agent-context/objective-runtime";
import * as z from "zod/v4";

import type { JsonValue } from "@agent-context/codex-workflow-runtime";
import {
  publishVerifiedPrecedentEvidence,
  readPinnedGitFile,
  VerifiedProductPrecedentMaterializationV2,
} from "./product-precedent-materialization.js";

export const TASK_ENVELOPE_SCHEMA_VERSION = 2;
export const TASK_ENVELOPE_MEDIA_TYPE =
  "application/vnd.agent-context.task-envelope.v2+json";

export class TaskEnvelopeCapacityExceededError extends Error {
  public constructor(
    public readonly dimension: "context" | "prompt",
    public readonly requiredBytes: number,
    public readonly remainingBytes: number,
  ) {
    super(
      `Mandatory task envelope is ${requiredBytes} bytes and exceeds the ${remainingBytes}-byte remaining ${dimension} budget. Increase the objective's measured ${dimension} budget or reduce mandatory sources; no source was truncated.`,
    );
    this.name = "TaskEnvelopeCapacityExceededError";
  }
}
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const artifactHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
);
const jsonValueSchema = z.custom<JsonValue>(isJsonValue, "Value must be JSON serializable.");

const artifactReferenceSchema = z.object({
  hash: artifactHashSchema,
  mediaType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  label: z.string().min(1),
}).strict();

const contextReferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("git"),
    repository: z.string().min(1),
    revision: z.string().min(1),
    path: z.string().min(1).optional(),
  }).strict(),
  z.object({
    type: z.literal("artifact"),
    hash: artifactHashSchema,
    mediaType: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("external"),
    provider: z.string().min(1),
    reference: z.string().min(1),
    revision: z.string().min(1).optional(),
  }).strict(),
]);

const acceptanceGateSchema = z.object({
  gateId: z.string().min(1),
  description: z.string().min(1),
  evidenceTypes: z.array(z.string().min(1)),
}).strict();

const taskEnvelopeSourceSchema = z.object({
  role: z.enum([
    "task_contract",
    "implementation_contract",
    "implementation_skill",
    "product_precedent",
    "product_precedent_source",
    "product_precedent_materialization",
    "supplemental",
  ]),
  path: z.string().min(1),
  sha256: sha256Schema,
  content: z.string(),
  returnedRange: jsonValueSchema,
  omitted: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  truncated: z.boolean(),
}).strict();

const remainingBudgetSchema = z.object({
  attempts: z.number().int().nonnegative(),
  transitions: z.number().int().nonnegative(),
  contextBytes: z.number().int().nonnegative(),
  promptBytes: z.number().int().nonnegative(),
  agentInputTokens: z.number().int().nonnegative(),
  agentOutputTokens: z.number().int().nonnegative(),
}).strict();

const checkpointSchema = z.object({
  summary: z.string(),
  progressPercent: z.number().min(0).max(100),
  artifacts: z.array(artifactReferenceSchema),
}).strict();

const taskEnvelopeSchema = z.object({
  schemaVersion: z.literal(TASK_ENVELOPE_SCHEMA_VERSION),
  objective: z.object({
    objectiveId: uuidSchema,
    objectiveKey: z.string().min(1),
    purpose: z.string().min(1),
    acceptance: z.array(acceptanceGateSchema),
    context: z.array(contextReferenceSchema),
    metadata: z.record(z.string(), z.string()),
  }).strict(),
  attempt: z.object({
    leaseId: uuidSchema,
    runId: uuidSchema,
    workerId: z.string().min(1),
    attempt: z.number().int().positive(),
  }).strict(),
  authority: z.object({
    allowedActors: z.union([
      z.literal("any_trusted_actor"),
      z.array(z.string().min(1)),
    ]),
    writablePaths: z.array(z.string().min(1)),
    readableReferences: z.array(z.string().min(1)),
    verificationProfile: z.string().min(1),
    repairBudget: z.number().int().min(0).max(2),
  }).strict(),
  budget: z.object({
    remaining: remainingBudgetSchema,
  }).strict(),
  checkpoint: checkpointSchema.nullable(),
  task: z.object({
    baselineRevision: z.string().min(1),
    requestPath: z.string().min(1),
    requestSha256: sha256Schema,
    contractPath: z.string().min(1),
    contractSha256: sha256Schema,
    implementationContract: z.object({
      path: z.string().min(1),
      sha256: sha256Schema,
    }).strict().nullable(),
    productPrecedentMaterialization: z.object({
      path: z.string().min(1),
      sha256: sha256Schema,
    }).strict().nullable(),
  }).strict(),
  implementation: z.object({
    replacements: z.array(z.object({
      path: z.string().min(1),
      disposition: z.enum(["remove", "rewrite"]),
    }).strict()),
    skills: z.array(z.string().min(1)),
    productPrecedent: z.object({
      product: z.string().min(1),
      checkoutPath: z.string().min(1),
      source: z.object({
        repository: z.string().min(1),
        revision: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
        license: z.string().min(1),
      }).strict(),
      implementation: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("reuse"),
          licenseNoticePath: z.string().min(1),
          files: z.array(z.object({
            sourcePath: z.string().min(1),
            targetPath: z.string().min(1),
            mode: z.enum(["copy", "adapt"]),
          }).strict()).min(1),
        }).strict(),
        z.object({
          kind: z.literal("observe"),
          acceptanceGateId: z.string().min(1),
          reason: z.string().min(1),
        }).strict(),
      ]),
    }).strict().nullable(),
  }).strict().nullable(),
  context: z.object({
    sources: z.array(taskEnvelopeSourceSchema),
    omittedReferenceCount: z.number().int().nonnegative(),
    returnedUtf8Bytes: z.number().int().nonnegative(),
    maxEnvelopeBytes: z.number().int().positive(),
  }).strict(),
}).strict();

export type TaskEnvelopeSourceV2 = z.infer<typeof taskEnvelopeSourceSchema>;
export type TaskEnvelopeV2 = z.infer<typeof taskEnvelopeSchema>;

export interface TaskEnvelopeSourceBinding {
  readonly requestPath: string;
  readonly requestHash: string;
  readonly contractPath: string;
  readonly contractHash: string;
  readonly implementationContract: {
    readonly path: string;
    readonly hash: string;
  } | null;
  readonly productPrecedentMaterialization: {
    readonly path: string;
    readonly hash: string;
  } | null;
  readonly baselineRevision: string;
}

export class VerifiedTaskEnvelopeV2 {
  private constructor(public readonly value: TaskEnvelopeV2) {}

  public static create(
    input: {
      readonly envelope: TaskEnvelopeV2;
      readonly expected: TaskEnvelopeV2;
      readonly snapshot: LeasedObjective;
    },
  ): VerifiedTaskEnvelopeV2 {
    const decoded = decodeTaskEnvelope(input.envelope);
    if (serializeTaskEnvelope(decoded) !== serializeTaskEnvelope(input.expected)) {
      throw new Error("Task envelope is not the deterministic projection of the leased objective.");
    }
    assertTaskEnvelopeMatchesSnapshot(decoded, input.snapshot);
    return new VerifiedTaskEnvelopeV2(decoded);
  }

  public assertSnapshot(snapshot: LeasedObjective): void {
    assertTaskEnvelopeMatchesSnapshot(this.value, snapshot);
  }
}

export interface PublishedTaskEnvelopeV2 {
  readonly envelope: VerifiedTaskEnvelopeV2;
  readonly artifact: ArtifactReference;
  readonly bytes: Uint8Array;
}

export async function publishTaskEnvelope(
  context: ObjectiveAttemptContext,
  input: {
    readonly root: string;
    readonly binding: TaskEnvelopeSourceBinding;
    readonly capability: CapabilityRequest;
    readonly implementationContract: ImplementationContractV2 | null;
    readonly productPrecedentMaterialization: ProductPrecedentMaterializationV2 | null;
  },
): Promise<PublishedTaskEnvelopeV2> {
  const artifacts = context.artifacts;
  if (artifacts === undefined) {
    throw new Error("Objective task launch requires an authoritative artifact store.");
  }
  const verifiedMaterialization = await verifyPrecedentMaterialization(
    input.root,
    input.implementationContract,
    input.productPrecedentMaterialization,
  );
  if (verifiedMaterialization !== null) {
    await publishVerifiedPrecedentEvidence(artifacts, verifiedMaterialization);
  }
  const projected = await createTaskEnvelope(input.root, {
    snapshot: context.snapshot,
    binding: input.binding,
    capability: input.capability,
    implementationContract: input.implementationContract,
    productPrecedentMaterialization: verifiedMaterialization?.value ?? null,
  });
  const bytes = taskEnvelopeBytes(projected);
  const remainingContext =
    context.snapshot.definition.budget.maxContextBytes - context.snapshot.usage.contextBytes;
  if (bytes.byteLength > remainingContext) {
    await context.checkpoint({
      summary: "Task envelope exceeded the remaining durable context budget.",
      progressPercent: context.snapshot.latestCheckpoint?.progressPercent ?? 0,
      contextBytesDelta: remainingContext + 1,
    });
    throw new Error("Unreachable after durable task-envelope budget exhaustion.");
  }
  const artifact = await artifacts.put({
    bytes,
    mediaType: TASK_ENVELOPE_MEDIA_TYPE,
    label: `TaskEnvelopeV2 attempt ${context.snapshot.lease.attempt}`,
  });
  const stored = await artifacts.get(artifact.hash);
  if (stored === undefined) {
    throw new Error("Authoritative task envelope artifact is missing after publication.");
  }
  if (
    stored.mediaType !== TASK_ENVELOPE_MEDIA_TYPE ||
    stored.bytes.byteLength !== artifact.bytes
  ) {
    throw new Error("Authoritative task envelope artifact metadata is invalid.");
  }
  const storedInput: unknown = JSON.parse(Buffer.from(stored.bytes).toString("utf8"));
  const storedEnvelope = decodeTaskEnvelope(storedInput);
  const envelope = VerifiedTaskEnvelopeV2.create({
    envelope: storedEnvelope,
    expected: projected,
    snapshot: context.snapshot,
  });
  assertEnvelopeArtifact(artifact, envelope.value);
  await verifyEnvelopeSourceHashes(input.root, envelope.value);
  await context.checkpoint({
    summary: `Published and verified TaskEnvelopeV2 ${artifact.hash}.`,
    progressPercent: Math.max(context.snapshot.latestCheckpoint?.progressPercent ?? 0, 5),
    artifacts: mergeArtifactReferences(
      context.snapshot.latestCheckpoint?.artifacts ?? [],
      artifact,
      verifiedMaterialization?.value.evidence.artifact ?? null,
    ),
    contextBytesDelta: bytes.byteLength,
  });
  return { envelope, artifact, bytes: stored.bytes };
}

export async function createTaskEnvelope(
  root: string,
  input: {
    readonly snapshot: LeasedObjective;
    readonly binding: TaskEnvelopeSourceBinding;
    readonly capability: CapabilityRequest;
    readonly implementationContract: ImplementationContractV2 | null;
    readonly productPrecedentMaterialization: ProductPrecedentMaterializationV2 | null;
  },
): Promise<TaskEnvelopeV2> {
  assertCapabilityMatchesObjective(input.capability, input.snapshot);
  assertBindingMatchesCapability(input.binding, input.capability);
  assertImplementationContract(
    input.implementationContract,
    input.productPrecedentMaterialization,
    input.binding,
    input.capability,
    input.snapshot,
  );
  const mandatorySources = implementationSources(
    input.binding,
    input.implementationContract,
  );
  const mandatoryPaths = mandatorySources.map((source) => source.path);
  const supplementalReferences = uniqueReferences(
    mandatoryPaths,
    input.capability.readableReferences,
  );
  const maxEnvelopeBytes = envelopeCapacity(input.snapshot);
  const sources = await readEnvelopeSources(
    root,
    mandatorySources,
    input.implementationContract,
  );
  assertBoundSourceHashes(sources, input.binding);
  assertImplementationSource(sources, input.implementationContract);
  assertImplementationSkills(sources, input.implementationContract);
  assertMaterializationSource(sources, input.productPrecedentMaterialization);
  assertPrecedentSourceFiles(
    sources,
    input.implementationContract,
    input.productPrecedentMaterialization,
  );

  let envelope: TaskEnvelopeV2 = {
    schemaVersion: TASK_ENVELOPE_SCHEMA_VERSION,
    objective: {
      objectiveId: input.snapshot.definition.objectiveId,
      objectiveKey: input.snapshot.definition.objectiveKey,
      purpose: input.snapshot.definition.purpose,
      acceptance: input.snapshot.definition.acceptance.map((gate) => ({
        gateId: gate.gateId,
        description: gate.description,
        evidenceTypes: [...gate.evidenceTypes],
      })),
      context: input.snapshot.definition.context.map((reference) => ({ ...reference })),
      metadata: { ...input.snapshot.definition.metadata },
    },
    attempt: {
      leaseId: input.snapshot.lease.leaseId,
      runId: input.snapshot.lease.runId,
      workerId: input.snapshot.lease.workerId,
      attempt: input.snapshot.lease.attempt,
    },
    authority: {
      allowedActors: input.snapshot.definition.authority.allowedActors === "any_trusted_actor"
        ? "any_trusted_actor"
        : [...input.snapshot.definition.authority.allowedActors],
      writablePaths: [...input.capability.writablePaths],
      readableReferences: [...input.capability.readableReferences],
      verificationProfile: input.capability.verificationProfile,
      repairBudget: input.capability.repairBudget,
    },
    budget: { remaining: remainingBudget(input.snapshot) },
    checkpoint: checkpointProjection(input.snapshot.latestCheckpoint),
    task: {
      baselineRevision: input.binding.baselineRevision,
      requestPath: input.binding.requestPath,
      requestSha256: input.binding.requestHash,
      contractPath: input.binding.contractPath,
      contractSha256: input.binding.contractHash,
      implementationContract: input.binding.implementationContract === null
        ? null
        : {
            path: input.binding.implementationContract.path,
            sha256: input.binding.implementationContract.hash,
          },
      productPrecedentMaterialization:
        input.binding.productPrecedentMaterialization === null
          ? null
          : {
              path: input.binding.productPrecedentMaterialization.path,
              sha256: input.binding.productPrecedentMaterialization.hash,
            },
    },
    implementation: input.implementationContract === null
      ? null
      : projectImplementationContract(input.implementationContract),
    context: {
      sources,
      omittedReferenceCount: supplementalReferences.length,
      returnedUtf8Bytes: sourceBytes(sources),
      maxEnvelopeBytes,
    },
  };
  const renderedBytes = Buffer.byteLength(serializeTaskEnvelope(envelope), "utf8");
  if (renderedBytes > maxEnvelopeBytes) {
    const remainingContext = snapshotRemainingContext(input.snapshot);
    const remainingPrompt = snapshotRemainingPrompt(input.snapshot);
    throw new TaskEnvelopeCapacityExceededError(
      remainingContext <= remainingPrompt ? "context" : "prompt",
      renderedBytes,
      maxEnvelopeBytes,
    );
  }
  let includedSupplemental = 0;
  for (const reference of supplementalReferences) {
    const supplemental = await readEnvelopeSource(root, {
      role: "supplemental",
      path: reference,
    });
    const candidate: TaskEnvelopeV2 = {
      ...envelope,
      context: {
        ...envelope.context,
        sources: [...envelope.context.sources, supplemental],
        omittedReferenceCount: supplementalReferences.length - includedSupplemental - 1,
        returnedUtf8Bytes: envelope.context.returnedUtf8Bytes +
          Buffer.byteLength(supplemental.content, "utf8"),
      },
    };
    const candidateBytes = Buffer.byteLength(serializeTaskEnvelope(candidate), "utf8");
    if (candidateBytes <= maxEnvelopeBytes) {
      envelope = candidate;
      includedSupplemental += 1;
    }
  }
  return envelope;
}

export function decodeTaskEnvelope(value: unknown): TaskEnvelopeV2 {
  return taskEnvelopeSchema.parse(value);
}

export function serializeTaskEnvelope(envelope: TaskEnvelopeV2): string {
  return JSON.stringify(envelope);
}

export function taskEnvelopeBytes(envelope: TaskEnvelopeV2): Uint8Array {
  return Buffer.from(serializeTaskEnvelope(envelope), "utf8");
}

export function renderTaskEnvelopeContext(
  envelope: VerifiedTaskEnvelopeV2,
  artifact: ArtifactReference,
): string {
  assertEnvelopeArtifact(artifact, envelope.value);
  return `TaskEnvelopeV2 ${artifact.hash}\n${serializeTaskEnvelope(envelope.value)}`;
}

export function assertEnvelopeArtifact(
  artifact: ArtifactReference,
  envelope: TaskEnvelopeV2,
): void {
  const bytes = taskEnvelopeBytes(envelope);
  const expectedHash = `sha256:${sha256(bytes)}`;
  if (
    artifact.hash !== expectedHash ||
    artifact.mediaType !== TASK_ENVELOPE_MEDIA_TYPE ||
    artifact.bytes !== bytes.byteLength
  ) {
    throw new Error("Task envelope artifact reference does not match its bytes.");
  }
}

export function assertTaskEnvelopeMatchesSnapshot(
  envelope: TaskEnvelopeV2,
  snapshot: LeasedObjective,
): void {
  if (
    envelope.objective.objectiveId !== snapshot.definition.objectiveId ||
    envelope.attempt.leaseId !== snapshot.lease.leaseId ||
    envelope.attempt.runId !== snapshot.lease.runId ||
    envelope.attempt.workerId !== snapshot.lease.workerId ||
    envelope.attempt.attempt !== snapshot.lease.attempt
  ) {
    throw new Error("Task envelope does not match the active leased objective attempt.");
  }
  const allowed = snapshot.definition.authority.allowedActors;
  if (allowed !== "any_trusted_actor" && !allowed.includes(snapshot.lease.workerId)) {
    throw new Error("Leased task worker is outside objective authority.");
  }
}

function assertCapabilityMatchesObjective(
  capability: CapabilityRequest,
  snapshot: LeasedObjective,
): void {
  if (capability.objectiveId !== snapshot.definition.objectiveId) {
    throw new Error("Task capability does not match the leased objective identity.");
  }
  if (capability.objective !== snapshot.definition.purpose) {
    throw new Error("Task capability purpose does not match the leased objective purpose.");
  }
  const allowed = snapshot.definition.authority.allowedActors;
  if (allowed !== "any_trusted_actor" && !allowed.includes(snapshot.lease.workerId)) {
    throw new Error("Leased task worker is outside objective authority.");
  }
}

function assertBindingMatchesCapability(
  binding: TaskEnvelopeSourceBinding,
  capability: CapabilityRequest,
): void {
  if (
    binding.contractPath !== capability.contractPath ||
    (binding.implementationContract?.path ?? null) !==
      (capability.implementationContractPath ?? null) ||
    binding.baselineRevision !== capability.baselineRevision
  ) {
    throw new Error("Task source binding does not match its capability authority.");
  }
}

function assertImplementationContract(
  contract: ImplementationContractV2 | null,
  materialization: ProductPrecedentMaterializationV2 | null,
  binding: TaskEnvelopeSourceBinding,
  capability: CapabilityRequest,
  snapshot: LeasedObjective,
): void {
  if ((contract === null) !== (binding.implementationContract === null)) {
    throw new Error("Task implementation contract does not match its source binding.");
  }
  if ((materialization === null) !== (binding.productPrecedentMaterialization === null)) {
    throw new Error("Product precedent materialization does not match its source binding.");
  }
  if (capability.verificationProfile === "product-topology" && contract?.productPrecedent === null) {
    throw new Error("Product-topology task envelopes require a product precedent.");
  }
  if (capability.verificationProfile === "product-topology" && contract?.skills.length === 0) {
    throw new Error("Product-topology task envelopes require an implementation skill.");
  }
  if (contract === null) return;
  for (const skillPath of contract.skills) {
    if (!capability.readableReferences.includes(skillPath)) {
      throw new Error(`Implementation skill is outside capability references: ${skillPath}.`);
    }
  }
  const precedent = contract.productPrecedent;
  if (precedent === null) {
    if (materialization !== null) {
      throw new Error("Unexpected product precedent materialization without a precedent.");
    }
    return;
  }
  if (materialization === null) {
    throw new Error("Product precedent task envelopes require verified materialization.");
  }
  if (
    binding.productPrecedentMaterialization?.path !== precedent.materializationPath ||
    materialization.repository !== precedent.source.repository ||
    materialization.requestedRevision !== precedent.source.revision ||
    materialization.checkoutPath !== precedent.checkoutPath ||
    materialization.license.declared !== precedent.source.license ||
    materialization.license.path !== precedent.licensePath ||
    materialization.evidence.path !== precedent.evidencePath
  ) {
    throw new Error("Product precedent materialization does not match its implementation contract.");
  }
  if (!capability.readableReferences.includes(precedent.evidencePath)) {
    throw new Error("Product precedent evidence is outside capability references.");
  }
  if (!capability.readableReferences.includes(precedent.materializationPath)) {
    throw new Error("Product precedent materialization is outside capability references.");
  }
  const acceptanceGateIds = new Set(
    snapshot.definition.acceptance.map((gate) => gate.gateId),
  );
  const unknownGate = precedent.deviations.find(
    (deviation) => !acceptanceGateIds.has(deviation.acceptanceGateId),
  );
  if (unknownGate !== undefined) {
    throw new Error(
      `Product precedent deviation references unknown acceptance gate: ${unknownGate.acceptanceGateId}.`,
    );
  }
  if (precedent.implementation.kind === "observe") {
    if (!acceptanceGateIds.has(precedent.implementation.acceptanceGateId)) {
      throw new Error(
        `Product precedent observation references unknown acceptance gate: ${precedent.implementation.acceptanceGateId}.`,
      );
    }
    if (materialization.sourceFiles.length > 0 || materialization.license.noticePath !== null) {
      throw new Error("Observed product precedent must not materialize reusable source targets.");
    }
    return;
  }
  const reuse = precedent.implementation;
  if (materialization.license.noticePath !== reuse.licenseNoticePath) {
    throw new Error("Product precedent license notice target does not match materialization.");
  }
  if (!capability.writablePaths.some((pattern) =>
    matchesWritablePath(reuse.licenseNoticePath, pattern))) {
    throw new Error("Product precedent license notice is outside capability writable paths.");
  }
  if (materialization.sourceFiles.length !== reuse.files.length) {
    throw new Error("Product precedent materialization is missing declared reusable source files.");
  }
  for (const file of reuse.files) {
    const materialized = materialization.sourceFiles.find(
      (candidate) => candidate.sourcePath === file.sourcePath,
    );
    if (
      materialized === undefined ||
      materialized.targetPath !== file.targetPath ||
      materialized.mode !== file.mode
    ) {
      throw new Error(`Product precedent source file does not match materialization: ${file.sourcePath}.`);
    }
    const readablePath = path.posix.join(precedent.checkoutPath, file.sourcePath);
    if (!capability.readableReferences.includes(readablePath)) {
      throw new Error(`Product precedent source file is outside capability references: ${readablePath}.`);
    }
    if (!capability.writablePaths.some((pattern) =>
      matchesWritablePath(file.targetPath, pattern))) {
      throw new Error(`Product precedent target is outside capability writable paths: ${file.targetPath}.`);
    }
  }
}

function projectImplementationContract(
  contract: ImplementationContractV2,
): NonNullable<TaskEnvelopeV2["implementation"]> {
  return {
    replacements: contract.replacements.map((replacement) => ({ ...replacement })),
    skills: [...contract.skills],
    productPrecedent: contract.productPrecedent === null
      ? null
      : {
          product: contract.productPrecedent.product,
          checkoutPath: contract.productPrecedent.checkoutPath,
          source: { ...contract.productPrecedent.source },
          implementation: contract.productPrecedent.implementation.kind === "reuse"
            ? {
                kind: "reuse",
                licenseNoticePath: contract.productPrecedent.implementation.licenseNoticePath,
                files: contract.productPrecedent.implementation.files.map((file) => ({ ...file })),
              }
            : { ...contract.productPrecedent.implementation },
        },
  };
}

type EnvelopeSourceRole = TaskEnvelopeSourceV2["role"];

interface EnvelopeSourceRequest {
  readonly role: EnvelopeSourceRole;
  readonly path: string;
}

function implementationSources(
  binding: TaskEnvelopeSourceBinding,
  contract: ImplementationContractV2 | null,
): readonly EnvelopeSourceRequest[] {
  const sources: EnvelopeSourceRequest[] = [
    { role: "task_contract", path: binding.contractPath },
  ];
  if (binding.implementationContract !== null) {
    sources.push({
      role: "implementation_contract",
      path: binding.implementationContract.path,
    });
  }
  if (contract !== null) {
    for (const skillPath of contract.skills) {
      sources.push({ role: "implementation_skill", path: skillPath });
    }
  }
  if (contract?.productPrecedent !== null && contract?.productPrecedent !== undefined) {
    if (binding.productPrecedentMaterialization === null) {
      throw new Error("Product precedent materialization source binding is missing.");
    }
    sources.push({
      role: "product_precedent_materialization",
      path: binding.productPrecedentMaterialization.path,
    });
    sources.push({
      role: "product_precedent",
      path: contract.productPrecedent.evidencePath,
    });
    if (contract.productPrecedent.implementation.kind === "reuse") {
      for (const sourceFile of contract.productPrecedent.implementation.files) {
        sources.push({
          role: "product_precedent_source",
          path: path.posix.join(contract.productPrecedent.checkoutPath, sourceFile.sourcePath),
        });
      }
    }
  }
  return sources;
}

function assertBoundSourceHashes(
  sources: readonly TaskEnvelopeSourceV2[],
  binding: TaskEnvelopeSourceBinding,
): void {
  const contract = sources.find((source) => source.role === "task_contract");
  if (contract?.sha256 !== binding.contractHash) {
    throw new Error("Task contract hash does not match its source binding.");
  }
  const implementation = sources.find(
    (source) => source.role === "implementation_contract",
  );
  if (implementation?.sha256 !== (binding.implementationContract?.hash ?? undefined)) {
    if (implementation !== undefined || binding.implementationContract !== null) {
      throw new Error("Implementation contract hash does not match its source binding.");
    }
  }
  const materialization = sources.find(
    (source) => source.role === "product_precedent_materialization",
  );
  if (
    materialization?.sha256 !==
      (binding.productPrecedentMaterialization?.hash ?? undefined)
  ) {
    if (materialization !== undefined || binding.productPrecedentMaterialization !== null) {
      throw new Error("Product precedent materialization hash does not match its source binding.");
    }
  }
}

function assertImplementationSource(
  sources: readonly TaskEnvelopeSourceV2[],
  expected: ImplementationContractV2 | null,
): void {
  const source = sources.find((candidate) => candidate.role === "implementation_contract");
  if (source === undefined) {
    if (expected !== null) {
      throw new Error("Implementation contract source is missing from the task envelope.");
    }
    return;
  }
  if (expected === null) {
    throw new Error("Unexpected implementation contract source in the task envelope.");
  }
  const sourceInput: unknown = JSON.parse(source.content);
  const decoded = decodeImplementationContract(sourceInput);
  if (
    JSON.stringify(projectImplementationContract(decoded)) !==
    JSON.stringify(projectImplementationContract(expected))
  ) {
    throw new Error("Implementation contract bytes do not match the decoded launch contract.");
  }
}

function assertImplementationSkills(
  sources: readonly TaskEnvelopeSourceV2[],
  contract: ImplementationContractV2 | null,
): void {
  if (contract === null) return;
  for (const skillPath of contract.skills) {
    const source = sources.find(
      (candidate) => candidate.role === "implementation_skill" && candidate.path === skillPath,
    );
    if (source === undefined) {
      throw new Error(`Implementation skill source is missing from the task envelope: ${skillPath}.`);
    }
    validateImplementationSkill(skillPath, source.content);
  }
}

function assertMaterializationSource(
  sources: readonly TaskEnvelopeSourceV2[],
  expected: ProductPrecedentMaterializationV2 | null,
): void {
  const source = sources.find(
    (candidate) => candidate.role === "product_precedent_materialization",
  );
  if (source === undefined) {
    if (expected !== null) {
      throw new Error("Product precedent materialization source is missing from the task envelope.");
    }
    return;
  }
  if (expected === null) {
    throw new Error("Unexpected product precedent materialization source in the task envelope.");
  }
  const sourceInput: unknown = JSON.parse(source.content);
  const decoded = decodeProductPrecedentMaterialization(sourceInput);
  if (JSON.stringify(decoded) !== JSON.stringify(expected)) {
    throw new Error("Product precedent materialization bytes do not match launch evidence.");
  }
}

function assertPrecedentSourceFiles(
  sources: readonly TaskEnvelopeSourceV2[],
  contract: ImplementationContractV2 | null,
  materialization: ProductPrecedentMaterializationV2 | null,
): void {
  const sourceFiles = sources.filter(
    (candidate) => candidate.role === "product_precedent_source",
  );
  const precedent = contract?.productPrecedent;
  if (precedent === null || precedent === undefined || precedent.implementation.kind === "observe") {
    if (sourceFiles.length > 0) {
      throw new Error("Unexpected reusable product precedent source in the task envelope.");
    }
    return;
  }
  if (materialization === null) {
    throw new Error("Reusable product precedent sources require a materialization receipt.");
  }
  if (sourceFiles.length !== precedent.implementation.files.length) {
    throw new Error("Task envelope is missing reusable product precedent source bytes.");
  }
  for (const declared of precedent.implementation.files) {
    const sourcePath = path.posix.join(precedent.checkoutPath, declared.sourcePath);
    const source = sourceFiles.find((candidate) => candidate.path === sourcePath);
    const receipt = materialization.sourceFiles.find(
      (candidate) => candidate.sourcePath === declared.sourcePath,
    );
    if (
      source === undefined ||
      receipt === undefined ||
      source.sha256 !== receipt.sha256 ||
      Buffer.byteLength(source.content, "utf8") !== receipt.bytes
    ) {
      throw new Error(
        `Reusable product precedent source bytes do not match materialization: ${declared.sourcePath}.`,
      );
    }
  }
}

async function verifyPrecedentMaterialization(
  root: string,
  contract: ImplementationContractV2 | null,
  materialization: ProductPrecedentMaterializationV2 | null,
): Promise<VerifiedProductPrecedentMaterializationV2 | null> {
  if (contract?.productPrecedent === null || contract === null) {
    if (materialization !== null) {
      throw new Error("Unexpected product precedent materialization without a precedent.");
    }
    return null;
  }
  if (materialization === null) {
    throw new Error("Product precedent launch requires a materialization receipt.");
  }
  return await VerifiedProductPrecedentMaterializationV2.create(
    root,
    contract,
    materialization,
  );
}

function remainingBudget(snapshot: LeasedObjective): TaskEnvelopeV2["budget"]["remaining"] {
  const budget = snapshot.definition.budget;
  const usage = snapshot.usage;
  return {
    attempts: Math.max(0, budget.maxAttempts - usage.attempts),
    transitions: Math.max(0, budget.maxTransitions - usage.transitions),
    contextBytes: Math.max(0, budget.maxContextBytes - usage.contextBytes),
    promptBytes: Math.max(0, budget.maxPromptBytes - usage.promptBytes),
    agentInputTokens: Math.max(0, budget.maxAgentInputTokens - usage.agentInputTokens),
    agentOutputTokens: Math.max(0, budget.maxAgentOutputTokens - usage.agentOutputTokens),
  };
}

function checkpointProjection(
  checkpoint: ObjectiveCheckpoint | undefined,
): TaskEnvelopeV2["checkpoint"] {
  if (checkpoint === undefined) return null;
  return {
    summary: checkpoint.summary,
    progressPercent: checkpoint.progressPercent,
    artifacts: checkpoint.artifacts.map((artifact) => ({ ...artifact })),
  };
}

async function readEnvelopeSources(
  root: string,
  requests: readonly EnvelopeSourceRequest[],
  contract: ImplementationContractV2 | null,
): Promise<TaskEnvelopeSourceV2[]> {
  return await Promise.all(requests.map(async (request) => {
    if (request.role !== "product_precedent_source") {
      return await readEnvelopeSource(root, request);
    }
    const precedent = contract?.productPrecedent;
    if (precedent === null || precedent === undefined || precedent.implementation.kind !== "reuse") {
      throw new Error("Reusable product precedent source has no reuse contract.");
    }
    const source = precedent.implementation.files.find(
      (file) => path.posix.join(precedent.checkoutPath, file.sourcePath) === request.path,
    );
    if (source === undefined) {
      throw new Error(`Reusable product precedent source is undeclared: ${request.path}.`);
    }
    return envelopeSourceFromBytes(
      request,
      await readPinnedGitFile(
        root,
        precedent.checkoutPath,
        precedent.source.revision,
        source.sourcePath,
      ),
    );
  }));
}

async function readEnvelopeSource(
  root: string,
  request: EnvelopeSourceRequest,
): Promise<TaskEnvelopeSourceV2> {
  const bytes = await readFile(repositoryPath(root, request.path));
  return envelopeSourceFromBytes(request, bytes);
}

function envelopeSourceFromBytes(
  request: EnvelopeSourceRequest,
  bytes: Uint8Array,
): TaskEnvelopeSourceV2 {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Task envelope source must be valid UTF-8 text: ${request.path}.`);
  }
  return {
    role: request.role,
    path: request.path,
    sha256: sha256(bytes),
    content,
    returnedRange: {
      kind: "complete",
      lines: content.length === 0 ? 0 : content.split(/\r?\n/u).length,
      utf8Bytes: bytes.byteLength,
    },
    omitted: 0,
    nextCursor: null,
    truncated: false,
  };
}

function sourceBytes(sources: readonly TaskEnvelopeSourceV2[]): number {
  return sources.reduce(
    (total, source) => total + Buffer.byteLength(source.content, "utf8"),
    0,
  );
}

function envelopeCapacity(snapshot: LeasedObjective): number {
  const remainingContext = snapshotRemainingContext(snapshot);
  const remainingPrompt = snapshotRemainingPrompt(snapshot);
  const capacity = Math.min(remainingContext, remainingPrompt);
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new TaskEnvelopeCapacityExceededError(
      remainingContext <= remainingPrompt ? "context" : "prompt",
      1,
      Math.max(0, capacity),
    );
  }
  return capacity;
}

function snapshotRemainingContext(snapshot: LeasedObjective): number {
  return snapshot.definition.budget.maxContextBytes - snapshot.usage.contextBytes;
}

function snapshotRemainingPrompt(snapshot: LeasedObjective): number {
  return snapshot.definition.budget.maxPromptBytes - snapshot.usage.promptBytes;
}

function uniqueReferences(
  mandatoryPaths: readonly string[],
  references: readonly string[],
): readonly string[] {
  const mandatory = new Set(mandatoryPaths);
  return [...new Set(references.filter((candidate) => !mandatory.has(candidate)))];
}

export async function verifyEnvelopeSourceHashes(
  root: string,
  envelope: TaskEnvelopeV2,
): Promise<void> {
  for (const source of envelope.context.sources) {
    const bytes = source.role === "product_precedent_source"
      ? await pinnedEnvelopeSource(root, envelope, source)
      : await readFile(repositoryPath(root, source.path));
    if (sha256(bytes) !== source.sha256) {
      throw new Error(`Task envelope source changed: ${source.path}`);
    }
  }
}

async function pinnedEnvelopeSource(
  root: string,
  envelope: TaskEnvelopeV2,
  source: TaskEnvelopeSourceV2,
): Promise<Uint8Array> {
  const precedent = envelope.implementation?.productPrecedent;
  if (precedent === null || precedent === undefined || precedent.implementation.kind !== "reuse") {
    throw new Error("Task envelope product precedent source has no reuse projection.");
  }
  const declared = precedent.implementation.files.find(
    (file) => path.posix.join(precedent.checkoutPath, file.sourcePath) === source.path,
  );
  if (declared === undefined) {
    throw new Error(`Task envelope product precedent source is undeclared: ${source.path}.`);
  }
  return await readPinnedGitFile(
    root,
    precedent.checkoutPath,
    precedent.source.revision,
    declared.sourcePath,
  );
}

function repositoryPath(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Task envelope source is outside the repository.");
  }
  return absolute;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function mergeArtifactReferences(
  existing: readonly ArtifactReference[],
  envelope: ArtifactReference,
  precedentEvidence: ArtifactReference | null,
): readonly ArtifactReference[] {
  const replacementHashes = new Set([
    envelope.hash,
    ...(precedentEvidence === null ? [] : [precedentEvidence.hash]),
  ]);
  return [
    ...existing.filter(
      (artifact) =>
        !replacementHashes.has(artifact.hash) &&
        artifact.mediaType !== TASK_ENVELOPE_MEDIA_TYPE,
    ),
    ...(precedentEvidence === null ? [] : [precedentEvidence]),
    envelope,
  ];
}
