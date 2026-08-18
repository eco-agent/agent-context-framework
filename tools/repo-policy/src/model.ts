export const verificationProfileIds = [
  "docs",
  "frontend",
  "product-topology",
  "backend",
  "domain-module",
  "workspace-structure",
  "workflow",
  "full",
] as const;

export type VerificationProfileId = (typeof verificationProfileIds)[number];

export type CheckId =
  | "agents"
  | "boundaries"
  | "dependency-adoptions"
  | "docs"
  | "scope"
  | "test"
  | "technical-prose"
  | "typescript-projects"
  | "typecheck"
  | "verification-cleanliness"
  | "workflow-test";

interface CapabilityRequestBase {
  readonly objectiveId: ObjectiveId;
  readonly objective: string;
  readonly contractPath: string;
  readonly baselineRevision: string;
  readonly supersedes: readonly string[];
  readonly writablePaths: readonly string[];
  readonly readableReferences: readonly string[];
  readonly repairBudget: 0 | 1 | 2;
}

export type CapabilityRequest =
  | CapabilityRequestBase & {
      readonly verificationProfile: "product-topology";
      readonly implementationContractPath: string;
    }
  | CapabilityRequestBase & {
      readonly verificationProfile: Exclude<VerificationProfileId, "product-topology">;
      readonly implementationContractPath?: string;
    };

interface ActiveTaskBindingBase {
  readonly schemaVersion: 1;
  readonly objectiveId: ObjectiveId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly workerId: string;
  readonly attempt: number;
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
  readonly executionDirectory: string;
  readonly envelopeArtifact: ArtifactReference;
}

export interface ActiveTaskAttemptBinding extends ActiveTaskBindingBase {
  readonly state: "attempt";
}

export interface ActiveTaskSessionBinding extends ActiveTaskBindingBase {
  readonly state: "session";
  readonly sessionId: string;
}

export type ActiveTaskBinding =
  | ActiveTaskAttemptBinding
  | ActiveTaskSessionBinding;

export interface CheckResult {
  readonly id: CheckId;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly summary: string;
  readonly diagnostics: readonly string[];
  readonly artifact?: string;
}

export interface PolicyResult {
  readonly ok: boolean;
  readonly operation: string;
  readonly profile?: VerificationProfileId;
  readonly base?: string;
  readonly changedFiles: readonly string[];
  readonly affectedUnits: readonly string[];
  readonly checks: readonly CheckResult[];
}

export function isVerificationProfileId(value: string): value is VerificationProfileId {
  return verificationProfileIds.some((candidate) => candidate === value);
}

export function decodeCapabilityRequest(value: unknown): CapabilityRequest {
  if (!isRecord(value)) {
    throw new Error("Capability request must be an object.");
  }

  const allowedKeys = new Set([
    "objectiveId",
    "objective",
    "contractPath",
    "implementationContractPath",
    "baselineRevision",
    "supersedes",
    "writablePaths",
    "readableReferences",
    "verificationProfile",
    "repairBudget",
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Capability request contains unknown fields: ${unknownKeys.join(", ")}`);
  }

  const objectiveId = decodeObjectiveId(value.objectiveId);
  const objective = requiredString(value, "objective");
  const contractPath = requiredString(value, "contractPath");
  const implementationContractPath = optionalString(value, "implementationContractPath");
  const baselineRevision = requiredString(value, "baselineRevision");
  const supersedes = requiredStringArray(value, "supersedes");
  const writablePaths = requiredStringArray(value, "writablePaths");
  const readableReferences = requiredStringArray(value, "readableReferences");
  const verificationProfile = requiredString(value, "verificationProfile");
  const repairBudget = decodeRepairBudget(value.repairBudget);

  if (!isVerificationProfileId(verificationProfile)) {
    throw new Error(`Unknown verification profile: ${verificationProfile}`);
  }
  const base = {
    objectiveId,
    objective,
    contractPath,
    baselineRevision,
    supersedes,
    writablePaths,
    readableReferences,
    repairBudget,
  };
  if (verificationProfile === "product-topology") {
    if (implementationContractPath === undefined) {
      throw new Error("Product-topology capability requests require implementationContractPath.");
    }
    return { ...base, verificationProfile, implementationContractPath };
  }
  return implementationContractPath === undefined
    ? { ...base, verificationProfile }
    : { ...base, verificationProfile, implementationContractPath };
}

function decodeRepairBudget(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error("repairBudget must be 0, 1, or 2.");
  }
  return value;
}

export function decodeObjectiveId(value: unknown): ObjectiveId {
  if (typeof value !== "string") {
    throw new Error("objectiveId must be a lowercase RFC 9562 UUID.");
  }
  try {
    return parseObjectiveId(value);
  } catch {
    throw new Error("objectiveId must be a lowercase RFC 9562 UUID.");
  }
}

export function decodeActiveTaskBinding(value: unknown): ActiveTaskBinding {
  if (!isRecord(value)) {
    throw new Error("Active task binding must be an object.");
  }
  const state = requiredString(value, "state");
  if (state !== "attempt" && state !== "session") {
    throw new Error("Active task state must be attempt or session.");
  }
  const commonKeys = [
    "schemaVersion",
    "state",
    "objectiveId",
    "leaseId",
    "runId",
    "workerId",
    "attempt",
    "requestPath",
    "requestHash",
    "contractPath",
    "contractHash",
    "implementationContract",
    "productPrecedentMaterialization",
    "baselineRevision",
    "executionDirectory",
    "envelopeArtifact",
  ] as const;
  const keys = state === "session" ? [...commonKeys, "sessionId"] : commonKeys;
  const unknownKeys = Object.keys(value).filter(
    (key) => !keys.some((candidate) => candidate === key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Active task binding contains unknown fields: ${unknownKeys.join(", ")}`);
  }
  if (value.schemaVersion !== 1) {
    throw new Error("Active task schemaVersion must be 1.");
  }
  const requestHash = requiredString(value, "requestHash");
  const contractHash = requiredString(value, "contractHash");
  for (const [key, hash] of [["requestHash", requestHash], ["contractHash", contractHash]] as const) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) {
      throw new Error(`Active task ${key} must be a lowercase SHA-256 hash.`);
    }
  }
  const attempt = value.attempt;
  if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("Active task attempt must be a positive safe integer.");
  }
  const envelopeArtifact = decodeArtifactReference(value.envelopeArtifact);
  const implementationContract = decodeImplementationContractBinding(value.implementationContract);
  const productPrecedentMaterialization = decodeSourceBinding(
    value.productPrecedentMaterialization,
    "productPrecedentMaterialization",
  );
  const common: ActiveTaskBindingBase = {
    schemaVersion: 1,
    objectiveId: decodeObjectiveId(value.objectiveId),
    leaseId: parseLeaseId(value.leaseId),
    runId: parseRunId(value.runId),
    workerId: requiredString(value, "workerId"),
    attempt,
    requestPath: requiredString(value, "requestPath"),
    requestHash,
    contractPath: requiredString(value, "contractPath"),
    contractHash,
    implementationContract,
    productPrecedentMaterialization,
    baselineRevision: requiredString(value, "baselineRevision"),
    executionDirectory: requiredString(value, "executionDirectory"),
    envelopeArtifact,
  };
  if (state === "attempt") {
    return { ...common, state };
  }
  const sessionId = requiredString(value, "sessionId");
  if (!/^[A-Za-z0-9._-]+$/u.test(sessionId)) {
    throw new Error("Active task sessionId contains unsupported characters.");
  }
  return { ...common, state, sessionId };
}

function decodeArtifactReference(value: unknown): ArtifactReference {
  if (!isRecord(value)) {
    throw new Error("Active task envelopeArtifact must be an object.");
  }
  const keys = ["hash", "mediaType", "bytes", "label"] as const;
  const unknownKeys = Object.keys(value).filter(
    (key) => !keys.some((candidate) => candidate === key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Active task envelopeArtifact contains unknown fields: ${unknownKeys.join(", ")}`);
  }
  const bytes = value.bytes;
  if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("Active task envelopeArtifact bytes must be a non-negative safe integer.");
  }
  return {
    hash: parseArtifactHash(value.hash),
    mediaType: requiredString(value, "mediaType"),
    bytes,
    label: requiredString(value, "label"),
  };
}

function parseArtifactHash(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Active task envelopeArtifact hash is invalid.");
  }
  try {
    return artifactHash(value);
  } catch {
    throw new Error("Active task envelopeArtifact hash is invalid.");
  }
}

function parseLeaseId(value: unknown): LeaseId {
  if (typeof value !== "string") {
    throw new Error("Active task leaseId is invalid.");
  }
  try {
    return leaseId(value);
  } catch {
    throw new Error("Active task leaseId is invalid.");
  }
}

function parseRunId(value: unknown): RunId {
  if (typeof value !== "string") {
    throw new Error("Active task runId is invalid.");
  }
  try {
    return runId(value);
  } catch {
    throw new Error("Active task runId is invalid.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return candidate;
}

function requiredStringArray(value: Record<string, unknown>, key: string): readonly string[] {
  const candidate = value[key];
  if (
    !Array.isArray(candidate) ||
    candidate.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw new Error(`${key} must be an array of non-empty strings.`);
  }
  return candidate as string[];
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string when provided.`);
  }
  return candidate;
}

function decodeImplementationContractBinding(
  value: unknown,
): ActiveTaskBindingBase["implementationContract"] {
  return decodeSourceBinding(value, "implementationContract");
}

function decodeSourceBinding(
  value: unknown,
  label: "implementationContract" | "productPrecedentMaterialization",
): { readonly path: string; readonly hash: string } | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`Active task ${label} must be an object or null.`);
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== "path" && key !== "hash");
  if (unknownKeys.length > 0) {
    throw new Error(
      `Active task ${label} contains unknown fields: ${unknownKeys.join(", ")}`,
    );
  }
  const hash = requiredString(value, "hash");
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new Error(`Active task ${label} hash must be a lowercase SHA-256 hash.`);
  }
  return { path: requiredString(value, "path"), hash };
}
export type { ObjectiveId } from "@agent-context/objective-kernel";
import {
  artifactHash,
  leaseId,
  objectiveId as parseObjectiveId,
  runId,
  type ArtifactReference,
  type LeaseId,
  type ObjectiveId,
  type RunId,
} from "@agent-context/objective-kernel";
