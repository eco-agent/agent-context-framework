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
const packagedSkills = [
  "adopt-established-product",
  "choose-react-animation",
  "design-accessible-interfaces",
  "design-color-systems",
  "design-interface-details",
  "design-web-typography",
  "frontend-design-discipline",
  "responsive-css-architect",
  "tailwind-css-architect",
  "codebase-inventory",
  "design-typescript-invariants",
  "diagnose",
  "reuse-before-implementation",
  "write-technical-prose",
  "writing-great-skills",
  "optimize-codex-sessions",
];

test("Wave 1 and Wave 2 registry is deterministic, licensed, and excludes generated caches and fixtures", async () => {
  const first = await buildContextRegistry(frameworkRoot);
  const second = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(first, second);
  await checkContextRegistry(frameworkRoot);

  const responsive = first.components.find((component) => component.name === "skill-responsive-css-architect");
  assert.ok(responsive);
  assert.equal(responsive.artifacts.some((artifact) => artifact.sourcePath.includes("tailwind")), false);
  assert.equal(responsive.artifacts.some((artifact) => artifact.sourcePath.includes("tw-fade")), false);
  const tailwind = first.components.find((component) => component.name === "skill-tailwind-css-architect");
  assert.ok(tailwind);
  assert.equal(tailwind.artifacts.some((artifact) => artifact.sourcePath.includes("tailwind-docs/")), true);
  assert.equal(tailwind.artifacts.some((artifact) => artifact.sourcePath.endsWith("scripts/tailwind_doc_context.py")), true);
  assert.equal(componentNames(first, "frontend").includes("skill-responsive-css-architect"), false);
  assert.equal(componentNames(first, "frontend").includes("skill-tailwind-css-architect"), false);
  assert.equal(componentNames(first, "frontend-tailwind").includes("skill-responsive-css-architect"), true);
  assert.equal(componentNames(first, "frontend-tailwind").includes("skill-tailwind-css-architect"), true);
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
    component.name.startsWith("skill-") && component.name !== "skill-authoring").length, 16);
  for (const component of first.components) {
    assert.match(component.revision, /^sha256:[a-f0-9]{64}$/u);
  }
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
      assert.match(license.noticeSha256, /^[a-f0-9]{64}$/u);
      if (license.kind === "third-party") {
        assert.equal(targets.has(license.noticePath), true);
      } else {
        assert.equal(license.spdx, "MIT");
        assert.equal(license.sourcePath, "LICENSE");
        assert.equal(license.noticePath, ".agent-context/LICENSE.agent-context-framework");
      }
    }
  }
});

test("component revisions change with canonical component bytes", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-component-revision-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const baseline = await buildContextRegistry(temporaryRoot);
    const skillPath = path.join(temporaryRoot, ".codex", "skills", "diagnose", "SKILL.md");
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nRevision probe.\n`, "utf8");
    const changed = await buildContextRegistry(temporaryRoot);
    assert.notEqual(
      changed.components.find((component) => component.name === "skill-diagnose")?.revision,
      baseline.components.find((component) => component.name === "skill-diagnose")?.revision,
    );
    assert.equal(
      changed.components.find((component) => component.name === "skill-codebase-inventory")?.revision,
      baseline.components.find((component) => component.name === "skill-codebase-inventory")?.revision,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("installed frontend and skill bytes retain canonical anti-dilution semantics", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  const frontendSource = await readFile(
    path.join(frameworkRoot, "registry", "sources", "instructions", "frontend.md"),
    "utf8",
  );
  for (const required of [
    "Never fill decisions from model priors or generic familiar UI.",
    "Do not use text to frame text/elements or use cards for hierarchy.",
    "Invent no content, controls, navigation, summaries, or features.",
    "Default to minimalism",
  ]) {
    assert.match(frontendSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-anti-dilution-"));
  try {
    await initProject(root, frameworkRoot);
    await addComponent(root, frameworkRoot, "frontend");
    assert.equal((await diffProject(root, frameworkRoot)).current, true);
    const installedAgents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.equal(installedAgents.includes(frontendSource), true);

    for (const component of resolveContextComponents(registry, ["frontend"])) {
      for (const artifact of component.artifacts.filter((candidate) =>
        candidate.targetPath.startsWith(".codex/skills/") && candidate.targetPath.endsWith("/SKILL.md"))) {
        assert.equal(artifact.sourcePath, artifact.targetPath);
        const source = await readFile(path.join(frameworkRoot, ...artifact.sourcePath.split("/")), "utf8");
        const installed = await readFile(path.join(root, ...artifact.targetPath.split("/")), "utf8");
        assert.equal(installed, source);
        assert.match(source, /^---\nname: [a-z][a-z0-9-]*\ndescription: \S[^\n]*\n---\n/u);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontend-tailwind owns the Tailwind instruction and skill closure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-frontend-profiles-"));
  try {
    const plainRoot = path.join(root, "plain");
    const tailwindRoot = path.join(root, "tailwind");
    await mkdir(plainRoot);
    await mkdir(tailwindRoot);
    await initProject(plainRoot, frameworkRoot);
    await initProject(tailwindRoot, frameworkRoot);
    await addComponent(plainRoot, frameworkRoot, "frontend");
    await addComponent(tailwindRoot, frameworkRoot, "frontend-tailwind");

    const plainAgents = await readFile(path.join(plainRoot, "AGENTS.md"), "utf8");
    const tailwindAgents = await readFile(path.join(tailwindRoot, "AGENTS.md"), "utf8");
    assert.equal(plainAgents.includes("## Frontend Tailwind"), false);
    assert.equal(tailwindAgents.includes("## Frontend Tailwind"), true);
    assert.equal(
      await exists(path.join(plainRoot, ".codex", "skills", "tailwind-css-architect", "SKILL.md")),
      false,
    );
    assert.equal(
      await exists(path.join(tailwindRoot, ".codex", "skills", "tailwind-css-architect", "SKILL.md")),
      true,
    );
    assert.equal(
      await exists(path.join(tailwindRoot, ".codex", "skills", "responsive-css-architect", "SKILL.md")),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registry construction requires explicit project license terms", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-project-license-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const catalogPath = path.join(temporaryRoot, "registry", "registry.source.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      components: Array<{ licenses: Array<Record<string, unknown>> }>;
    };
    catalog.components[0]!.licenses = [{ kind: "project" }];
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    await assert.rejects(
      buildContextRegistry(temporaryRoot),
      /unknown fields|spdx must be a non-empty string|sourcePath must be a non-empty string|noticePath must be a non-empty string/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry construction rejects invoked external executables without capabilities", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-capabilities-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const catalogPath = path.join(temporaryRoot, "registry", "registry.source.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      components: Array<{
        name: string;
        capabilities: Array<{ kind: string; name: string; requirement: string }>;
      }>;
    };
    const optimizer = catalog.components.find((component) =>
      component.name === "skill-optimize-codex-sessions");
    assert.ok(optimizer);
    optimizer.capabilities = optimizer.capabilities.filter((capability) => capability.name !== "git");
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    await assert.rejects(
      buildContextRegistry(temporaryRoot),
      /skill-optimize-codex-sessions invokes git .* without a required runtime capability/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
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
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
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

test("governance rejects semantic dilution even before protected hashes are refreshed", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-semantic-governance-"));
  try {
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    const corePath = path.join(temporaryRoot, "registry", "sources", "instructions", "core.md");
    await writeFile(
      corePath,
      (await readFile(corePath, "utf8")).replace(
        "Do not edit,\n  remove, override, or weaken it from project work.",
        "Project authors may weaken this section.",
      ),
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /violates a maintainer-owned semantic requirement/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance requires human review ownership for protected framework surfaces", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-review-ownership-"));
  try {
    await mkdir(path.join(temporaryRoot, "registry"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await writeFile(path.join(temporaryRoot, ".github", "CODEOWNERS"), "/registry/ @bet01\n", "utf8");
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /review ownership is missing/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry construction rejects unresolved packaged Markdown references", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-reference-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const skillPath = path.join(temporaryRoot, ".codex", "skills", "frontend-design-discipline", "SKILL.md");
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\n[Missing](references/missing.md)\n`);
    await assert.rejects(buildContextRegistry(temporaryRoot), /Packaged Markdown reference is unresolved/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry construction rejects source attribution that differs from component licenses", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-attribution-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const sourcePath = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "writing-great-skills",
      "SOURCE.json",
    );
    const source = JSON.parse(await readFile(sourcePath, "utf8")) as Record<string, unknown>;
    source.revision = "different-revision";
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
    await assert.rejects(buildContextRegistry(temporaryRoot), /SOURCE.json does not match its registry licenses/u);
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

async function copyPackagedSkills(temporaryRoot: string): Promise<void> {
  await cp(path.join(frameworkRoot, "LICENSE"), path.join(temporaryRoot, "LICENSE"));
  await mkdir(path.join(temporaryRoot, ".codex", "skills"), { recursive: true });
  for (const skill of packagedSkills) {
    await cp(
      path.join(frameworkRoot, ".codex", "skills", skill),
      path.join(temporaryRoot, ".codex", "skills", skill),
      { recursive: true, filter: (source) => !source.replaceAll("\\", "/").includes("/tailwind-docs/cache") },
    );
  }
  await cp(
    path.join(frameworkRoot, ".agent-context", "runtime"),
    path.join(temporaryRoot, ".agent-context", "runtime"),
    {
      recursive: true,
      filter: (source) => {
        const portable = source.replaceAll("\\", "/");
        return !portable.includes("/node_modules") && !portable.includes("/dist");
      },
    },
  );
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
