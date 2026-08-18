export const IMPLEMENTATION_CONTRACT_SCHEMA_VERSION = 2 as const;

export type ReplacementDisposition = "remove" | "rewrite";

export interface ImplementationReplacement {
  readonly path: string;
  readonly disposition: ReplacementDisposition;
}

export interface ProductPrecedentSource {
  readonly repository: string;
  readonly revision: string;
  readonly license: string;
}

export interface ProductPrecedentDeviation {
  readonly acceptanceGateId: string;
  readonly description: string;
}

export interface ProductPrecedentSourceFile {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly mode: "copy" | "adapt";
}

export type ProductPrecedentImplementation =
  | {
      readonly kind: "reuse";
      readonly licenseNoticePath: string;
      readonly files: readonly ProductPrecedentSourceFile[];
    }
  | {
      readonly kind: "observe";
      readonly acceptanceGateId: string;
      readonly reason: string;
    };

export interface ProductPrecedent {
  readonly product: string;
  readonly source: ProductPrecedentSource;
  readonly checkoutPath: string;
  readonly licensePath: string;
  readonly evidencePath: string;
  readonly materializationPath: string;
  readonly adopt: readonly string[];
  readonly deviations: readonly ProductPrecedentDeviation[];
  readonly implementation: ProductPrecedentImplementation;
}

export interface ImplementationContractV2 {
  readonly schemaVersion: typeof IMPLEMENTATION_CONTRACT_SCHEMA_VERSION;
  readonly replacements: readonly ImplementationReplacement[];
  readonly skills: readonly string[];
  readonly productPrecedent: ProductPrecedent | null;
}

export function decodeImplementationContract(value: unknown): ImplementationContractV2 {
  const record = strictRecord(value, "Implementation contract", [
    "schemaVersion",
    "replacements",
    "skills",
    "productPrecedent",
  ]);
  if (record.schemaVersion !== IMPLEMENTATION_CONTRACT_SCHEMA_VERSION) {
    throw new Error("Implementation contract schemaVersion must be 2.");
  }
  if (!Array.isArray(record.replacements)) {
    throw new Error("Implementation contract replacements must be an array.");
  }
  return {
    schemaVersion: IMPLEMENTATION_CONTRACT_SCHEMA_VERSION,
    replacements: record.replacements.map(decodeReplacement),
    skills: uniqueStrings(requiredStringArray(record, "skills"), "Implementation contract skills"),
    productPrecedent:
      record.productPrecedent === null
        ? null
        : decodeProductPrecedent(record.productPrecedent),
  };
}

function decodeReplacement(value: unknown): ImplementationReplacement {
  const record = strictRecord(value, "Implementation replacement", ["path", "disposition"]);
  const disposition = requiredString(record, "disposition");
  if (disposition !== "remove" && disposition !== "rewrite") {
    throw new Error("Implementation replacement disposition must be remove or rewrite.");
  }
  return {
    path: repositoryRelativePath(record, "path", false),
    disposition,
  };
}

function decodeProductPrecedent(value: unknown): ProductPrecedent {
  const record = strictRecord(value, "Product precedent", [
    "product",
    "source",
    "checkoutPath",
    "licensePath",
    "evidencePath",
    "materializationPath",
    "adopt",
    "deviations",
    "implementation",
  ]);
  const source = strictRecord(record.source, "Product precedent source", [
    "repository",
    "revision",
    "license",
  ]);
  const revision = requiredString(source, "revision");
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) {
    throw new Error("Product precedent source revision must be an exact Git commit hash.");
  }
  const adopt = requiredStringArray(record, "adopt");
  if (adopt.length === 0) {
    throw new Error("Product precedent adopt must contain at least one preserved behavior.");
  }
  if (!Array.isArray(record.deviations)) {
    throw new Error("Product precedent deviations must be an array.");
  }
  const license = requiredString(source, "license");
  return {
    product: requiredString(record, "product"),
    source: {
      repository: requiredString(source, "repository"),
      revision,
      license,
    },
    checkoutPath: repositoryRelativePath(record, "checkoutPath", true),
    licensePath: repositoryRelativePath(record, "licensePath", false),
    evidencePath: repositoryRelativePath(record, "evidencePath", false),
    materializationPath: repositoryRelativePath(record, "materializationPath", false),
    adopt,
    deviations: record.deviations.map(decodeDeviation),
    implementation: decodePrecedentImplementation(record.implementation, license),
  };
}

function decodePrecedentImplementation(
  value: unknown,
  license: string,
): ProductPrecedentImplementation {
  if (!isRecord(value)) {
    throw new Error("Product precedent implementation must be an object.");
  }
  const kind = requiredString(value, "kind");
  if (kind === "reuse") {
    const record = strictRecord(value, "Product precedent reuse", [
      "kind",
      "licenseNoticePath",
      "files",
    ]);
    if (!Array.isArray(record.files) || record.files.length === 0) {
      throw new Error("Product precedent reuse must declare at least one source file.");
    }
    const files = record.files.map(decodeSourceFile);
    uniqueStrings(files.map((file) => file.sourcePath), "Product precedent source paths");
    uniqueStrings(files.map((file) => file.targetPath), "Product precedent target paths");
    return {
      kind,
      licenseNoticePath: repositoryRelativePath(record, "licenseNoticePath", false),
      files,
    };
  }
  if (kind === "observe") {
    const record = strictRecord(value, "Product precedent observation", [
      "kind",
      "acceptanceGateId",
      "reason",
    ]);
    if (permitsSourceReuse(license)) {
      throw new Error(
        `Product precedent license ${license} permits source reuse; implementation kind must be reuse.`,
      );
    }
    return {
      kind,
      acceptanceGateId: requiredString(record, "acceptanceGateId"),
      reason: requiredString(record, "reason"),
    };
  }
  throw new Error("Product precedent implementation kind must be reuse or observe.");
}

function decodeSourceFile(value: unknown): ProductPrecedentSourceFile {
  const record = strictRecord(value, "Product precedent source file", [
    "sourcePath",
    "targetPath",
    "mode",
  ]);
  const mode = requiredString(record, "mode");
  if (mode !== "copy" && mode !== "adapt") {
    throw new Error("Product precedent source file mode must be copy or adapt.");
  }
  return {
    sourcePath: repositoryRelativePath(record, "sourcePath", false),
    targetPath: repositoryRelativePath(record, "targetPath", false),
    mode,
  };
}

function decodeDeviation(value: unknown): ProductPrecedentDeviation {
  const record = strictRecord(value, "Product precedent deviation", [
    "acceptanceGateId",
    "description",
  ]);
  return {
    acceptanceGateId: requiredString(record, "acceptanceGateId"),
    description: requiredString(record, "description"),
  };
}

function permitsSourceReuse(license: string): boolean {
  const normalized = license.trim().toUpperCase();
  return new Set([
    "MIT",
    "ISC",
    "APACHE-2.0",
    "BSD-2-CLAUSE",
    "BSD-3-CLAUSE",
  ]).has(normalized);
}

function repositoryRelativePath(
  value: Record<string, unknown>,
  key: string,
  allowDot: boolean,
): string {
  const candidate = requiredString(value, key);
  if (
    candidate.includes("\\") ||
    candidate.includes(":") ||
    candidate.startsWith("/") ||
    /^[A-Za-z]:/u.test(candidate) ||
    candidate === ".." ||
    candidate.startsWith("../") ||
    candidate.includes("/../") ||
    candidate.includes("*") ||
    (!allowDot && candidate === ".")
  ) {
    throw new Error(`${key} must be a safe repository-relative path using forward slashes.`);
  }
  return candidate.replace(/^\.\//u, "").replace(/\/+$/u, "");
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

function requiredStringArray(value: Record<string, unknown>, key: string): readonly string[] {
  const candidate = value[key];
  if (
    !Array.isArray(candidate) ||
    candidate.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw new Error(`${key} must be an array of non-empty strings.`);
  }
  return candidate;
}

function uniqueStrings(values: readonly string[], label: string): readonly string[] {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return values;
}
