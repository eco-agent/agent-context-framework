import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJson, type JsonValue } from "@agent-context/codex-workflow-runtime";

export type ContentArtifactReference = `sha256:${string}`;

export interface StoredContentArtifact {
  readonly reference: ContentArtifactReference;
  readonly bytes: Uint8Array;
}

export class ContentAddressedArtifactStore {
  public constructor(private readonly directory: string) {}

  public async store(value: JsonValue): Promise<ContentArtifactReference> {
    const bytes = Buffer.from(canonicalJson(toJson(value)), "utf8");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const reference = `sha256:${digest}` as ContentArtifactReference;
    const target = this.pathFor(reference);
    await mkdir(this.directory, { recursive: true });
    try {
      const existing = await readFile(target);
      if (!existing.equals(bytes)) {
        throw new Error(`Stored artifact ${reference} differs from its content hash`);
      }
      return reference;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }

    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      try {
        await rename(temporary, target);
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const existing = await readFile(target);
        if (!existing.equals(bytes)) {
          throw new Error(`Stored artifact ${reference} differs from its content hash`);
        }
      }
    } finally {
      await rm(temporary, { force: true });
    }
    return reference;
  }

  public async read(reference: string): Promise<StoredContentArtifact> {
    const decoded = decodeContentArtifactReference(reference);
    const bytes = await readFile(this.pathFor(decoded));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (`sha256:${actual}` !== decoded) {
      throw new Error(`Stored artifact ${decoded} failed content verification`);
    }
    return { reference: decoded, bytes };
  }

  private pathFor(reference: ContentArtifactReference): string {
    return path.join(this.directory, `${reference.slice("sha256:".length)}.json`);
  }
}

export function decodeContentArtifactReference(value: unknown): ContentArtifactReference {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Content artifact reference must be a lowercase SHA-256 reference");
  }
  return value as ContentArtifactReference;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Artifact JSON contains an unsupported value");
  return encoded;
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isCode(error, "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return isCode(error, "EEXIST") || isCode(error, "EPERM");
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
