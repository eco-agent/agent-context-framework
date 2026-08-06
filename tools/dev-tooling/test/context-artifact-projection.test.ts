import assert from "node:assert/strict";
import test from "node:test";

import type { ContextRegistryArtifact } from "@agent-context/repo-policy";

import {
  createArtifactProjection,
  createArtifactRemovalProjection,
} from "../src/context-artifact-projection.js";

const hash = "a".repeat(64);

test("text sections preserve surrounding prose and strip markers when preserving local content", () => {
  const projection = createArtifactProjection(artifact({
    operation: "text-section",
    sectionId: "rules",
    markerStyle: "markdown",
  }), "## Rules\n\nCanonical.\n");
  const installed = projection.install("Local prefix.\n");
  assert.match(installed, /^Local prefix\.\n\n<!-- agent-context:rules:start -->/u);
  assert.equal(projection.read(installed).state, "present");
  assert.equal(projection.remove(installed, true), "Local prefix.\n\n## Rules\n\nCanonical.\n");
  assert.equal(projection.remove(installed, false), "Local prefix.\n");
  assert.equal(projection.read("<!-- agent-context:rules:start -->\nbroken\n").state, "malformed");
});

test("JSON member ownership preserves unrelated members and detects partial scopes", () => {
  const projection = createArtifactProjection(artifact({
    operation: "json-members",
    ownedPointers: ["/scripts/check", "/tooling/enabled"],
  }), `${JSON.stringify({ scripts: { check: "verify" }, tooling: { enabled: true } }, null, 2)}\n`);
  const installed = projection.install(`${JSON.stringify({ name: "project", scripts: { test: "node --test" } }, null, 2)}\n`);
  const value = JSON.parse(installed) as { name: string; scripts: Record<string, string>; tooling: { enabled: boolean } };
  assert.equal(value.name, "project");
  assert.equal(value.scripts.test, "node --test");
  assert.equal(value.scripts.check, "verify");
  assert.equal(value.tooling.enabled, true);
  assert.equal(projection.read(installed).state, "present");
  assert.equal(projection.read('{"scripts":{"check":"verify"}}\n').state, "malformed");
  const removed = JSON.parse(projection.remove(installed, false) ?? "") as Record<string, unknown>;
  assert.deepEqual(removed, { name: "project", scripts: { test: "node --test" }, tooling: {} });
});

test("TOML table ownership installs only declared tables, preserves project tables, and rejects collisions", () => {
  const projection = createArtifactProjection(artifact({
    operation: "toml-tables",
    ownedTables: ["mcp_servers.context"],
    sectionId: "context-runtime",
  }), "[mcp_servers.context]\ncommand = \"node\"\n\n[mcp_servers.not_owned]\ncommand = \"other\"\n");
  const installed = projection.install("[project]\nname = \"fixture\"\n");
  assert.match(installed, /^\[project\]/u);
  assert.match(installed, /# agent-context:context-runtime:start\n\[mcp_servers\.context\]/u);
  assert.doesNotMatch(installed, /not_owned/u);
  assert.equal(projection.read(installed).state, "present");
  assert.throws(
    () => projection.install("[mcp_servers.context]\ncommand = \"custom\"\n"),
    /already contains owned table/u,
  );
  assert.equal(projection.remove(installed, false), "[project]\nname = \"fixture\"\n");
});

test("ownership-only projections read and remove structured artifacts without source bytes", () => {
  const json = createArtifactRemovalProjection(artifact({
    operation: "json-members",
    ownedPointers: ["/owned"],
  }));
  assert.equal(json.read('{"owned":{"enabled":true},"local":1}\n').state, "present");
  assert.equal(json.remove('{"owned":{"enabled":true},"local":1}\n', false), '{\n  "local": 1\n}\n');

  const toml = createArtifactRemovalProjection(artifact({
    operation: "toml-tables",
    ownedTables: ["mcp_servers.context"],
    sectionId: "context-runtime",
  }));
  const installed = "[project]\nname = \"local\"\n\n# agent-context:context-runtime:start\n[mcp_servers.context]\ncommand = \"node\"\n# agent-context:context-runtime:end\n";
  assert.equal(toml.read(installed).state, "present");
  assert.equal(toml.remove(installed, false), "[project]\nname = \"local\"\n");
});

function artifact(
  fields:
    | { readonly operation: "text-section"; readonly sectionId: string; readonly markerStyle: "markdown" }
    | { readonly operation: "json-members"; readonly ownedPointers: readonly string[] }
    | { readonly operation: "toml-tables"; readonly ownedTables: readonly string[]; readonly sectionId: string },
): ContextRegistryArtifact {
  return {
    sourcePath: "registry/source.txt",
    sourceSha256: hash,
    targetPath: fields.operation === "json-members" ? "package.json" : fields.operation === "toml-tables" ? ".codex/config.toml" : "AGENTS.md",
    ...fields,
  };
}
