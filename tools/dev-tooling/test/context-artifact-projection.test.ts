import assert from "node:assert/strict";
import test from "node:test";

import type {
  ContextJsonArrayItemOwnership,
  ContextRegistryArtifact,
} from "@agent-context/repo-policy";
import { parse as parseToml } from "smol-toml";

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

test("text sections preserve CRLF repositories while comparing canonical LF bytes", () => {
  const projection = createArtifactProjection(artifact({
    operation: "text-section",
    sectionId: "core",
    markerStyle: "markdown",
  }), "# Canonical\n");
  const installed = projection.install("# Project\r\n\r\nLocal prose.\r\n");
  assert.equal(installed.includes("\r\n"), true);
  assert.equal(installed.replaceAll("\r\n", "").includes("\n"), false);
  const read = projection.read(installed);
  assert.equal(read.state, "present");
  if (read.state !== "present") assert.fail("Installed CRLF section must be readable.");
  assert.equal(read.sha256, projection.sourceSha256);

  const replaced = projection.replace(installed.replace("Canonical", "Local"));
  assert.match(replaced, /# Canonical\r\n/u);
  assert.match(replaced, /# Project\r\n\r\nLocal prose\.\r\n/u);
  const removed = projection.remove(replaced, false);
  assert.equal(removed, "# Project\r\n\r\nLocal prose.\r\n");
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
  assert.match(installed, /\[mcp_servers\.context\]/u);
  assert.doesNotMatch(installed, /not_owned/u);
  assert.equal(projection.read(installed).state, "present");
  assert.throws(
    () => projection.install("[mcp_servers.context]\ncommand = \"custom\"\n"),
    /already contains owned table/u,
  );
  assert.equal(projection.remove(installed, false), "[project]\nname = \"fixture\"\n");
});

test("JSON array item ownership preserves unrelated matchers and identifies items independently of order", () => {
  const projection = createArtifactProjection(artifact({
    operation: "json-array-items",
    ownedItems: [
      { arrayPointer: "/hooks/PreToolUse", identityPointer: "/matcher", identity: "^ApplyPatch$" },
      { arrayPointer: "/hooks/SessionStart", identityPointer: "/matcher", identity: "^compact$" },
    ],
  }), `${JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "^ApplyPatch$", hooks: [{ type: "command", command: "owned" }] }],
      SessionStart: [{ matcher: "^compact$", hooks: [{ type: "command", command: "compact" }] }],
    },
  }, null, 2)}\n`);
  const installed = projection.install(`${JSON.stringify({
    description: "local",
    hooks: { PreToolUse: [{ matcher: "^Bash$", hooks: [{ type: "command", command: "local" }] }] },
  }, null, 2)}\n`);
  const installedValue = JSON.parse(installed) as {
    description: string;
    hooks: { PreToolUse: Array<{ matcher: string }>; SessionStart: Array<{ matcher: string }> };
  };
  assert.equal(installedValue.description, "local");
  assert.deepEqual(installedValue.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$", "^ApplyPatch$"]);
  assert.deepEqual(installedValue.hooks.SessionStart.map((item) => item.matcher), ["^compact$"]);
  assert.equal(projection.read(installed).state, "present");

  const reordered = `${JSON.stringify({
    hooks: {
      SessionStart: installedValue.hooks.SessionStart,
      PreToolUse: [...installedValue.hooks.PreToolUse].reverse(),
    },
    description: "local",
  }, null, 2)}\n`;
  assert.equal(projection.read(reordered).state, "present");
  assert.equal(projection.read('{"hooks":{"PreToolUse":[]}}\n').state, "absent");
  assert.equal(
    projection.read('{"hooks":{"PreToolUse":[{"matcher":"^ApplyPatch$"}]}}\n').state,
    "malformed",
  );
  const removed = JSON.parse(projection.remove(installed, false) ?? "") as {
    description: string;
    hooks: { PreToolUse: Array<{ matcher: string }>; SessionStart: unknown[] };
  };
  assert.equal(removed.description, "local");
  assert.deepEqual(removed.hooks.PreToolUse.map((item) => item.matcher), ["^Bash$"]);
  assert.deepEqual(removed.hooks.SessionStart, []);
});

test("TOML member ownership preserves unrelated agent settings and removes only declared paths", () => {
  const projection = createArtifactProjection(artifact({
    operation: "toml-members",
    ownedMembers: [
      "agents.max_concurrent_threads_per_session",
      "agents.worker",
    ],
  }), [
    "[agents]",
    "max_concurrent_threads_per_session = 2",
    "",
    "[agents.worker]",
    'description = "Implementation worker"',
    'config_file = "agents/worker.toml"',
    "",
  ].join("\n"));
  const installed = projection.install([
    "[project]",
    'name = "fixture"',
    "",
    "[agents]",
    "interrupt_message = false",
    "",
  ].join("\n"));
  const value = parseToml(installed) as {
    project: { name: string };
    agents: { interrupt_message: boolean; max_concurrent_threads_per_session: number; worker: { config_file: string } };
  };
  assert.equal(value.project.name, "fixture");
  assert.equal(value.agents.interrupt_message, false);
  assert.equal(value.agents.max_concurrent_threads_per_session, 2);
  assert.equal(value.agents.worker.config_file, "agents/worker.toml");
  assert.equal(projection.read(installed).state, "present");
  assert.equal(projection.read("[agents]\nmax_concurrent_threads_per_session = 2\n").state, "malformed");
  assert.throws(
    () => projection.install("[agents]\nmax_concurrent_threads_per_session = 4\n"),
    /already contains owned member/u,
  );
  const removed = parseToml(projection.remove(installed, false) ?? "") as {
    project: { name: string };
    agents: { interrupt_message: boolean; worker?: unknown; max_concurrent_threads_per_session?: number };
  };
  assert.equal(removed.project.name, "fixture");
  assert.equal(removed.agents.interrupt_message, false);
  assert.equal(removed.agents.worker, undefined);
  assert.equal(removed.agents.max_concurrent_threads_per_session, undefined);
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

test("seed-file projections write only when missing and preserve project ownership", () => {
  const projection = createArtifactProjection(artifact({ operation: "seed-file" }), "canonical\n");
  assert.equal(projection.install(null), "canonical\n");
  assert.equal(projection.install("project\n"), "project\n");
  assert.equal(projection.replace("project\n"), "project\n");
  assert.equal(projection.read("edited\n").state, "present");
  assert.equal(projection.remove("edited\n", false), "edited\n");
  assert.equal(projection.remove("edited\n", true), "edited\n");

  const removal = createArtifactRemovalProjection(artifact({ operation: "seed-file" }));
  assert.equal(removal.read(null).state, "absent");
  assert.equal(removal.remove("project\n", false), "project\n");
});

function artifact(
  fields:
    | { readonly operation: "seed-file" }
    | { readonly operation: "text-section"; readonly sectionId: string; readonly markerStyle: "markdown" }
    | { readonly operation: "json-members"; readonly ownedPointers: readonly string[] }
    | { readonly operation: "json-array-items"; readonly ownedItems: readonly ContextJsonArrayItemOwnership[] }
    | { readonly operation: "toml-tables"; readonly ownedTables: readonly string[]; readonly sectionId: string }
    | { readonly operation: "toml-members"; readonly ownedMembers: readonly string[] },
): ContextRegistryArtifact {
  return {
    sourcePath: "registry/source.txt",
    sourceSha256: hash,
    targetPath: fields.operation === "json-members"
      ? "package.json"
      : fields.operation === "json-array-items"
        ? ".codex/hooks.json"
        : fields.operation === "toml-tables" || fields.operation === "toml-members"
          ? ".codex/config.toml"
          : fields.operation === "seed-file"
            ? ".agent-context/policy.json"
            : "AGENTS.md",
    ...fields,
  };
}
