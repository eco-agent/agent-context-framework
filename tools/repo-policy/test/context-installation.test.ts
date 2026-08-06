import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeContextInstallationLock,
  decodeContextProjectConfig,
  decodeContextRegistry,
  resolveContextComponents,
} from "../src/context-installation.js";

const registryValue = {
  schemaVersion: 1,
  revision: "0.1.0",
  components: [
    {
      name: "base",
      dependencies: [],
      artifacts: [
        {
          ownership: "managed-section",
          sourcePath: "registry/base.md",
          targetPath: "AGENTS.md",
          sectionId: "base",
        },
      ],
    },
    {
      name: "tools",
      dependencies: ["base"],
      artifacts: [
        {
          ownership: "managed-file",
          sourcePath: "registry/tool.md",
          targetPath: ".codex/tool.md",
        },
      ],
    },
  ],
} as const;

test("context registry decoding is exact and dependency resolution is deterministic", () => {
  const registry = decodeContextRegistry(registryValue);
  assert.deepEqual(
    resolveContextComponents(registry, ["tools"]).map((component) => component.name),
    ["base", "tools"],
  );
  assert.throws(
    () => decodeContextRegistry({ ...registryValue, inferredDefaults: true }),
    /unknown fields: inferredDefaults/u,
  );
  assert.throws(
    () => decodeContextRegistry({
      ...registryValue,
      components: [{
        ...registryValue.components[0],
        artifacts: [{
          ownership: "managed-file",
          sourcePath: "../outside.md",
          targetPath: "AGENTS.md",
        }],
      }],
    }),
    /normalized portable repository-relative path/u,
  );
});

test("context registry resolution rejects unknown dependencies and cycles", () => {
  const unknown = decodeContextRegistry({
    ...registryValue,
    components: [{ ...registryValue.components[0], dependencies: ["missing"] }],
  });
  assert.throws(
    () => resolveContextComponents(unknown, ["base"]),
    /depends on unknown component missing/u,
  );

  const cyclic = decodeContextRegistry({
    ...registryValue,
    components: [
      { ...registryValue.components[0], dependencies: ["tools"] },
      registryValue.components[1],
    ],
  });
  assert.throws(
    () => resolveContextComponents(cyclic, ["tools"]),
    /tools -> base -> tools/u,
  );
});

test("project config rejects optional bags, duplicate components, and unknown adapters", () => {
  assert.deepEqual(
    decodeContextProjectConfig({ schemaVersion: 1, adapter: "codex", components: ["core"] }),
    { schemaVersion: 1, adapter: "codex", components: ["core"] },
  );
  assert.throws(
    () => decodeContextProjectConfig({
      schemaVersion: 1,
      adapter: "codex",
      components: ["core"],
      options: {},
    }),
    /unknown fields: options/u,
  );
  assert.throws(
    () => decodeContextProjectConfig({
      schemaVersion: 1,
      adapter: "codex",
      components: ["core", "core"],
    }),
    /duplicate core/u,
  );
  assert.throws(
    () => decodeContextProjectConfig({ schemaVersion: 1, adapter: "generic", components: ["core"] }),
    /adapter must be codex/u,
  );
});

test("installation lock validates exact ownership records and hashes", () => {
  const lock = {
    schemaVersion: 1,
    registryRevision: "0.1.0",
    components: ["core"],
    artifacts: [{
      ownership: "managed-section",
      sourcePath: "registry/core.md",
      targetPath: "AGENTS.md",
      sectionId: "core",
      sha256: "a".repeat(64),
    }],
  };
  assert.deepEqual(decodeContextInstallationLock(lock), lock);
  assert.throws(
    () => decodeContextInstallationLock({
      ...lock,
      artifacts: [{ ...lock.artifacts[0], sha256: "short" }],
    }),
    /lowercase SHA-256 hash/u,
  );
  assert.throws(
    () => decodeContextInstallationLock({
      ...lock,
      artifacts: [...lock.artifacts, lock.artifacts[0]],
    }),
    /duplicate section:AGENTS.md:core/u,
  );
});
