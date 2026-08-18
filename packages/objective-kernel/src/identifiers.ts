declare const objectiveIdBrand: unique symbol;
declare const commandIdBrand: unique symbol;
declare const leaseIdBrand: unique symbol;
declare const runIdBrand: unique symbol;
declare const artifactHashBrand: unique symbol;
declare const timestampBrand: unique symbol;

export type ObjectiveId = string & { readonly [objectiveIdBrand]: true };
export type CommandId = string & { readonly [commandIdBrand]: true };
export type LeaseId = string & { readonly [leaseIdBrand]: true };
export type RunId = string & { readonly [runIdBrand]: true };
export type ArtifactHash = string & { readonly [artifactHashBrand]: true };
export type UtcTimestamp = string & { readonly [timestampBrand]: true };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function parseUuid<T extends string>(value: string, label: string): T {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase RFC 9562 UUID.`);
  }
  // type-invariant: the UUID format check is the only constructor for branded IDs.
  return value as T;
}

export function objectiveId(value: string): ObjectiveId {
  return parseUuid<ObjectiveId>(value, "ObjectiveId");
}

export function commandId(value: string): CommandId {
  return parseUuid<CommandId>(value, "CommandId");
}

export function leaseId(value: string): LeaseId {
  return parseUuid<LeaseId>(value, "LeaseId");
}

export function runId(value: string): RunId {
  return parseUuid<RunId>(value, "RunId");
}

export function artifactHash(value: string): ArtifactHash {
  if (!SHA256_PATTERN.test(value)) {
    throw new TypeError("ArtifactHash must be sha256 followed by 64 lowercase hex characters.");
  }
  // type-invariant: the SHA-256 format check is the only ArtifactHash constructor.
  return value as ArtifactHash;
}

export function utcTimestamp(value: string): UtcTimestamp {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError("UtcTimestamp must be a canonical ISO-8601 UTC timestamp.");
  }
  // type-invariant: canonical round-trip validation establishes the timestamp brand.
  return value as UtcTimestamp;
}

export function compareTimestamps(left: UtcTimestamp, right: UtcTimestamp): number {
  return left.localeCompare(right);
}
