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
