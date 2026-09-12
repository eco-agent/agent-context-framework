import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_CAPSULE_FORMAT,
  CONTEXT_CAPSULE_LOCK_SCHEMA_VERSION,
  CONTEXT_CAPSULE_PATH,
  decodeContextCapsuleLock,
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

test("capsule lock v3 is separate from registry, config, and installation lock v2", () => {
  const lock = {
    schemaVersion: CONTEXT_CAPSULE_LOCK_SCHEMA_VERSION,
    registryRevision: "0.14.0",
    frameworkRevision: "b".repeat(40),
    capsule: {
      format: CONTEXT_CAPSULE_FORMAT,
      path: CONTEXT_CAPSULE_PATH,
      sha256: hash,
      treeSha256: "b".repeat(64),
      compressedBytes: 65_891,
      expandedBytes: 259_980,
      entryCount: 79,
    },
    components: {
      direct: ["tools"],
      resolved: [
        { name: "base", revision: componentRevision },
        { name: "tools", revision: `sha256:${"b".repeat(64)}` },
      ],
    },
    activation: [
      { identity: "git-attributes", targetPath: ".gitattributes", installedSha256: hash },
      { identity: "instructions", targetPath: "AGENTS.md", installedSha256: "b".repeat(64) },
    ],
    materialization: {
      capsuleSha256: hash,
      treeSha256: "b".repeat(64),
      files: [{
        identity: "file:.codex/skills/tools/SKILL.md",
        targetPath: `.agents/skills/acf--tools--${"c".repeat(64)}/SKILL.md`,
        installedSha256: "c".repeat(64),
      }],
    },
  } as const;
  assert.deepEqual(decodeContextCapsuleLock(lock), lock);
  assert.equal(
    decodeContextCapsuleLock({
      ...lock,
      materialization: {
        ...lock.materialization,
        files: [{
          ...lock.materialization.files[0],
          targetPath: `.codex/acf/runtime-source/materialized/${"d".repeat(64)}/repo-context.mjs`,
        }],
      },
    }).materialization.files[0]?.targetPath.startsWith(".codex/acf/runtime-source/materialized/"),
    true,
  );
  assert.throws(
    () => decodeContextInstallationLock(lock),
    /unknown fields|schemaVersion must be 2/u,
  );
  assert.throws(
    () => decodeContextRegistry({ ...registryValue, schemaVersion: 3 }),
    /schemaVersion must be 2/u,
  );
  assert.throws(
    () => decodeContextProjectConfig({ schemaVersion: 3, adapter: "codex", components: ["core"] }),
    /schemaVersion must be 2/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({ ...lock, frameworkRevision: "short" }),
    /full lowercase Git revision/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      capsule: { ...lock.capsule, path: "capsule.acf" },
    }),
    /path must be .agent-context\/capsule.acf/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      activation: [...lock.activation].reverse(),
    }),
    /activation identities must be sorted/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      capsule: { ...lock.capsule, compressedBytes: -1 },
    }),
    /compressedBytes must be a nonnegative safe integer/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      components: { ...lock.components, direct: ["missing"] },
    }),
    /direct component missing is absent from the resolved closure/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      materialization: {
        ...lock.materialization,
        files: [{ ...lock.materialization.files[0], targetPath: "project-owned.txt" }],
      },
    }),
    /target must be below .agents\/skills or .agent-context\/runtime\/materialized/u,
  );
  assert.throws(
    () => decodeContextCapsuleLock({
      ...lock,
      materialization: {
        ...lock.materialization,
        files: [
          lock.materialization.files[0],
          { ...lock.materialization.files[0], identity: "later-identity" },
        ],
      },
    }),
    /duplicate .agents\/skills/u,
  );
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
          operation: "json-array-values",
          sourcePath: "formatter.json",
          sourceSha256: hash,
          targetPath: ".oxfmtrc.json",
          ownedValues: [
            { arrayPointer: "/ignorePatterns", value: ".agent-context/**" },
          ],
        },
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
          targetPath: ".codex/acf/policy.json",
        },
      ],
    }],
  });
  assert.deepEqual(
    registry.components[0]?.artifacts.map((artifact) => artifact.operation),
    ["json-array-values", "json-array-items", "toml-members", "seed-file"],
  );
});
