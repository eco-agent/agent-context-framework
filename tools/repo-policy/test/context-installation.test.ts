import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeContextInstallationLock,
  decodeContextProjectConfig,
  decodeContextRegistry,
  resolveContextComponents,
} from "../src/context-installation.js";

const hash = "a".repeat(64);
const componentRevision = `sha256:${hash}`;
const registryValue = {
  schemaVersion: 2,
  revision: "0.2.0",
  decisionPath: "registry/decisions/0.2.0.md",
  components: [
    {
      name: "base",
      revision: componentRevision,
      dependencies: [],
      capabilities: [],
      licenses: [{
        kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE", noticeSha256: hash,
      }],
      artifacts: [{
        operation: "text-section",
        sourcePath: "registry/base.md",
        sourceSha256: hash,
        targetPath: "AGENTS.md",
        sectionId: "base",
        markerStyle: "markdown",
      }],
    },
    {
      name: "tools",
      revision: componentRevision,
      dependencies: ["base"],
      capabilities: [{ kind: "runtime", name: "network", requirement: "required" }],
      licenses: [{
        kind: "project", spdx: "MIT", sourcePath: "LICENSE", noticePath: "LICENSE", noticeSha256: hash,
      }],
      artifacts: [{
        operation: "file",
        sourcePath: "registry/tool.md",
        sourceSha256: hash,
        targetPath: ".codex/tool.md",
        mediaType: "text/markdown",
      }],
    },
  ],
} as const;

test("v2 registry decoding is exact and dependency resolution is deterministic", () => {
  const registry = decodeContextRegistry(registryValue);
  assert.deepEqual(
    resolveContextComponents(registry, ["tools"]).map((component) => component.name),
    ["base", "tools"],
  );
  assert.throws(() => decodeContextRegistry({ ...registryValue, schemaVersion: 1 }), /schemaVersion must be 2/u);
  assert.throws(() => decodeContextRegistry({ ...registryValue, schemaVersion: 3 }), /schemaVersion must be 2/u);
  assert.throws(() => decodeContextRegistry({ ...registryValue, inferredDefaults: true }), /unknown fields/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{ ...registryValue.components[0], revision: "0.5.2" }],
  }), /content-addressed SHA-256 identifier/u);
  const componentWithoutRevision = Object.fromEntries(
    Object.entries(registryValue.components[0]).filter(([key]) => key !== "revision"),
  );
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [componentWithoutRevision],
  }), /content-addressed SHA-256 identifier/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...registryValue.components[0],
      licenses: [{ kind: "project" }],
    }],
  }), /unknown fields|spdx must be a non-empty string/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...registryValue.components[0],
      artifacts: [{ ...registryValue.components[0].artifacts[0], sourcePath: "../outside.md" }],
    }],
  }), /normalized portable repository-relative path/u);
});

test("registry resolution rejects unknown dependencies and cycles", () => {
  const unknown = decodeContextRegistry({
    ...registryValue,
    components: [{ ...registryValue.components[0], dependencies: ["missing"] }],
  });
  assert.throws(() => resolveContextComponents(unknown, ["base"]), /depends on unknown component missing/u);

  const cyclic = decodeContextRegistry({
    ...registryValue,
    components: [
      { ...registryValue.components[0], dependencies: ["tools"] },
      registryValue.components[1],
    ],
  });
  assert.throws(() => resolveContextComponents(cyclic, ["tools"]), /tools -> base -> tools/u);
});

test("project config is strict v2 and rejects duplicate components", () => {
  const config = { schemaVersion: 2, adapter: "codex", components: ["core"] } as const;
  assert.deepEqual(decodeContextProjectConfig(config), config);
  assert.throws(() => decodeContextProjectConfig({ ...config, schemaVersion: 1 }), /schemaVersion must be 2/u);
  assert.throws(() => decodeContextProjectConfig({ ...config, options: {} }), /unknown fields/u);
  assert.throws(() => decodeContextProjectConfig({ ...config, components: ["core", "core"] }), /duplicate core/u);
  assert.throws(() => decodeContextProjectConfig({ ...config, adapter: "generic" }), /adapter must be codex/u);
});

test("installation lock validates exact provenance records", () => {
  const artifact = registryValue.components[0].artifacts[0];
  const lock = {
    schemaVersion: 2,
    registryRevision: "0.2.0",
    components: ["base"],
    artifacts: [{ ...artifact, component: "base", installedSha256: hash }],
  } as const;
  assert.deepEqual(decodeContextInstallationLock(lock), lock);
  assert.throws(() => decodeContextInstallationLock({
    ...lock,
    artifacts: [{ ...lock.artifacts[0], installedSha256: "short" }],
  }), /lowercase SHA-256 hash/u);
  assert.throws(() => decodeContextInstallationLock({
    ...lock,
    artifacts: [...lock.artifacts, lock.artifacts[0]],
  }), /duplicate text-section:AGENTS.md:base/u);
});

test("format-specific ownership rejects unsorted or invalid paths", () => {
  const component = registryValue.components[0];
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...component,
      artifacts: [{
        operation: "json-members",
        sourcePath: "source.json",
        sourceSha256: hash,
        targetPath: "package.json",
        ownedPointers: ["/scripts/z", "/scripts/a"],
      }],
    }],
  }), /must be sorted/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...component,
      artifacts: [{
        operation: "toml-tables",
        sourcePath: "source.toml",
        sourceSha256: hash,
        targetPath: ".codex/config.toml",
        ownedTables: ["bad table"],
        sectionId: "config",
      }],
    }],
  }), /dotted bare-key path/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...component,
      artifacts: [{
        operation: "toml-members",
        sourcePath: "source.toml",
        sourceSha256: hash,
        targetPath: ".codex/config.toml",
        ownedMembers: ["agents"],
      }],
    }],
  }), /below the root/u);
  assert.throws(() => decodeContextRegistry({
    ...registryValue,
    components: [{
      ...component,
      artifacts: [{
        operation: "json-array-items",
        sourcePath: "source.json",
        sourceSha256: hash,
        targetPath: ".codex/hooks.json",
        ownedItems: [
          { arrayPointer: "/hooks/SessionStart", identityPointer: "/matcher", identity: "^compact$" },
          { arrayPointer: "/hooks/PreToolUse", identityPointer: "/matcher", identity: "^ApplyPatch$" },
        ],
      }],
    }],
  }), /must be sorted/u);
});

test("member and identified-array-item ownership decode as closed artifact variants", () => {
  const component = registryValue.components[0];
  const registry = decodeContextRegistry({
    ...registryValue,
    components: [{
      ...component,
      artifacts: [
        {
          operation: "json-array-items",
          sourcePath: "source.json",
          sourceSha256: hash,
          targetPath: ".codex/hooks.json",
          ownedItems: [
            { arrayPointer: "/hooks/PreToolUse", identityPointer: "/matcher", identity: "^ApplyPatch$" },
            { arrayPointer: "/hooks/SessionStart", identityPointer: "/matcher", identity: "^compact$" },
          ],
        },
        {
          operation: "toml-members",
          sourcePath: "source.toml",
          sourceSha256: hash,
          targetPath: ".codex/config.toml",
          ownedMembers: ["agents.max_concurrent_threads_per_session", "agents.worker"],
        },
        {
          operation: "seed-file",
          sourcePath: "policy.json",
          sourceSha256: hash,
          targetPath: ".agent-context/policy.json",
        },
      ],
    }],
  });
  assert.deepEqual(
    registry.components[0]?.artifacts.map((artifact) => artifact.operation),
    ["json-array-items", "toml-members", "seed-file"],
  );
});
