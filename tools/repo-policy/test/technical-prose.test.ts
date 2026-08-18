import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  checkTechnicalProse,
  lintTechnicalProse,
} from "../src/checks/technical-prose.js";

const policyRoot = process.cwd();
const repositoryRoot = policyRoot.replace(/[/\\]tools[/\\]repo-policy$/u, "");
const fixtureRoot = path.join(
  repositoryRoot,
  "tools",
  "repo-policy",
  "test",
  "fixtures",
  "technical-prose",
);

test("dense prose reports more exact violations than its revision", async () => {
  const dense = await readFile(path.join(fixtureRoot, "dense.md"), "utf8");
  const revised = await readFile(path.join(fixtureRoot, "revised.md"), "utf8");

  const denseFindings = lintTechnicalProse("dense.md", dense);
  const revisedFindings = lintTechnicalProse("revised.md", revised);

  assert.deepEqual(
    [...new Set(denseFindings.map((finding) => finding.rule))],
    ["formal-phrase", "semicolon", "marketing-language"],
  );
  assert.equal(revisedFindings.length, 0);
  assert.ok(denseFindings.every((finding) => finding.line === 1 && finding.column > 0));
});

test("Markdown lists, tables, and code do not become prose violations", async () => {
  const markdown = await readFile(path.join(fixtureRoot, "markdown-structure.md"), "utf8");

  assert.deepEqual(lintTechnicalProse("markdown-structure.md", markdown), []);
});

test("the repository check rejects dense prose and accepts the revision", async () => {
  const dense = "tools/repo-policy/test/fixtures/technical-prose/dense.md";
  const revised = "tools/repo-policy/test/fixtures/technical-prose/revised.md";

  assert.equal((await checkTechnicalProse(repositoryRoot, [dense])).ok, false);
  assert.equal((await checkTechnicalProse(repositoryRoot, [revised])).ok, true);
});
