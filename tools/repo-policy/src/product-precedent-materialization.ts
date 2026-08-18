import {
  artifactHash,
  type ArtifactReference,
} from "@agent-context/objective-kernel";

export const PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION = 2 as const;
export const PRODUCT_PRECEDENT_EVIDENCE_MEDIA_TYPE = "text/markdown";

export interface ProductPrecedentMaterializedFile {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly mode: "copy" | "adapt";
  readonly sha256: string;
  readonly bytes: number;
}

export interface ProductPrecedentMaterializationV2 {
  readonly schemaVersion: typeof PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION;
  readonly repository: string;
  readonly resolvedOrigin: string;
  readonly requestedRevision: string;
  readonly checkoutPath: string;
  readonly checkedOutRevision: string;
  readonly ancestry: "equal" | "ancestor";
  readonly license: {
    readonly declared: string;
    readonly path: string;
    readonly noticePath: string | null;
    readonly sha256: string;
  };
  readonly evidence: {
    readonly path: string;
    readonly sha256: string;
    readonly artifact: ArtifactReference;
  };
  readonly sourceFiles: readonly ProductPrecedentMaterializedFile[];
}

export function decodeProductPrecedentMaterialization(
  value: unknown,
): ProductPrecedentMaterializationV2 {
  const record = strictRecord(value, "Product precedent materialization", [
    "schemaVersion",
    "repository",
    "resolvedOrigin",
    "requestedRevision",
    "checkoutPath",
    "checkedOutRevision",
    "ancestry",
    "license",
    "evidence",
    "sourceFiles",
  ]);
  if (record.schemaVersion !== PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION) {
    throw new Error("Product precedent materialization schemaVersion must be 2.");
  }
  const requestedRevision = exactRevision(record, "requestedRevision");
  const checkedOutRevision = exactRevision(record, "checkedOutRevision");
  const ancestry = requiredString(record, "ancestry");
  if (ancestry !== "equal" && ancestry !== "ancestor") {
    throw new Error("Product precedent materialization ancestry must be equal or ancestor.");
  }
  const license = strictRecord(record.license, "Product precedent materialization license", [
    "declared",
    "path",
    "noticePath",
    "sha256",
  ]);
  const evidence = strictRecord(record.evidence, "Product precedent materialization evidence", [
    "path",
    "sha256",
    "artifact",
  ]);
  if (!Array.isArray(record.sourceFiles)) {
    throw new Error("Product precedent materialization sourceFiles must be an array.");
  }
  const licenseHash = sha256(license, "sha256");
  const evidenceHash = sha256(evidence, "sha256");
  const artifact = decodeArtifactReference(evidence.artifact);
  if (artifact.hash !== `sha256:${evidenceHash}`) {
    throw new Error("Product precedent evidence artifact hash must match evidence sha256.");
  }
  return {
    schemaVersion: PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION,
    repository: requiredString(record, "repository"),
    resolvedOrigin: requiredString(record, "resolvedOrigin"),
    requestedRevision,
    checkoutPath: requiredString(record, "checkoutPath"),
    checkedOutRevision,
    ancestry,
    license: {
      declared: requiredString(license, "declared"),
      path: requiredString(license, "path"),
      noticePath: optionalString(license, "noticePath"),
      sha256: licenseHash,
    },
    evidence: {
      path: requiredString(evidence, "path"),
      sha256: evidenceHash,
      artifact,
    },
    sourceFiles: record.sourceFiles.map(decodeMaterializedFile),
  };
}

function decodeMaterializedFile(value: unknown): ProductPrecedentMaterializedFile {
  const record = strictRecord(value, "Product precedent materialized source file", [
    "sourcePath",
    "targetPath",
    "mode",
    "sha256",
    "bytes",
  ]);
  const mode = requiredString(record, "mode");
  if (mode !== "copy" && mode !== "adapt") {
    throw new Error("Product precedent materialized source file mode must be copy or adapt.");
  }
  const bytes = record.bytes;
  if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("Product precedent materialized source file bytes must be non-negative.");
  }
  return {
    sourcePath: requiredString(record, "sourcePath"),
    targetPath: requiredString(record, "targetPath"),
    mode,
    sha256: sha256(record, "sha256"),
    bytes,
  };
}

function decodeArtifactReference(value: unknown): ArtifactReference {
  const record = strictRecord(value, "Product precedent evidence artifact", [
    "hash",
    "mediaType",
    "bytes",
    "label",
  ]);
  const bytes = record.bytes;
  if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("Product precedent evidence artifact bytes must be non-negative.");
  }
  const mediaType = requiredString(record, "mediaType");
  if (mediaType !== PRODUCT_PRECEDENT_EVIDENCE_MEDIA_TYPE) {
    throw new Error("Product precedent evidence artifact must use text/markdown.");
  }
  return {
    hash: artifactHash(requiredString(record, "hash")),
    mediaType,
    bytes,
    label: requiredString(record, "label"),
  };
}

function exactRevision(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`${key} must be an exact lowercase Git commit hash.`);
  }
  return value;
}

function sha256(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${key} must be a lowercase SHA-256 hash.`);
  }
  return value;
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}`);
  }
  return value;
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

function optionalString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  if (candidate === null) return null;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string or null.`);
  }
  return candidate;
}
