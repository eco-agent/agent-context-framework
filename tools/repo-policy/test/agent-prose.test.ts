import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  agentProseFilesForChanges,
  agentProseRuleIds,
  checkAgentProse,
  lintAgentProse,
} from "../src/checks/agent-prose.js";

const policyRoot = process.cwd();
const repositoryRoot = policyRoot.replace(/[/\\]tools[/\\]repo-policy$/u, "");
const fixtureRoot = path.join(
  repositoryRoot,
  "tools",
  "repo-policy",
  "test",
  "fixtures",
  "agent-prose",
);

test("model-facing prose reports the five exact Unslop conflicts", async () => {
  const dense = await readFile(path.join(fixtureRoot, "dense.md"), "utf8");
  const findings = lintAgentProse("dense.md", dense);

  assert.deepEqual(
    [...new Set(findings.map((finding) => finding.rule))].sort(),
    [...agentProseRuleIds].sort(),
  );
  assert.ok(findings.every((finding) => finding.line > 0 && finding.column > 0));
});

test("changed-file verification selects model-facing prose without scanning technical docs", async () => {
  const files = await agentProseFilesForChanges(repositoryRoot, [
    ".codex/agents/default.toml",
    "registry/sources/instructions/core.md",
    "tools/codex-workflows/src/objective-codex-client.ts",
    "packages/codex-workflow-runtime/src/plan-codex-client.ts",
    "docs/README.md",
    "package.json",
    ".codex/work/deleted-record.md",
  ]);

  assert.deepEqual(files, [
    ".codex/agents/default.toml",
    "packages/codex-workflow-runtime/src/plan-codex-client.ts",
    "registry/sources/instructions/core.md",
    "tools/codex-workflows/src/objective-codex-client.ts",
  ]);
});

test("skill description length and title case are not agent prose rules", () => {
  const markdown = [
    "---",
    "name: exact-agent-prose",
    "description: Route requests by subject and task state. Load the detailed instructions after selection so the catalog can distinguish this skill from its neighbors without restating the workflow.",
    "---",
    "",
    "# Agent Prose Check",
    "",
    "State the result directly.",
    "",
  ].join("\n");

  assert.deepEqual(lintAgentProse("exact.md", markdown), []);
});

test("exact rules still apply to skill descriptions", () => {
  const markdown = [
    "---",
    "name: flagged-agent-prose",
    "description: Certainly route requests through this skill.",
    "---",
    "",
    "# Check agent prose",
    "",
  ].join("\n");

  const findings = lintAgentProse("flagged.md", markdown);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, "chatbot-phrase");
  assert.equal(findings[0]?.line, 3);
});

test("fenced code and inline code do not become agent prose findings", () => {
  const markdown = [
    "# Check agent prose",
    "",
    "Use `an—exact—token` as written.",
    "",
    "```markdown",
    "# Title Case Heading",
    "- **Outcome:** Certainly use “curly” text—not just this, but that.",
    "```",
    "",
  ].join("\n");

  assert.deepEqual(lintAgentProse("code.md", markdown), []);
});

test("quoted Markdown examples do not become phrase findings", () => {
  const markdown = [
    "# Check agent prose",
    "",
    'The check names "Not just X, but Y" and "Certainly" as examples.',
    "",
  ].join("\n");

  assert.deepEqual(lintAgentProse("examples.md", markdown), []);
});

test("TOML and TypeScript prompt sources use the same exact rules", () => {
  const toml = [
    'developer_instructions = """',
    "Certainly, \u201cthis result\u201d is not just verbose, but awkward\u2014really.",
    '"""',
  ].join("\n");
  const typescript = 'const prompt = ["- **Outcome:** Explain it."];';
  const findings = [
    ...lintAgentProse("role.toml", toml),
    ...lintAgentProse("prompt.ts", typescript),
  ];

  assert.deepEqual(
    [...new Set(findings.map((finding) => finding.rule))].sort(),
    [...agentProseRuleIds].sort(),
  );
});

test("the repository command rejects dense agent prose and accepts its revision", async () => {
  const dense = "tools/repo-policy/test/fixtures/agent-prose/dense.md";
  const revised = "tools/repo-policy/test/fixtures/agent-prose/revised.md";

  assert.equal((await checkAgentProse(repositoryRoot, [dense])).ok, false);
  assert.equal((await checkAgentProse(repositoryRoot, [revised])).ok, true);
});

test("the repository command accepts selected role and prompt sources", async () => {
  const files = [
    ".codex/agents/default.toml",
    "packages/codex-workflow-runtime/src/plan-codex-client.ts",
    "tools/codex-workflows/src/objective-codex-client.ts",
  ];

  assert.equal((await checkAgentProse(repositoryRoot, files)).ok, true);
  await assert.rejects(
    checkAgentProse(repositoryRoot, ["package.json"]),
    /unsupported file type/u,
  );
});
