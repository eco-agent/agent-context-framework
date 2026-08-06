import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";

import { addComponent, diffProject, initProject } from "../src/context-installer.js";
import { buildContextRegistry, checkContextRegistry } from "../src/context-registry-builder.js";
import { checkContextGovernance } from "../src/context-governance.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("Wave 1 and Wave 2 registry is deterministic, licensed, and excludes generated caches and fixtures", async () => {
  const first = await buildContextRegistry(frameworkRoot);
  const second = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(first, second);
  await checkContextRegistry(frameworkRoot);

  const tailwind = first.components.find((component) => component.name === "skill-responsive-css-architect");
  assert.ok(tailwind);
  assert.equal(tailwind.artifacts.some((artifact) => artifact.sourcePath.includes("tailwind-docs/cache/")), false);
  const waveTwoSkills = [
    "skill-codebase-inventory",
    "skill-design-typescript-invariants",
    "skill-diagnose",
    "skill-reuse-before-implementation",
    "skill-write-technical-prose",
    "skill-writing-great-skills",
    "skill-optimize-codex-sessions",
  ];
  assert.equal(first.components.filter((component) =>
    component.name.startsWith("skill-") && component.name !== "skill-authoring").length, 15);
  assert.deepEqual(
    first.components.filter((component) => waveTwoSkills.includes(component.name)).map((component) => component.name),
    waveTwoSkills,
  );
  const inventory = first.components.find((component) => component.name === "skill-codebase-inventory");
  assert.ok(inventory);
  assert.equal(inventory.artifacts.some((artifact) => artifact.sourcePath.endsWith("/logo.png")), false);
  for (const component of first.components) {
    const targets = new Set(component.artifacts.map((artifact) => artifact.targetPath));
    for (const license of component.licenses) {
      if (license.kind === "third-party") assert.equal(targets.has(license.noticePath), true);
    }
  }
});

test("Wave 2 bundles resolve independently and exclude frontend, runtime, and objective orchestration", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(componentNames(registry, "engineering"), [
    "skill-codebase-inventory",
    "skill-diagnose",
    "skill-reuse-before-implementation",
    "skill-write-technical-prose",
    "engineering",
  ]);
  assert.deepEqual(componentNames(registry, "typescript-engineering"), [
    "skill-codebase-inventory",
    "skill-diagnose",
    "skill-reuse-before-implementation",
    "skill-write-technical-prose",
    "engineering",
    "skill-design-typescript-invariants",
    "typescript-engineering",
  ]);
  assert.deepEqual(componentNames(registry, "session-quality"), [
    "skill-optimize-codex-sessions",
    "session-quality",
  ]);
  assert.deepEqual(componentNames(registry, "skill-authoring"), [
    "skill-write-technical-prose",
    "skill-writing-great-skills",
    "skill-authoring",
  ]);

  const engineering = registry.components.find((component) => component.name === "engineering");
  const typescript = registry.components.find((component) => component.name === "typescript-engineering");
  assert.ok(engineering);
  assert.ok(typescript);
  assert.deepEqual(
    engineering.artifacts.map((artifact) => artifact.targetPath),
    [
      "AGENTS.md",
      "docs/AGENTS.md",
      ".codex/templates/work-record.md",
      ".codex/templates/project-decision.md",
    ],
  );
  assert.deepEqual(
    typescript.artifacts.map((artifact) => artifact.targetPath),
    ["AGENTS.md", ".codex/templates/type-contract.md"],
  );

  for (const component of registry.components.filter((candidate) =>
    ["engineering", "typescript-engineering", "session-quality", "skill-authoring"].includes(candidate.name))) {
    const resolved = resolveContextComponents(registry, [component.name]);
    assert.equal(resolved.some((candidate) => candidate.name.includes("frontend")), false);
    assert.equal(resolved.some((candidate) => candidate.artifacts.some((artifact) =>
      artifact.sourcePath.startsWith("packages/objective-") ||
      artifact.sourcePath.startsWith("tools/objective-runtime/") ||
      artifact.sourcePath.startsWith("tools/codex-workflows/"))), false);
  }
});

test("Wave 2 bundles materialize independently and installed inventory validation remains operational", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-wave-two-"));
  try {
    for (const bundle of ["engineering", "typescript-engineering", "session-quality", "skill-authoring"] as const) {
      const projectRoot = path.join(root, bundle);
      await mkdir(projectRoot);
      await initProject(projectRoot, frameworkRoot);
      const installed = await addComponent(projectRoot, frameworkRoot, bundle);
      assert.equal(installed.plan.status, "ready");
      assert.equal((await diffProject(projectRoot, frameworkRoot)).current, true);
    }

    const engineeringRoot = path.join(root, "engineering");
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "skills", "codebase-inventory", "SKILL.md")), true);
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "skills", "design-typescript-invariants", "SKILL.md")), false);
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "skills", "optimize-codex-sessions", "SKILL.md")), false);
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "templates", "work-record.md")), true);
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "templates", "project-decision.md")), true);
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "templates", "type-contract.md")), false);
    execFileSync(
      process.execPath,
      [path.join(engineeringRoot, ".codex", "skills", "codebase-inventory", "scripts", "validate-fixture.mjs")],
      { cwd: engineeringRoot, stdio: "pipe" },
    );

    const typescriptRoot = path.join(root, "typescript-engineering");
    assert.equal(await exists(path.join(typescriptRoot, ".codex", "skills", "design-typescript-invariants", "SKILL.md")), true);
    assert.equal(await exists(path.join(typescriptRoot, ".codex", "templates", "type-contract.md")), true);
    assert.equal(await exists(path.join(typescriptRoot, ".codex", "skills", "optimize-codex-sessions", "SKILL.md")), false);

    const sessionRoot = path.join(root, "session-quality");
    assert.equal(await exists(path.join(sessionRoot, ".codex", "skills", "optimize-codex-sessions", "SKILL.md")), true);
    assert.equal(await exists(path.join(sessionRoot, ".codex", "skills", "diagnose", "SKILL.md")), false);

    const authoringRoot = path.join(root, "skill-authoring");
    assert.equal(await exists(path.join(authoringRoot, ".codex", "skills", "writing-great-skills", "SKILL.md")), true);
    assert.equal(await exists(path.join(authoringRoot, ".codex", "skills", "codebase-inventory", "SKILL.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance rejects stale protected projections", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-governance-"));
  try {
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"), { recursive: true });
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    const agentsPath = path.join(temporaryRoot, "AGENTS.md");
    await writeFile(agentsPath, (await readFile(agentsPath, "utf8")).replace("Never fill decisions", "Sometimes fill decisions"));
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /Protected context projection differs/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry construction rejects unresolved packaged Markdown references", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-reference-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await mkdir(path.join(temporaryRoot, ".codex", "skills"), { recursive: true });
    for (const skill of [
      "adopt-established-product",
      "choose-react-animation",
      "design-accessible-interfaces",
      "design-color-systems",
      "design-interface-details",
      "design-web-typography",
      "frontend-design-discipline",
      "responsive-css-architect",
      "codebase-inventory",
      "design-typescript-invariants",
      "diagnose",
      "reuse-before-implementation",
      "write-technical-prose",
      "writing-great-skills",
      "optimize-codex-sessions",
    ]) {
      await cp(
        path.join(frameworkRoot, ".codex", "skills", skill),
        path.join(temporaryRoot, ".codex", "skills", skill),
        { recursive: true, filter: (source) => !source.replaceAll("\\", "/").includes("/tailwind-docs/cache") },
      );
    }
    const skillPath = path.join(temporaryRoot, ".codex", "skills", "frontend-design-discipline", "SKILL.md");
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\n[Missing](references/missing.md)\n`);
    await assert.rejects(buildContextRegistry(temporaryRoot), /Packaged Markdown reference is unresolved/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function componentNames(
  registry: Awaited<ReturnType<typeof buildContextRegistry>>,
  selected: string,
): readonly string[] {
  return resolveContextComponents(registry, [selected]).map((component) => component.name);
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await readFile(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
