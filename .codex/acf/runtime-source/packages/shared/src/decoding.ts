export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}.`);
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

export function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

export function portableRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.split("/").some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  return value;
}

export function sha256Digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}
