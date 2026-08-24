import { decodeContentArtifactReference, type ContentArtifactReference } from "./content-addressed-artifacts.js";

export type HumanAcceptanceTarget = RepresentationAcceptanceTarget | VisualAcceptanceTarget;

export interface RepresentationAcceptanceTarget {
  readonly kind: "representation";
  readonly runId: string;
  readonly specificationBundleReference: ContentArtifactReference;
  readonly comparisonReference: ContentArtifactReference;
  readonly selectedCandidateReference: ContentArtifactReference;
}

export interface VisualAcceptanceTarget {
  readonly kind: "visual";
  readonly runId: string;
  readonly revision: string;
  readonly renderEvidenceSetReference: ContentArtifactReference;
  readonly reviewReference: ContentArtifactReference;
}

export interface HumanAcceptanceSignal {
  readonly schemaVersion: 1;
  readonly decision: "accept";
  readonly owner: string;
  readonly decidedAt: string;
  readonly target: HumanAcceptanceTarget;
  readonly note: string;
}

export interface HumanAcceptanceStore {
  load(key: string): Promise<HumanAcceptanceSignal | undefined>;
  save(key: string, signal: HumanAcceptanceSignal): Promise<void>;
}

export interface HumanAcceptanceResult {
  readonly status: "accepted";
  readonly replayed: boolean;
  readonly key: string;
  readonly signal: HumanAcceptanceSignal;
}

export async function transitionHumanAcceptance(
  expectedTarget: HumanAcceptanceTarget,
  input: unknown,
  store: HumanAcceptanceStore,
): Promise<HumanAcceptanceResult> {
  const expected = decodeTarget(expectedTarget, "Expected acceptance target");
  const signal = decodeHumanAcceptanceSignal(input);
  if (canonicalJson(signal.target) !== canonicalJson(expected)) {
    throw new Error("Human acceptance target is stale or differs from the expected workflow result");
  }
  const key = `${expected.kind}:${expected.runId}`;
  const existing = await store.load(key);
  if (existing !== undefined) {
    if (canonicalJson(existing) !== canonicalJson(signal)) {
      throw new Error(`Human acceptance ${key} already exists with different content`);
    }
    return { status: "accepted", replayed: true, key, signal: existing };
  }
  await store.save(key, signal);
  return { status: "accepted", replayed: false, key, signal };
}

export function decodeHumanAcceptanceSignal(value: unknown): HumanAcceptanceSignal {
  const record = exactRecord(value, ["schemaVersion", "decision", "owner", "decidedAt", "target", "note"], "Human acceptance signal");
  if (record.schemaVersion !== 1) throw new Error("Human acceptance schemaVersion must be 1");
  if (record.decision !== "accept") throw new Error("Human acceptance decision must be accept");
  const decidedAt = nonEmpty(record.decidedAt, "Human acceptance decidedAt");
  if (!Number.isFinite(Date.parse(decidedAt))) throw new Error("Human acceptance decidedAt must be an ISO date-time");
  return {
    schemaVersion: 1,
    decision: "accept",
    owner: nonEmpty(record.owner, "Human acceptance owner"),
    decidedAt,
    target: decodeTarget(record.target, "Human acceptance target"),
    note: typeof record.note === "string" ? record.note : fail("Human acceptance note must be a string"),
  };
}

function decodeTarget(value: unknown, label: string): HumanAcceptanceTarget {
  const base = exactRecordByKind(value, label);
  if (base.kind === "representation") {
    const record = exactRecord(base, ["kind", "runId", "specificationBundleReference", "comparisonReference", "selectedCandidateReference"], label);
    return {
      kind: "representation",
      runId: nonEmpty(record.runId, `${label} runId`),
      specificationBundleReference: decodeContentArtifactReference(record.specificationBundleReference),
      comparisonReference: decodeContentArtifactReference(record.comparisonReference),
      selectedCandidateReference: decodeContentArtifactReference(record.selectedCandidateReference),
    };
  }
  if (base.kind === "visual") {
    const record = exactRecord(base, ["kind", "runId", "revision", "renderEvidenceSetReference", "reviewReference"], label);
    return {
      kind: "visual",
      runId: nonEmpty(record.runId, `${label} runId`),
      revision: gitRevision(record.revision, `${label} revision`),
      renderEvidenceSetReference: decodeContentArtifactReference(record.renderEvidenceSetReference),
      reviewReference: decodeContentArtifactReference(record.reviewReference),
    };
  }
  throw new Error(`${label} kind must be representation or visual`);
}

function exactRecordByKind(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const record = exactRecordByKind(value, label);
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unknown.length > 0 || missing.length > 0) throw new Error(`${label} keys differ from the contract`);
  return record;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function gitRevision(value: unknown, label: string): string {
  const revision = nonEmpty(value, label);
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error(`${label} must be a full lowercase Git commit ID`);
  return revision;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(message: string): never {
  throw new Error(message);
}
