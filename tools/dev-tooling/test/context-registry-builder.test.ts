import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveContextComponents } from "@agent-context/repo-policy";

import {
  addComponent,
  diffProject,
  initProject,
  planProjectSelection,
} from "../src/context-installer.js";
import {
  buildContextRegistry,
  checkContextRegistry,
  writeContextRegistry,
} from "../src/context-registry-builder.js";
import { checkContextGovernance } from "../src/context-governance.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

interface RoutingExerciseFixture {
  readonly schemaVersion: 1;
  exercises: Array<{
    component: string;
    positivePrompt: string;
    negativePrompt: string;
    changedDecision: string;
    observation: string;
    gracePath: string;
  }>;
}

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
  "design-operational-boundaries",
  "design-typescript-invariants",
  "diagnose",
  "reduce-reader-load",
  "reuse-before-implementation",
  "separate-shared-state",
  "write-technical-prose",
  "writing-great-skills",
  "maintain-agent-context-framework",
  "optimize-codex-sessions",
  "orchestrate-codex-workflows",
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
    "skill-design-operational-boundaries",
    "skill-design-typescript-invariants",
    "skill-diagnose",
    "skill-reduce-reader-load",
    "skill-reuse-before-implementation",
    "skill-separate-shared-state",
    "skill-write-technical-prose",
    "skill-writing-great-skills",
    "skill-optimize-codex-sessions",
  ];
  assert.equal(first.components.filter((component) =>
    component.name.startsWith("skill-") && component.name !== "skill-authoring").length, 21);
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
        if (component.name === "skill-orchestrate-codex-workflows") {
          assert.equal(
            license.sourcePath,
            ".codex/skills/orchestrate-codex-workflows/LICENSE",
          );
          assert.equal(license.noticePath, license.sourcePath);
          assert.equal(targets.has(license.noticePath), true);
        } else {
          assert.equal(license.sourcePath, "LICENSE");
          assert.equal(license.noticePath, ".codex/acf/LICENSE.agent-context-framework");
        }
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

test("skill routing exercises cover the exact packaged skill set", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  const expected = registry.components.flatMap((component) => {
    const entrypoint = component.name.startsWith("skill-")
      ? `.codex/skills/${component.name.slice("skill-".length)}/SKILL.md`
      : undefined;
    return entrypoint && component.artifacts.some((artifact) => artifact.targetPath === entrypoint)
      ? [component.name]
      : [];
  });
  const catalog = JSON.parse(await readFile(
    path.join(frameworkRoot, "registry", "sources", "skill-routing-exercises.json"),
    "utf8",
  )) as { exercises: Array<{ component: string }> };
  assert.deepEqual(
    catalog.exercises.map((exercise) => exercise.component).sort(),
    [...expected].sort(),
  );
});

test("skill routing exercise validation rejects missing, stale, duplicate, and indistinguishable cases", async () => {
  const cases = [
    {
      name: "missing",
      change: (catalog: RoutingExerciseFixture) => {
        catalog.exercises = catalog.exercises.slice(1);
      },
      expected: /catalog is missing/u,
    },
    {
      name: "stale",
      change: (catalog: RoutingExerciseFixture) => {
        catalog.exercises.push({
          ...catalog.exercises[0]!,
          component: "skill-missing-owner",
        });
      },
      expected: /names non-skill components/u,
    },
    {
      name: "duplicate",
      change: (catalog: RoutingExerciseFixture) => {
        catalog.exercises.push({ ...catalog.exercises[0]! });
      },
      expected: /contain duplicate/u,
    },
    {
      name: "indistinguishable",
      change: (catalog: RoutingExerciseFixture) => {
        catalog.exercises[0]!.negativePrompt = catalog.exercises[0]!.positivePrompt;
      },
      expected: /positivePrompt and negativePrompt must differ/u,
    },
  ] as const;

  for (const item of cases) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `agent-context-routing-${item.name}-`));
    try {
      await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
      await copyPackagedSkills(temporaryRoot);
      const catalogPath = path.join(
        temporaryRoot,
        "registry",
        "sources",
        "skill-routing-exercises.json",
      );
      const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as RoutingExerciseFixture;
      item.change(catalog);
      await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
      await assert.rejects(buildContextRegistry(temporaryRoot), item.expected);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("orchestration authoring excludes generated runtime directories", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-orchestration-generated-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const baseline = await buildContextRegistry(temporaryRoot);
    const runtimeRoot = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "orchestrate-codex-workflows",
      "assets",
      "typescript-runtime",
    );
    for (const generatedDirectory of [".codex-runs", "dist", "node_modules"]) {
      const directory = path.join(runtimeRoot, generatedDirectory);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "generated.txt"), "generated\n", "utf8");
    }
    const withGeneratedOutput = await buildContextRegistry(temporaryRoot);
    const componentName = "skill-orchestrate-codex-workflows";
    assert.equal(
      withGeneratedOutput.components.find((component) => component.name === componentName)?.revision,
      baseline.components.find((component) => component.name === componentName)?.revision,
    );
    assert.equal(
      withGeneratedOutput.components.find((component) => component.name === componentName)?.artifacts
        .some((artifact) => /\/(?:\.codex-runs|dist|node_modules)\//u.test(artifact.targetPath)),
      false,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry check reports projected runtime drift and registry build repairs exact bytes and inventory", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-runtime-projection-"));
  try {
    await copyCompleteRegistryFixture(temporaryRoot);
    const canonical = path.join(
      temporaryRoot,
      "packages",
      "codex-workflow-runtime",
      "src",
      "contracts.ts",
    );
    const projected = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "orchestrate-codex-workflows",
      "assets",
      "typescript-runtime",
      "src",
      "contracts.ts",
    );
    const obsolete = path.join(path.dirname(projected), "obsolete.ts");
    const canonicalPlan = path.join(
      temporaryRoot,
      "packages",
      "codex-workflow-runtime",
      "src",
      "plan.ts",
    );
    const projectedPlan = path.join(path.dirname(projected), "plan.ts");
    await writeFile(projected, "projection drift\n", "utf8");
    await writeFile(obsolete, "obsolete\n", "utf8");
    await rm(projectedPlan);

    await assert.rejects(
      checkContextRegistry(temporaryRoot),
      /Projected directory is stale: .*typescript-runtime\/src\. Run pnpm registry:build\./u,
    );
    assert.equal(await readFile(projected, "utf8"), "projection drift\n");
    assert.equal(await exists(obsolete), true);
    assert.equal(await exists(projectedPlan), false);

    await writeContextRegistry(temporaryRoot);
    assert.equal(await readFile(projected, "utf8"), await readFile(canonical, "utf8"));
    assert.equal(await readFile(projectedPlan, "utf8"), await readFile(canonicalPlan, "utf8"));
    assert.equal(await exists(obsolete), false);
    await checkContextRegistry(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("registry build refuses a projected target beneath a redirected ancestor", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-runtime-redirect-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-runtime-outside-"));
  try {
    await copyCompleteRegistryFixture(temporaryRoot);
    const catalogPath = path.join(temporaryRoot, "registry", "registry.source.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      components: Array<{
        name: string;
        artifacts: Array<Record<string, unknown>>;
      }>;
    };
    const component = catalog.components.find((candidate) =>
      candidate.name === "skill-orchestrate-codex-workflows");
    assert.ok(component);
    for (const artifact of component.artifacts) {
      if (artifact.kind !== "projected-directory") continue;
      const sourceDirectory = String(artifact.sourceDirectory);
      artifact.targetDirectory = `redirected-runtime/${path.posix.basename(sourceDirectory)}`;
    }
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await writeFile(path.join(outsideRoot, "sentinel.txt"), "outside\n", "utf8");
    await symlink(
      outsideRoot,
      path.join(temporaryRoot, "redirected-runtime"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await assert.rejects(
      writeContextRegistry(temporaryRoot),
      /symbolic-link or junction ancestor/u,
    );
    assert.equal(await readFile(path.join(outsideRoot, "sentinel.txt"), "utf8"), "outside\n");
    assert.equal(await exists(path.join(outsideRoot, "src")), false);
    assert.equal(await exists(path.join(outsideRoot, "examples")), false);
    assert.equal(await exists(path.join(outsideRoot, "test")), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("registry rejects case-only overlap between projected source and target directories", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-runtime-overlap-"));
  try {
    await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
    await copyPackagedSkills(temporaryRoot);
    const catalogPath = path.join(temporaryRoot, "registry", "registry.source.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      components: Array<{
        name: string;
        artifacts: Array<Record<string, unknown>>;
      }>;
    };
    const component = catalog.components.find((candidate) =>
      candidate.name === "skill-orchestrate-codex-workflows");
    assert.ok(component);
    const projection = component.artifacts.find((artifact) =>
      artifact.kind === "projected-directory" &&
      artifact.sourceDirectory === "packages/codex-workflow-runtime/src");
    assert.ok(projection);
    projection.targetDirectory = "PACKAGES/CODEX-WORKFLOW-RUNTIME/SRC";
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    await assert.rejects(
      buildContextRegistry(temporaryRoot),
      /Projected source and target directories must not overlap/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects a new projected runtime file without protected coverage", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-runtime-governance-"));
  try {
    await copyCompleteRegistryFixture(temporaryRoot);
    await writeFile(
      path.join(temporaryRoot, "packages", "codex-workflow-runtime", "src", "new-module.ts"),
      "export const newModule = true;\n",
      "utf8",
    );

    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(temporaryRoot)),
      /lacks governed source and target coverage/u,
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
  const normalizedFrontendSource = frontendSource.replace(/\s+/gu, " ");
  for (const required of [
    "Do not make product decisions from model priors or a familiar generic interface.",
    "Treat schemas and the current implementation as evidence, not as the default interface.",
    "Treat desktop and mobile as projections of the same product model.",
    "Do not use cards to create hierarchy.",
    "Do not add text whose only purpose is to frame other text or elements.",
    "Do not invent content, controls, navigation, summaries, or features.",
    "If the project has a component library for that role, use its component.",
    "Do not hand-write composite behavior",
    "A muted one-pixel separator is not default decoration",
    "Default to minimalism",
  ]) {
    assert.match(normalizedFrontendSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-anti-dilution-"));
  try {
    await initProject(root, frameworkRoot);
    await addComponent(root, frameworkRoot, "frontend");
    assert.equal((await diffProject(root, frameworkRoot)).current, true);
    const installedAgents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.equal(installedAgents.includes(frontendSource), true);

    for (const expected of [
      ".codex/skills/frontend-design-discipline/assets/design-search.md",
      ".codex/skills/frontend-design-discipline/assets/component-lab.md",
      ".codex/skills/frontend-design-discipline/assets/visual-evidence.md",
      ".codex/skills/frontend-design-discipline/references/frontend-stages.md",
      ".codex/skills/frontend-design-discipline/references/interaction-studies.md",
      ".codex/skills/frontend-design-discipline/references/precedent-evidence.md",
      ".codex/skills/frontend-design-discipline/references/progressive-context.md",
      ".codex/skills/frontend-design-discipline/references/representation-search.md",
    ]) {
      assert.equal(await exists(path.join(root, ...expected.split("/"))), true);
    }

    const typographySkill = (await readFile(
      path.join(root, ".codex", "skills", "design-web-typography", "SKILL.md"),
      "utf8",
    )).replace(/\s+/gu, " ");
    for (const required of [
      "Do not use arbitrary per-element values or line-height to position text inside a control.",
      "Keep `letter-spacing: normal` for ordinary headings and body text.",
      "Do not tune individual headings",
    ]) {
      assert.equal(typographySkill.includes(required), true);
    }

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
    assert.equal(plainAgents.includes("## Tailwind frontend"), false);
    assert.equal(tailwindAgents.includes("## Tailwind frontend"), true);
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
    const tailwindSkill = (await readFile(
      path.join(tailwindRoot, ".codex", "skills", "tailwind-css-architect", "SKILL.md"),
      "utf8",
    )).replace(/\s+/gu, " ");
    for (const required of [
      "utilities are the normal representation for every style Tailwind can express cleanly.",
      "Repetition, a long class string, or a stable component role is not enough reason to move styling into raw CSS.",
      "Existing component-library recipes and variant helpers remain in use.",
    ]) {
      assert.equal(tailwindSkill.includes(required), true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("framework maintainer skill installs as an optional governed leaf", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(componentNames(registry, "skill-maintain-agent-context-framework"), [
    "skill-maintain-agent-context-framework",
  ]);

  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-framework-maintainer-"));
  try {
    await initProject(root, frameworkRoot);
    const installed = await addComponent(root, frameworkRoot, "skill-maintain-agent-context-framework");
    assert.equal(installed.plan.status, "ready");
    assert.equal((await diffProject(root, frameworkRoot)).current, true);

    const skillPath = path.join(
      root,
      ".codex",
      "skills",
      "maintain-agent-context-framework",
      "SKILL.md",
    );
    const skill = (await readFile(skillPath, "utf8")).replace(/\s+/gu, " ");
    for (const required of [
      "Treat existing instructions as active constraints, not prose that can be freely summarized.",
      "A boundary without an observation is a wish.",
      "Assume the agent will take the least constrained reading that still appears compliant.",
      "Process that only records that work happened is ceremony. Delete it.",
    ]) {
      assert.equal(skill.includes(required), true);
    }

    const metadata = await readFile(
      path.join(
        root,
        ".codex",
        "skills",
        "maintain-agent-context-framework",
        "agents",
        "openai.yaml",
      ),
      "utf8",
    );
    assert.equal(metadata.includes("allow_implicit_invocation: true"), true);
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
    "skill-design-operational-boundaries",
    "skill-diagnose",
    "skill-reduce-reader-load",
    "skill-reuse-before-implementation",
    "skill-separate-shared-state",
    "skill-write-technical-prose",
    "engineering",
  ]);
  assert.deepEqual(componentNames(registry, "typescript-engineering"), [
    "skill-codebase-inventory",
    "skill-design-operational-boundaries",
    "skill-diagnose",
    "skill-reduce-reader-load",
    "skill-reuse-before-implementation",
    "skill-separate-shared-state",
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

test("optional orchestration authoring has an explicit consumer and a governed safety contract", async () => {
  const registry = await buildContextRegistry(frameworkRoot);
  const componentName = "skill-orchestrate-codex-workflows";
  const component = registry.components.find((candidate) => candidate.name === componentName);
  assert.ok(component);
  assert.deepEqual(component.dependencies, []);
  assert.deepEqual(
    resolveContextComponents(registry, [componentName]).map((candidate) => candidate.name),
    [componentName],
  );
  assert.deepEqual(component.capabilities, [
    { kind: "runtime", name: "codex-authentication", requirement: "required" },
    { kind: "runtime", name: "git", requirement: "recommended" },
    { kind: "runtime", name: "network", requirement: "required" },
    { kind: "runtime", name: "node", requirement: "required" },
  ]);

  const authorizedConsumers = new Set([componentName, "workflow-frontend-composition"]);
  for (const existing of registry.components.filter((candidate) => !authorizedConsumers.has(candidate.name))) {
    assert.equal(
      resolveContextComponents(registry, [existing.name]).some((candidate) => candidate.name === componentName),
      false,
      `${existing.name} must not acquire optional orchestration authoring transitively`,
    );
  }
  assert.equal(
    resolveContextComponents(registry, ["workflow-frontend-composition"])
      .some((candidate) => candidate.name === componentName),
    true,
  );

  assert.equal(component.artifacts.length > 0, true);
  assert.equal(component.artifacts.every((artifact) =>
    artifact.targetPath.startsWith(".codex/skills/orchestrate-codex-workflows/")), true);
  assert.equal(component.artifacts.every((artifact) =>
    artifact.sourcePath.startsWith(".codex/skills/orchestrate-codex-workflows/") ||
    artifact.sourcePath.startsWith("packages/codex-workflow-runtime/")), true);
  assert.equal(component.artifacts.some((artifact) =>
    artifact.sourcePath === "packages/codex-workflow-runtime/src/plan.ts"), true);
  for (const forbiddenOwner of [
    "packages/objective-",
    "tools/objective-runtime/",
    "tools/codex-workflows/",
    "objective-runner",
    "task-envelope",
    "binding-producer",
    "scheduler",
    "queue",
    "database",
  ]) {
    assert.equal(
      component.artifacts.some((artifact) =>
        artifact.sourcePath.includes(forbiddenOwner) || artifact.targetPath.includes(forbiddenOwner)),
      false,
      `${forbiddenOwner} must remain outside the distributable closure`,
    );
  }

  const instructions = await readFile(
    path.join(frameworkRoot, ".codex", "skills", "orchestrate-codex-workflows", "SKILL.md"),
    "utf8",
  );
  const normalizedInstructions = instructions.replace(/\s+/gu, " ");
  for (const protectedSemantic of [
    "This skill does not support recursive manager trees, sibling voting, or an open-ended scheduler.",
    "Define the stages, roles, budgets, permissions, return paths, and stopping conditions in project code.",
    "They may not create roles or recursively split the task.",
    "Store each result before using it to choose the next stage.",
    "Give each role only the filesystem, network, and approval access it needs.",
  ]) {
    assert.equal(normalizedInstructions.includes(protectedSemantic), true, protectedSemantic);
  }

  const contracts = await readFile(
    path.join(frameworkRoot, "packages", "codex-workflow-runtime", "src", "contracts.ts"),
    "utf8",
  );
  assert.match(contracts, /Number\.isSafeInteger\(value\)/u);
  assert.match(contracts, /environment\.intent/u);
  const environmentLoop = await readFile(
    path.join(frameworkRoot, "packages", "codex-workflow-runtime", "src", "loops", "autonomous-environment.ts"),
    "utf8",
  );
  const intentRecord = environmentLoop.indexOf('"environment.intent"');
  const externalEffect = environmentLoop.indexOf("await environment.execute");
  assert.equal(intentRecord >= 0 && externalEffect > intentRecord, true, "evidence intent must precede the external effect");
});

test("orchestration authoring installation preserves the consumer package graph", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-orchestration-authoring-"));
  const componentName = "skill-orchestrate-codex-workflows";
  const manifest = '{"name":"consumer","private":true,"dependencies":{"existing":"1.0.0"}}\n';
  const lockfile = "lockfileVersion: '9.0'\nconsumerSentinel: unchanged\n";
  try {
    await writeFile(path.join(root, "package.json"), manifest, "utf8");
    await writeFile(path.join(root, "pnpm-lock.yaml"), lockfile, "utf8");
    await initProject(root, frameworkRoot);

    const preview = await planProjectSelection(root, frameworkRoot, [componentName]);
    assert.deepEqual(preview.requestedComponents, [componentName]);
    assert.equal(preview.resolvedComponents.includes(componentName), true);
    assert.deepEqual(preview.transitiveComponents, []);
    assert.equal(preview.footprint.skillTargetCount > 0, true);
    assert.equal(preview.footprint.runtimeTargetCount, 0);
    for (const capability of ["codex-authentication", "network", "node"]) {
      assert.equal(preview.capabilities.some((candidate) =>
        candidate.kind === "runtime" && candidate.name === capability && candidate.requirement === "required"), true);
    }
    assert.equal(preview.licenses.some((license) => license.spdx === "MIT"), true);
    assert.equal(preview.licenses.some((license) => license.spdx === "Apache-2.0"), true);
    assert.equal(preview.trustRequired, true);
    assert.equal(preview.activations.some((activation) =>
      activation.id === "codex-authenticated-execution" && activation.status === "dormant"), true);

    const installed = await addComponent(root, frameworkRoot, componentName);
    assert.equal(installed.plan.status, "ready");
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), manifest);
    assert.equal(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), lockfile);
    assert.equal(await exists(path.join(root, "node_modules")), false);
    assert.equal(await exists(path.join(root, "package-lock.json")), false);
    assert.equal(
      installed.writtenPaths.filter((targetPath) => targetPath.startsWith(".codex/skills/"))
        .every((targetPath) => targetPath.startsWith(".codex/skills/orchestrate-codex-workflows/")),
      true,
    );
    assert.equal(
      await exists(path.join(root, ".codex", "skills", "orchestrate-codex-workflows", "assets", "typescript-runtime", "package.json")),
      true,
    );
    assert.equal(
      await exists(path.join(root, ".codex", "skills", "orchestrate-codex-workflows", "assets", "typescript-runtime", "node_modules")),
      false,
    );
    assert.equal(
      await exists(path.join(root, ".codex", "skills", "orchestrate-codex-workflows", "assets", "typescript-runtime", "dist")),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
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
    assert.equal(await exists(path.join(engineeringRoot, ".codex", "templates", "work-record.md")), false);
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
    await copyGovernedSkills(temporaryRoot);
    const agentsPath = path.join(temporaryRoot, "AGENTS.md");
    await writeFile(
      agentsPath,
      (await readFile(agentsPath, "utf8")).replace(
        "Do not make product decisions from model priors or a familiar generic interface.",
        "Use a familiar generic interface when convenient.",
      ),
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /Protected context projection differs/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects changes outside the named root instruction sections", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-root-prefix-governance-"));
  try {
    await copyGovernanceFixture(temporaryRoot);
    const agentsPath = path.join(temporaryRoot, "AGENTS.md");
    await writeFile(
      agentsPath,
      (await readFile(agentsPath, "utf8")).replace(
        "Preserve unrelated changes. Agents may push only their `codex/<task>` branch",
        "Unrelated changes may be discarded.",
      ),
      "utf8",
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /Protected context projection differs/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance compares canonical and installed role prompts as complete files", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-role-governance-"));
  try {
    await copyGovernanceFixture(temporaryRoot);
    const scoutPath = path.join(temporaryRoot, ".codex", "agents", "scout.toml");
    await writeFile(
      scoutPath,
      (await readFile(scoutPath, "utf8")).replace(
        "Do not edit files, make repository decisions, start other agents, or turn the investigation into a redesign.",
        "Edit files when it helps the investigation.",
      ),
      "utf8",
    );
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
    await copyGovernedSkills(temporaryRoot);
    const corePath = path.join(temporaryRoot, "registry", "sources", "instructions", "core.md");
    await writeFile(
      corePath,
      (await readFile(corePath, "utf8")).replace(
        "Do not edit,\n  remove, override, or weaken them from project work.",
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

test("governance rejects dilution of parallel scout authority", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-scout-routing-governance-"));
  try {
    await copyGovernanceFixture(temporaryRoot);
    const corePath = path.join(temporaryRoot, "registry", "sources", "instructions", "core.md");
    await writeFile(
      corePath,
      (await readFile(corePath, "utf8")).replace(
        "Treat their output as evidence, not a\ndecision.",
        "A scout may apply its preferred conclusion.",
      ),
      "utf8",
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /violates a maintainer-owned semantic requirement/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects weaker vendoring and submodule rules", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-vendoring-governance-"));
  try {
    await copyGovernanceFixture(temporaryRoot);
    const corePath = path.join(
      temporaryRoot,
      "registry",
      "sources",
      "instructions",
      "core.md",
    );
    await writeFile(
      corePath,
      (await readFile(corePath, "utf8")).replace(
        "Do not add or mutate a submodule\nunless a project contract requires its separate repository lifecycle.",
        "Avoid submodules when possible.",
      ),
      "utf8",
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /violates a maintainer-owned semantic requirement/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects dilution of orchestration safety semantics", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-orchestration-governance-"));
  try {
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    await copyGovernedSkills(temporaryRoot);
    const skillPath = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "orchestrate-codex-workflows",
      "SKILL.md",
    );
    await writeFile(
      skillPath,
      (await readFile(skillPath, "utf8")).replace(
        "Store each result before using it to choose the next stage.",
        "Record evidence when convenient.",
      ),
      "utf8",
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /violates a maintainer-owned semantic requirement/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects dilution of restored skill guards", async () => {
  const cases = [
    {
      skill: "adopt-established-product",
      remove: "model-prior substitute does not count as completion.",
    },
    {
      skill: "diagnose",
      remove: "Skip a phase only when you record why it cannot improve the diagnosis.",
    },
    {
      skill: "design-typescript-invariants",
      remove: "2. The escape hatch is narrower than the surrounding domain.",
    },
    {
      skill: "design-operational-boundaries",
      remove: "Report one failure once.",
    },
    {
      skill: "separate-shared-state",
      remove: "Instructions and naming conventions are not concurrency control.",
    },
    {
      skill: "reduce-reader-load",
      remove: "automatic deletion rule.",
    },
    {
      skill: "optimize-codex-sessions",
      remove: "Managed workflows require a stable `objectiveId`",
    },
  ] as const;

  for (const item of cases) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `agent-context-${item.skill}-governance-`));
    try {
      await copyGovernanceFixture(temporaryRoot);
      const skillPath = path.join(temporaryRoot, ".codex", "skills", item.skill, "SKILL.md");
      const source = await readFile(skillPath, "utf8");
      const diluted = source.replace(item.remove, "Removed guard");
      assert.notEqual(diluted, source, item.skill);
      await writeFile(
        skillPath,
        diluted,
        "utf8",
      );
      await assert.rejects(
        checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
        /violates a maintainer-owned semantic requirement/u,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("governance rejects dilution of agent Git transaction semantics", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-git-governance-"));
  try {
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    await copyGovernedSkills(temporaryRoot);
    const transactionPath = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "orchestrate-codex-workflows",
      "references",
      "git-transaction.md",
    );
    await writeFile(
      transactionPath,
      (await readFile(transactionPath, "utf8")).replace(
        "Do not create linked worktrees.",
        "Create linked worktrees for isolation.",
      ),
      "utf8",
    );
    await assert.rejects(
      checkContextGovernance(temporaryRoot, await buildContextRegistry(frameworkRoot)),
      /violates a maintainer-owned semantic requirement/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("governance rejects dilution of representation and context boundaries", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-representation-governance-"));
  try {
    await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
    await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
    await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
    await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
    await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
    await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
    await copyGovernedSkills(temporaryRoot);
    const contextPath = path.join(
      temporaryRoot,
      ".codex",
      "skills",
      "frontend-design-discipline",
      "references",
      "progressive-context.md",
    );
    await writeFile(
      contextPath,
      (await readFile(contextPath, "utf8")).replace(
        "Hard isolation is a control property.",
        "A new chat is always isolated.",
      ),
      "utf8",
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
    await copyGovernedSkills(temporaryRoot);
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
    path.join(frameworkRoot, ".codex", "acf", "runtime-source"),
    path.join(temporaryRoot, ".codex", "acf", "runtime-source"),
    {
      recursive: true,
      filter: (source) => {
        const portable = source.replaceAll("\\", "/");
        return !portable.includes("/node_modules") && !portable.includes("/dist");
      },
    },
  );
  await copyCanonicalWorkflowRuntime(temporaryRoot);
}

async function copyGovernedSkills(temporaryRoot: string): Promise<void> {
  const targetRoot = path.join(temporaryRoot, ".codex", "skills");
  await mkdir(targetRoot, { recursive: true });
  for (const skill of [
    "adopt-established-product",
    "design-accessible-interfaces",
    "design-operational-boundaries",
    "design-typescript-invariants",
    "design-web-typography",
    "diagnose",
    "frontend-design-discipline",
    "maintain-agent-context-framework",
    "optimize-codex-sessions",
    "orchestrate-codex-workflows",
    "reduce-reader-load",
    "responsive-css-architect",
    "separate-shared-state",
    "tailwind-css-architect",
  ]) {
    await cp(
      path.join(frameworkRoot, ".codex", "skills", skill),
      path.join(targetRoot, skill),
      { recursive: true },
    );
  }
  await cp(
    path.join(frameworkRoot, ".codex", "agents"),
    path.join(temporaryRoot, ".codex", "agents"),
    { recursive: true },
  );
  await copyCanonicalWorkflowRuntime(temporaryRoot);
}

async function copyCanonicalWorkflowRuntime(temporaryRoot: string): Promise<void> {
  const packagesRoot = path.join(temporaryRoot, "packages");
  await mkdir(packagesRoot, { recursive: true });
  for (const packageName of ["codex-workflow-runtime", "codex-frontend-workflows"]) {
    await cp(
      path.join(frameworkRoot, "packages", packageName),
      path.join(packagesRoot, packageName),
      {
        recursive: true,
        filter: (source) => {
          const portable = source.replaceAll("\\", "/");
          return !portable.includes("/node_modules") && !portable.includes("/dist");
        },
      },
    );
  }
}

async function copyCompleteRegistryFixture(temporaryRoot: string): Promise<void> {
  await cp(path.join(frameworkRoot, "registry"), path.join(temporaryRoot, "registry"), { recursive: true });
  await copyPackagedSkills(temporaryRoot);
  await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
  await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
  await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
  await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
  await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
  await cp(
    path.join(frameworkRoot, ".codex", "agents"),
    path.join(temporaryRoot, ".codex", "agents"),
    { recursive: true },
  );
}

async function copyGovernanceFixture(temporaryRoot: string): Promise<void> {
  await mkdir(path.join(temporaryRoot, "docs"), { recursive: true });
  await cp(path.join(frameworkRoot, "registry", "sources"), path.join(temporaryRoot, "registry", "sources"), { recursive: true });
  await cp(path.join(frameworkRoot, "registry", "decisions"), path.join(temporaryRoot, "registry", "decisions"), { recursive: true });
  await cp(path.join(frameworkRoot, "registry", "context-governance.json"), path.join(temporaryRoot, "registry", "context-governance.json"));
  await mkdir(path.join(temporaryRoot, ".github"), { recursive: true });
  await cp(path.join(frameworkRoot, ".github", "CODEOWNERS"), path.join(temporaryRoot, ".github", "CODEOWNERS"));
  await cp(path.join(frameworkRoot, "docs", "AGENTS.md"), path.join(temporaryRoot, "docs", "AGENTS.md"));
  await cp(path.join(frameworkRoot, "AGENTS.md"), path.join(temporaryRoot, "AGENTS.md"));
  await copyGovernedSkills(temporaryRoot);
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
