import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  artifactHash,
  type ArtifactHash,
  type ArtifactReference,
  type ArtifactWrite,
  type ObjectiveArtifactStore,
  type StoredArtifact,
} from "@agent-context/objective-kernel";

interface ArtifactMetadata {
  readonly schemaVersion: 1;
  readonly hash: ArtifactHash;
  readonly mediaType: string;
  readonly bytes: number;
}

export class ArtifactIntegrityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ArtifactIntegrityError";
  }
}

export class ArtifactMetadataConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ArtifactMetadataConflictError";
  }
}

export class FilesystemArtifactStore implements ObjectiveArtifactStore {
  readonly #root: string;

  public constructor(root: string) {
    this.#root = resolve(root);
  }

  public async put(artifact: ArtifactWrite): Promise<ArtifactReference> {
    validateArtifactWrite(artifact);
    const digest = createHash("sha256").update(artifact.bytes).digest("hex");
    const hash = artifactHash(`sha256:${digest}`);
    const blobPath = this.#blobPath(hash);
    const metadataPath = this.#metadataPath(hash);
    await mkdir(dirname(blobPath), { recursive: true });
    await mkdir(dirname(metadataPath), { recursive: true });

    await installExclusive(blobPath, artifact.bytes);
    const installedBytes = await readFile(blobPath);
    verifyBytes(hash, installedBytes);
    if (installedBytes.byteLength !== artifact.bytes.byteLength) {
      throw new ArtifactIntegrityError(`Artifact ${hash} has an unexpected byte length.`);
    }

    const metadata: ArtifactMetadata = {
      schemaVersion: 1,
      hash,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes.byteLength,
    };
    await installExclusive(metadataPath, Buffer.from(`${JSON.stringify(metadata)}\n`, "utf8"));
    const installedMetadata = decodeMetadata(await readFile(metadataPath, "utf8"), metadataPath);
    if (
      installedMetadata.hash !== metadata.hash ||
      installedMetadata.bytes !== metadata.bytes ||
      installedMetadata.mediaType !== metadata.mediaType
    ) {
      throw new ArtifactMetadataConflictError(
        `Artifact ${hash} already exists with different identity metadata.`,
      );
    }
    return {
      hash,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes.byteLength,
      label: artifact.label,
    };
  }

  public async get(hash: ArtifactHash): Promise<StoredArtifact | undefined> {
    const blobPath = this.#blobPath(hash);
    const metadataPath = this.#metadataPath(hash);
    let bytes: Buffer;
    let metadataText: string;
    try {
      [bytes, metadataText] = await Promise.all([
        readFile(blobPath),
        readFile(metadataPath, "utf8"),
      ]);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
    verifyBytes(hash, bytes);
    const metadata = decodeMetadata(metadataText, metadataPath);
    if (metadata.hash !== hash || metadata.bytes !== bytes.byteLength) {
      throw new ArtifactIntegrityError(`Artifact ${hash} metadata does not match its content.`);
    }
    return { hash, mediaType: metadata.mediaType, bytes: new Uint8Array(bytes) };
  }

  public async has(hash: ArtifactHash): Promise<boolean> {
    try {
      await Promise.all([
        access(this.#blobPath(hash), constants.R_OK),
        access(this.#metadataPath(hash), constants.R_OK),
      ]);
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  #blobPath(hash: ArtifactHash): string {
    const hex = hash.slice("sha256:".length);
    return join(this.#root, "blobs", "sha256", hex.slice(0, 2), hex);
  }

  #metadataPath(hash: ArtifactHash): string {
    const hex = hash.slice("sha256:".length);
    return join(this.#root, "metadata", "sha256", hex.slice(0, 2), `${hex}.json`);
  }
}

async function installExclusive(path: string, bytes: Uint8Array): Promise<void> {
  try {
    await access(path, constants.F_OK);
    return;
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }
}

function validateArtifactWrite(artifact: ArtifactWrite): void {
  if (!(artifact.bytes instanceof Uint8Array)) {
    throw new TypeError("Artifact bytes must be a Uint8Array.");
  }
  if (artifact.mediaType.length < 1 || artifact.mediaType.length > 200) {
    throw new TypeError("Artifact mediaType must contain 1 to 200 characters.");
  }
  if (artifact.label.length < 1 || artifact.label.length > 500) {
    throw new TypeError("Artifact label must contain 1 to 500 characters.");
  }
}

function verifyBytes(hash: ArtifactHash, bytes: Uint8Array): void {
  const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== hash) {
    throw new ArtifactIntegrityError(`Artifact ${hash} failed content hash verification.`);
  }
}

function decodeMetadata(input: string, path: string): ArtifactMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (error) {
    throw new ArtifactIntegrityError(`Artifact metadata is invalid JSON: ${path}.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ArtifactIntegrityError(`Artifact metadata is not an object: ${path}.`);
  }
  const value = parsed as Record<string, unknown>;
  if (
    Object.keys(value).length !== 4 ||
    value.schemaVersion !== 1 ||
    typeof value.hash !== "string" ||
    typeof value.mediaType !== "string" ||
    value.mediaType.length < 1 || value.mediaType.length > 200 ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) < 0
  ) {
    throw new ArtifactIntegrityError(`Artifact metadata shape is invalid: ${path}.`);
  }
  try {
    return {
      schemaVersion: 1,
      hash: artifactHash(value.hash),
      mediaType: value.mediaType,
      bytes: value.bytes as number,
    };
  } catch {
    throw new ArtifactIntegrityError(`Artifact metadata identity is invalid: ${path}.`);
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
