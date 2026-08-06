import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildContextRegistry, checkContextRegistry } from "../src/context-registry-builder.js";
import { checkContextGovernance } from "../src/context-governance.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("Wave 1 registry is deterministic, licensed, and excludes generated Tailwind cache", async () => {
  const first = await buildContextRegistry(frameworkRoot);
  const second = await buildContextRegistry(frameworkRoot);
  assert.deepEqual(first, second);
  await checkContextRegistry(frameworkRoot);

  const tailwind = first.components.find((component) => component.name === "skill-responsive-css-architect");
  assert.ok(tailwind);
  assert.equal(tailwind.artifacts.some((artifact) => artifact.sourcePath.includes("tailwind-docs/cache/")), false);
  const selected = first.components.filter((component) => component.name.startsWith("skill-"));
  assert.equal(selected.length, 8);
  for (const component of first.components) {
    const targets = new Set(component.artifacts.map((artifact) => artifact.targetPath));
    for (const license of component.licenses) {
      if (license.kind === "third-party") assert.equal(targets.has(license.noticePath), true);
    }
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
