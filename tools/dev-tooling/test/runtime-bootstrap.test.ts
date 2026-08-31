import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bootstrapRuntime,
  type RuntimeBootstrapExecutor,
  type RuntimeBootstrapStep,
} from "../src/runtime-bootstrap.js";
import { parseContextInstallerArguments } from "../src/context-installer-cli.js";

test("runtime bootstrap exposes only fixed install, build, and doctor steps", async () => {
  const fixture = await createRuntimeFixture();
  const calls: RuntimeBootstrapStep[] = [];
  const executor: RuntimeBootstrapExecutor = {
    async run(step) {
      calls.push(step);
      return {
        stdout: JSON.stringify({
          status: step === "doctor" ? "operational" : "build-missing",
          operational: step === "doctor",
          message: step === "doctor" ? "Runtime is operational." : "Pending.",
        }),
      };
    },
  };
  try {
    const hostManifestBefore = await readFile(
      path.join(fixture.root, "package.json"),
      "utf8",
    );
    const hostLockBefore = await readFile(path.join(fixture.root, "host.lock"), "utf8");
    const result = await bootstrapRuntime(
      { projectRoot: fixture.root, mode: "install-and-build" },
      executor,
    );
    assert.deepEqual(calls, ["install", "build", "doctor"]);
    assert.equal(result.operational, true);
    assert.equal(
      await readFile(path.join(fixture.root, "package.json"), "utf8"),
      hostManifestBefore,
    );
    assert.equal(await readFile(path.join(fixture.root, "host.lock"), "utf8"), hostLockBefore);
  } finally {
    await fixture.remove();
  }
});

test("runtime bootstrap restores packaged protocol entrypoints after a source build", async () => {
  const fixture = await createRuntimeFixture();
  const entrypoints = [
    "packages/hooks/dist/src/codex-cli.js",
    "packages/repo-context/dist/src/mcp-cli.js",
  ];
  try {
    for (const [index, relativePath] of entrypoints.entries()) {
      const entrypoint = path.join(fixture.root, ".agent-context", "runtime", relativePath);
      await mkdir(path.dirname(entrypoint), { recursive: true });
      await writeFile(entrypoint, `packaged ${index}\n`, "utf8");
    }
    const result = await bootstrapRuntime(
      { projectRoot: fixture.root, mode: "install-and-build" },
      {
        async run(step, runtimeRoot) {
          if (step === "build") {
            for (const relativePath of entrypoints) {
              await writeFile(path.join(runtimeRoot, relativePath), "compiled source\n", "utf8");
            }
          }
          return {
            stdout: JSON.stringify({
              status: step === "doctor" ? "operational" : "build-missing",
              operational: step === "doctor",
              message: step === "doctor" ? "Runtime is operational." : "Pending.",
            }),
          };
        },
      },
    );
    assert.equal(result.operational, true);
    for (const [index, relativePath] of entrypoints.entries()) {
      assert.equal(
        await readFile(
          path.join(fixture.root, ".agent-context", "runtime", relativePath),
          "utf8",
        ),
        `packaged ${index}\n`,
      );
    }
  } finally {
    await fixture.remove();
  }
});

test("runtime bootstrap restores a packaged entrypoint when the source build fails", async () => {
  const fixture = await createRuntimeFixture();
  const relativePath = "packages/hooks/dist/src/codex-cli.js";
  const entrypoint = path.join(fixture.root, ".agent-context", "runtime", relativePath);
  try {
    await mkdir(path.dirname(entrypoint), { recursive: true });
    await writeFile(entrypoint, "packaged hook\n", "utf8");
    await assert.rejects(
      bootstrapRuntime(
        { projectRoot: fixture.root, mode: "install-and-build" },
        {
          async run(step, runtimeRoot) {
            if (step === "build") {
              await writeFile(path.join(runtimeRoot, relativePath), "partial build\n", "utf8");
              throw new Error("source build failed");
            }
            return { stdout: "" };
          },
        },
      ),
      /source build failed/u,
    );
    assert.equal(await readFile(entrypoint, "utf8"), "packaged hook\n");
  } finally {
    await fixture.remove();
  }
});

test("--no-install reports materialized runtime state without installing", async () => {
  const fixture = await createRuntimeFixture();
  const calls: RuntimeBootstrapStep[] = [];
  try {
    const result = await bootstrapRuntime(
      { projectRoot: fixture.root, mode: "no-install" },
      {
        async run(step) {
          calls.push(step);
          return {
            stdout: JSON.stringify({
              status: "dependencies-missing",
              operational: false,
              message: "Runtime source is materialized but dependencies are not installed.",
            }),
          };
        },
      },
    );
    assert.deepEqual(calls, ["doctor"]);
    assert.equal(result.status, "dependencies-missing");
    assert.equal(result.operational, false);
    assert.deepEqual(
      parseContextInstallerArguments(
        ["bootstrap-runtime", "--cwd", fixture.root, "--no-install"],
        "D:/outside",
      ),
      {
        command: "bootstrap-runtime",
        projectRoot: fixture.root,
        component: null,
        output: "text",
        mode: "no-install",
      },
    );
  } finally {
    await fixture.remove();
  }
});

test("runtime bootstrap resolves pinned pnpm through Corepack without PNPM_HOME", async () => {
  const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
  const fixture = await createMaterializedRuntimeFixture(frameworkRoot);
  const previousPnpmHome = process.env.PNPM_HOME;
  delete process.env.PNPM_HOME;
  try {
    const result = await bootstrapRuntime({
      projectRoot: fixture.root,
      mode: "install-and-build",
    });
    assert.equal(result.status, "operational");
    assert.equal(result.operational, true);
  } finally {
    if (previousPnpmHome === undefined) {
      delete process.env.PNPM_HOME;
    } else {
      process.env.PNPM_HOME = previousPnpmHome;
    }
    await fixture.remove();
  }
});

async function createMaterializedRuntimeFixture(
  frameworkRoot: string,
): Promise<{
  readonly root: string;
  readonly remove: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-materialized-runtime-"));
  const sourceRoot = path.join(frameworkRoot, ".agent-context", "runtime");
  const targetRoot = path.join(root, ".agent-context", "runtime");
  await mkdir(path.dirname(targetRoot), { recursive: true });
  await cp(sourceRoot, targetRoot, {
    recursive: true,
    filter(source) {
      const segments = path.relative(sourceRoot, source).split(path.sep);
      return !segments.includes("node_modules") && !segments.includes("dist");
    },
  });
  return {
    root,
    remove: async () => await rm(root, { recursive: true, force: true }),
  };
}

async function createRuntimeFixture(): Promise<{
  readonly root: string;
  readonly remove: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-bootstrap-"));
  const runtimeRoot = path.join(root, ".agent-context", "runtime");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"host"}\n', "utf8");
  await writeFile(path.join(root, "host.lock"), "host lock\n", "utf8");
  await writeFile(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify({
      private: true,
      packageManager: "pnpm@10.22.0",
      engines: { node: "24.14.0" },
    })}\n`,
    "utf8",
  );
  await writeFile(path.join(runtimeRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  return {
    root,
    remove: async () => await rm(root, { recursive: true, force: true }),
  };
}
