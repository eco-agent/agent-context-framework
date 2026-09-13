import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkAgents } from "../src/checks/agents.js";
import { checkBoundaries } from "../src/checks/boundaries.js";
import { checkDependencyAdoptions } from "../src/checks/dependency-adoptions.js";
import { checkDocs } from "../src/checks/docs.js";

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
  assert.match(rootInstructions, /Use the `visualize`[\s>]+skill when an in-conversation visual/u);
  assert.match(rootInstructions, /Create a standalone HTML response file only when the\s+>\s+user asks/u);
  assert.match(rootInstructions, /eyebrows,\s+kickers, overlines, pills, badges/u);
  assert.match(
    frontendInstructions,
    /A heading moved into helper text has changed even when its\s+words remain the same/u,
  );
  assert.match(adoptionInstructions, /Materialize reusable source before writing replacement code/u);
  assert.match(
    adoptionInstructions,
    /begin with that source\s+instead of generating a similar interface from a written description/u,
  );
});

test("workspace package boundaries are valid", async () => {
  assert.deepEqual(await checkBoundaries(root), []);
});

test("every external manifest dependency has an adoption record", async () => {
  assert.deepEqual(await checkDependencyAdoptions(root), []);
});

test("documentation checks ignore generated skill projections", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "agent-context-docs-"));
  try {
    const generatedRoot = path.join(
      fixture,
      ".agents",
      "skills",
      `acf--generated--${"a".repeat(64)}`,
    );
    await mkdir(generatedRoot, { recursive: true });
    await writeFile(
      path.join(generatedRoot, "SKILL.md"),
      "[generated cross-skill link](../../missing/SKILL.md)\n",
    );
    const projectSkillRoot = path.join(fixture, ".agents", "skills", "project-authored");
    await mkdir(projectSkillRoot, { recursive: true });
    await writeFile(
      path.join(projectSkillRoot, "SKILL.md"),
      "[project skill link](missing.md)\n",
    );
    await writeFile(path.join(fixture, "README.md"), "[missing source document](missing.md)\n");
    assert.deepEqual(await checkDocs(fixture), [
      ".agents/skills/project-authored/SKILL.md has a broken local link: missing.md",
      "README.md has a broken local link: missing.md",
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("distributable dependencies require immutable sources and packaged notices", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "agent-context-adoption-"));
  try {
    await mkdir(path.join(fixture, "dependency-adoptions"), { recursive: true });
    await mkdir(path.join(fixture, ".codex", "acf", "runtime-source"), { recursive: true });
    await mkdir(path.join(fixture, "node_modules", "example"), { recursive: true });
    await writeFile(
      path.join(fixture, "package.json"),
      `${JSON.stringify({ dependencies: { example: "1.0.0", internal: "link:../internal" } }, null, 2)}\n`,
    );
    await writeFile(
      path.join(fixture, ".codex", "acf", "runtime-source", "package.json"),
      `${JSON.stringify({ dependencies: { example: "1.0.0", internal: "link:../internal" } }, null, 2)}\n`,
    );
    await writeFile(path.join(fixture, "node_modules", "example", "LICENSE"), "MIT\n");
    await writeFile(
      path.join(fixture, "dependency-adoptions", "example.json"),
      `${JSON.stringify({
        name: "example",
        version: "1.0.0",
        source: "https://github.com/example/example/tree/v1.0.0",
        license: "MIT",
        integrity: "sha512-example",
        purpose: "fixture",
        alternativesConsidered: ["none"],
        maintenanceStatus: "fixture",
        securityEvidence: "fixture",
        modifications: "none",
        requiredNotices: "Preserve MIT.",
        owner: "test",
      }, null, 2)}\n`,
    );
    assert.deepEqual(await checkDependencyAdoptions(fixture), [
      "Distributable dependency example source must name an exact Git commit or immutable npm archive.",
      "Distributable dependency example must declare its packaged notice files.",
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
