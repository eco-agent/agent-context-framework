import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeRepositoryPolicyConfiguration,
  decodeRepositoryPolicyInvariantManifest,
  decodeContextRegistry,
  discoverWorkspaceUnits,
  doctorRepositoryPolicy,
  inspectRepository,
  resolveContextComponents,
  verifyRepositoryPolicy,
} from "../src/index.js";

test("policy registry decoding remains strict and resolution is deterministic", () => {
  const registry = decodeContextRegistry({
    schemaVersion: 2,
    revision: "0.1.0",
    decisionPath: "decisions/0.1.0.md",
    components: [
      {
        name: "source",
        revision: `sha256:${"b".repeat(64)}`,
        dependencies: [],
        capabilities: [],
        licenses: [{
          kind: "project",
          spdx: "MIT",
          sourcePath: "LICENSE",
          noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [
          {
            operation: "file",
            sourcePath: "source.md",
            sourceSha256: "a".repeat(64),
            targetPath: "target.md",
            mediaType: "text/markdown",
          },
        ],
      },
      {
        name: "bundle",
        revision: `sha256:${"c".repeat(64)}`,
        dependencies: ["source"],
        capabilities: [],
        licenses: [{
          kind: "project",
          spdx: "MIT",
          sourcePath: "LICENSE",
          noticePath: "LICENSE",
          noticeSha256: "a".repeat(64),
        }],
        artifacts: [],
      },
    ],
  });
  assert.deepEqual(
    resolveContextComponents(registry, ["bundle"]).map((component) => component.name),
    ["source", "bundle"],
  );
  assert.throws(
    () => decodeContextRegistry({ ...registry, command: "pnpm install" }),
    /unknown fields: command/u,
  );
});

test("workspace inspection accepts a non-Node repository", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-non-node-"));
  try {
    await writeFile(path.join(root, "README.md"), "# fixture\n", "utf8");
    await mkdir(path.join(root, ".agent-context", "runtime"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "runtime", "package.json"),
      '{"name":"@agent-context/runtime-workspace","private":true}\n',
      "utf8",
    );
    assert.deepEqual(await discoverWorkspaceUnits(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository policy excludes partial decisions and invalid profile references", () => {
  assert.deepEqual(decodeRepositoryPolicyConfiguration({
    schemaVersion: 1,
    state: "unconfigured",
  }), {
    schemaVersion: 1,
    state: "unconfigured",
  });
  assert.throws(
    () => decodeRepositoryPolicyConfiguration({
      schemaVersion: 1,
      state: "unconfigured",
      repository: {},
    }),
    /unknown fields: repository/u,
  );
  assert.throws(
    () => decodeRepositoryPolicyConfiguration({
      ...configuredPolicy(),
      profiles: [{ id: "default", commands: ["missing"] }],
    }),
    /references unknown command missing/u,
  );
  assert.throws(
    () => decodeRepositoryPolicyInvariantManifest({
      schemaVersion: 1,
      invariants: ["explicit-project-facts"],
    }),
    /must be exactly/u,
  );
});

test("policy doctor requires explicit configuration and validates declared paths", async () => {
  const root = await createPolicyFixture();
  try {
    await writeJson(path.join(root, ".agent-context", "policy.json"), {
      schemaVersion: 1,
      state: "unconfigured",
    });
    assert.deepEqual(
      await doctorRepositoryPolicy(root),
      {
        operation: "doctor",
        ok: false,
        status: "configuration-required",
        diagnostics: [
          ".agent-context/policy.json is unconfigured; record explicit repository facts and verification profiles.",
        ],
      },
    );

    await writeJson(path.join(root, ".agent-context", "policy.json"), configuredPolicy());
    const missingDocs = await doctorRepositoryPolicy(root);
    assert.equal(missingDocs.status, "invalid");
    assert.match(missingDocs.diagnostics[0] ?? "", /documentation root does not exist/u);

    await mkdir(path.join(root, "docs"));
    const ready = await doctorRepositoryPolicy(root);
    assert.equal(ready.ok, true);
    assert.equal(ready.status, "ready");

    await writeJson(
      path.join(root, ".agent-context", "policy.json"),
      configuredPolicy("process", ["docs/architecture.md"]),
    );
    const missingContract = await doctorRepositoryPolicy(root);
    assert.equal(missingContract.status, "invalid");
    assert.match(missingContract.diagnostics[0] ?? "", /project contract does not exist/u);

    await writeFile(path.join(root, "docs", "architecture.md"), "# Architecture\n", "utf8");
    const contractReady = await doctorRepositoryPolicy(root);
    assert.equal(contractReady.ok, true);
    assert.equal(contractReady.status, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("policy verification executes only the selected tokenized profile", async () => {
  const root = await createPolicyFixture();
  try {
    await mkdir(path.join(root, "docs"));
    await writeJson(path.join(root, ".agent-context", "policy.json"), configuredPolicy());
    const result = await verifyRepositoryPolicy(root, null);
    assert.equal(result.status, "completed");
    assert.equal(result.profile, "default");
    assert.equal(result.ok, true);
    assert.deepEqual(result.commands.map((command) => [command.id, command.status]), [
      ["node-check", "passed"],
    ]);

    await writeJson(path.join(root, "package.json"), {
      scripts: { "policy-check": "node -e \"process.exit(0)\"" },
    });
    await writeJson(
      path.join(root, ".agent-context", "policy.json"),
      configuredPolicy("package-script"),
    );
    const packageScript = await verifyRepositoryPolicy(root, null);
    assert.equal(packageScript.ok, true);
    assert.deepEqual(packageScript.commands.map((command) => [command.id, command.status]), [
      ["node-check", "passed"],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository inspection reports observations without creating policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-policy-inspect-"));
  try {
    await writeFile(path.join(root, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");
    await mkdir(path.join(root, "docs"));
    const result = await inspectRepository(root);
    assert.deepEqual(result.observations.languageMarkers, ["pyproject.toml"]);
    assert.equal(result.observations.rootEntries.includes("docs/"), true);
    assert.equal(result.observations.packageManifests.length, 0);
    assert.equal(await fileExists(path.join(root, ".agent-context", "policy.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository inspection covers the declared project-shape matrix without inference or writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-policy-matrix-"));
  const fixtures = [
    {
      name: "minimal-typescript",
      files: [["package.json", "{}\n"], ["tsconfig.json", "{}\n"]],
      manifests: ["package.json"],
      markers: ["package.json", "tsconfig.json"],
    },
    {
      name: "non-node",
      files: [["pyproject.toml", "[project]\nname = \"fixture\"\n"]],
      manifests: [],
      markers: ["pyproject.toml"],
    },
    {
      name: "codex-configured",
      files: [[".codex/config.toml", "model = \"explicit\"\n"], [".codex/hooks.json", "{}\n"]],
      manifests: [],
      markers: [],
    },
    {
      name: "monorepo",
      files: [["package.json", "{}\n"], ["packages/app/package.json", "{}\n"]],
      manifests: ["package.json", "packages/app/package.json"],
      markers: ["package.json"],
    },
    {
      name: "single-package",
      files: [["package.json", "{}\n"]],
      manifests: ["package.json"],
      markers: ["package.json"],
    },
    {
      name: "no-frontend",
      files: [["README.md", "No frontend.\n"]],
      manifests: [],
      markers: [],
    },
    {
      name: "frontend-without-tailwind",
      files: [["package.json", '{"dependencies":{"react":"19.0.0"}}\n']],
      manifests: ["package.json"],
      markers: ["package.json"],
    },
    {
      name: "frontend-with-tailwind",
      files: [["package.json", '{"dependencies":{"react":"19.0.0","tailwindcss":"4.0.0"}}\n']],
      manifests: ["package.json"],
      markers: ["package.json"],
    },
  ] as const;
  try {
    for (const fixture of fixtures) {
      const fixtureRoot = path.join(root, fixture.name);
      await mkdir(fixtureRoot, { recursive: true });
      for (const [relativePath, content] of fixture.files) {
        const target = path.join(fixtureRoot, ...relativePath.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
      }
      const inspection = await inspectRepository(fixtureRoot);
      assert.deepEqual(inspection.observations.packageManifests, fixture.manifests);
      assert.deepEqual(inspection.observations.languageMarkers, fixture.markers);
      assert.equal(
        inspection.observations.rootEntries.includes(".codex/"),
        fixture.name === "codex-configured",
      );
      assert.equal(await fileExists(path.join(fixtureRoot, ".agent-context", "policy.json")), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function configuredPolicy(
  kind: "process" | "package-script" = "process",
  projectContracts: readonly string[] = [],
): object {
  return {
    schemaVersion: 1,
    state: "configured",
    repository: {
      repositoryType: "framework",
      languages: ["typescript"],
      documentationRoots: ["docs"],
      projectContracts,
      packageManager: { state: "declared", name: "pnpm", version: "10.22.0" },
      layout: "monorepo",
      frontend: false,
    },
    commands: [kind === "process"
      ? {
          id: "node-check",
          kind,
          executable: process.execPath,
          arguments: ["-e", "process.exit(0)"],
          timeoutMs: 5_000,
        }
      : {
          id: "node-check",
          kind,
          script: "policy-check",
          arguments: [],
          timeoutMs: 30_000,
        }],
    profiles: [{ id: "default", commands: ["node-check"] }],
    defaultProfile: "default",
  };
}

async function createPolicyFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-policy-"));
  await mkdir(path.join(root, ".agent-context"), { recursive: true });
  await writeJson(path.join(root, ".agent-context", "config.json"), {
    schemaVersion: 2,
    adapter: "codex",
    components: ["core", "repository-policy"],
  });
  await writeJson(path.join(root, ".agent-context", "lock.json"), {
    schemaVersion: 2,
    registryRevision: "0.4.0",
    components: ["core", "runtime-base", "repository-policy"],
    artifacts: [],
  });
  await writeJson(path.join(root, ".agent-context", "policy-invariants.json"), {
    schemaVersion: 1,
    invariants: [
      "explicit-project-facts",
      "declared-project-contracts",
      "explicit-verification-profiles",
      "observation-only-inspection",
      "tokenized-command-execution",
    ],
  });
  return root;
}

async function writeJson(candidate: string, value: unknown): Promise<void> {
  await writeFile(candidate, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
