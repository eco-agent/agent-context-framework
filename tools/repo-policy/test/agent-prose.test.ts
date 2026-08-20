import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
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

test("model-facing prose reports the selected Unslop conflicts", async () => {
  const dense = await readFile(path.join(fixtureRoot, "dense.md"), "utf8");
  const findings = lintAgentProse("dense.md", dense);

  assert.deepEqual(
    [...new Set(findings.map((finding) => finding.rule))].sort(),
    [...agentProseRuleIds].sort(),
  );
  assert.ok(findings.every((finding) => finding.line > 0 && finding.column > 0));
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

test("the repository command rejects dense agent prose and accepts its revision", async () => {
  const dense = "tools/repo-policy/test/fixtures/agent-prose/dense.md";
  const revised = "tools/repo-policy/test/fixtures/agent-prose/revised.md";

  assert.equal((await checkAgentProse(repositoryRoot, [dense])).ok, false);
  assert.equal((await checkAgentProse(repositoryRoot, [revised])).ok, true);
});
