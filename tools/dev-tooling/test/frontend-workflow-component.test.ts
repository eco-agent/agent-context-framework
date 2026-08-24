import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  addComponent,
  initProject,
  planProjectSelection,
} from "../src/context-installer.js";
import { bootstrapRuntime } from "../src/runtime-bootstrap.js";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");

test("optional frontend composition component installs, builds, and passes zero-model preflight", { timeout: 120_000 }, async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "acf-frontend-workflow-component-"));
  try {
    await initProject(projectRoot, frameworkRoot);
    const ordinaryFrontend = await planProjectSelection(projectRoot, frameworkRoot, ["frontend"]);
    assert.equal(ordinaryFrontend.resolvedComponents.includes("workflow-frontend-composition"), false);
    const componentSelection = await planProjectSelection(projectRoot, frameworkRoot, ["workflow-frontend-composition"]);
    assert.equal(componentSelection.resolvedComponents.includes("workflow-frontend-composition"), true);

    const installed = await addComponent(projectRoot, frameworkRoot, "workflow-frontend-composition");
    assert.equal(installed.plan.status, "ready");

    const runtimeRoot = path.join(projectRoot, ".agent-context", "runtime");
    await stat(path.join(runtimeRoot, "packages", "codex-workflow-runtime", "src", "index.ts"));
    await stat(path.join(runtimeRoot, "packages", "codex-frontend-workflows", "src", "preflight.ts"));
    const bootstrap = await bootstrapRuntime({ projectRoot, mode: "install-and-build" });
    assert.equal(bootstrap.status, "operational");

    const stdout = execFileSync(
      process.execPath,
      [path.join(runtimeRoot, "packages", "codex-frontend-workflows", "dist", "src", "preflight-cli.js")],
      { cwd: runtimeRoot, encoding: "utf8", windowsHide: true },
    );
    const result = JSON.parse(stdout) as {
      readonly status: string;
      readonly modelTurnsStarted: number;
      readonly checks: readonly { readonly id: string; readonly ok: boolean }[];
    };
    assert.equal(result.status, "ready");
    assert.equal(result.modelTurnsStarted, 0);
    assert.equal(result.checks.length, 5);
    assert.equal(result.checks.every((check) => check.ok), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
