import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkAgents } from "../src/checks/agents.js";
import { checkBoundaries } from "../src/checks/boundaries.js";
import { checkDependencyAdoptions } from "../src/checks/dependency-adoptions.js";

const root = process.cwd().replace(/[/\\]tools[/\\]repo-policy$/u, "");

test("instruction hierarchy preserves every legacy block verbatim", async () => {
  assert.deepEqual(await checkAgents(root), []);
});

test("instruction hierarchy retains communication, anti-prior, and direct-reuse rules", async () => {
  const rootInstructions = await readFile(path.join(root, "AGENTS.md"), "utf8");
  const frontendInstructions = await readFile(
    path.join(root, ".codex/skills/frontend-design-discipline/SKILL.md"),
    "utf8",
  );
  const adoptionInstructions = await readFile(
    path.join(root, ".codex/skills/adopt-established-product/SKILL.md"),
    "utf8",
  );
  assert.match(rootInstructions, /in plain English/u);
  assert.match(rootInstructions, /Do not impose character, word, paragraph, or bullet limits/u);
  assert.match(rootInstructions, /Use the `visualize` skill for an in-conversation visual/u);
  assert.match(rootInstructions, /Do not create standalone HTML response files/u);
  assert.match(rootInstructions, /eyebrows, kickers, overlines, pills, badges/u);
  assert.match(frontendInstructions, /semantic role as well as the words/u);
  assert.match(adoptionInstructions, /materialize the named files into the worktree/u);
  assert.match(adoptionInstructions, /A prose summary followed by an independent rewrite is not adoption/u);
});

test("workspace package boundaries are valid", async () => {
  assert.deepEqual(await checkBoundaries(root), []);
});

test("every external manifest dependency has an adoption record", async () => {
  assert.deepEqual(await checkDependencyAdoptions(root), []);
});
