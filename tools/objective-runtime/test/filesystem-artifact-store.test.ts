import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ArtifactIntegrityError,
  ArtifactMetadataConflictError,
  FilesystemArtifactStore,
} from "../src/filesystem-artifact-store.js";

test("filesystem artifacts are content-addressed, idempotent, and verified on read", async () => {
  const root = await mkdtemp(join(tmpdir(), "objective-artifacts-"));
  try {
    const store = new FilesystemArtifactStore(root);
    const bytes = new TextEncoder().encode("durable evidence");
    const first = await store.put({ bytes, mediaType: "text/plain", label: "proof" });
    const second = await store.put({ bytes, mediaType: "text/plain", label: "another label" });
    assert.equal(second.hash, first.hash);
    assert.equal(second.label, "another label");
    assert.equal(await store.has(first.hash), true);
    const loaded = await store.get(first.hash);
    assert.equal(loaded?.mediaType, "text/plain");
    assert.deepEqual(loaded?.bytes, bytes);

    await assert.rejects(
      store.put({ bytes, mediaType: "application/octet-stream", label: "conflict" }),
      ArtifactMetadataConflictError,
    );

    const hex = first.hash.slice("sha256:".length);
    const blobPath = join(root, "blobs", "sha256", hex.slice(0, 2), hex);
    await writeFile(blobPath, "tampered", "utf8");
    await assert.rejects(store.get(first.hash), ArtifactIntegrityError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing artifact identity returns undefined", async () => {
  const root = await mkdtemp(join(tmpdir(), "objective-artifacts-missing-"));
  try {
    const store = new FilesystemArtifactStore(root);
    const reference = await store.put({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "application/octet-stream",
      label: "binary",
    });
    const hex = reference.hash.slice("sha256:".length);
    await rm(join(root, "metadata", "sha256", hex.slice(0, 2), `${hex}.json`));
    assert.equal(await store.get(reference.hash), undefined);
    assert.equal(await store.has(reference.hash), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
