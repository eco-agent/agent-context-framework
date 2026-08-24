import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
const runtimeRoot = path.join(frameworkRoot, ".agent-context", "runtime");

test("isolated runtime owns an exact static package graph", async () => {
  const manifest = await readJson(path.join(runtimeRoot, "package.json"));
  assert.deepEqual(
    {
      packageManager: manifest.packageManager,
      engines: manifest.engines,
      dependencies: manifest.dependencies,
      devDependencies: manifest.devDependencies,
    },
    {
      packageManager: "pnpm@10.22.0",
      engines: { node: "24.14.0" },
      dependencies: undefined,
      devDependencies: {
        "@types/node": "24.13.3",
        typescript: "7.0.2",
      },
    },
  );

  const expectedDependencies = new Map<string, readonly string[]>([
    ["@agent-context-runtime/shared", []],
    ["@agent-context-runtime/policy", ["@agent-context-runtime/shared"]],
    ["@agent-context-runtime/repo-context", [
      "@agent-context-runtime/shared",
      "@modelcontextprotocol/server",
      "zod",
    ]],
    ["@agent-context-runtime/hooks", ["@agent-context-runtime/shared"]],
  ]);
  for (const directory of ["shared", "policy", "repo-context", "hooks"]) {
    const packageManifest = await readJson(
      path.join(runtimeRoot, "packages", directory, "package.json"),
    );
    const packageName = requiredString(packageManifest.name, "runtime package name");
    assert.deepEqual(
      Object.keys(record(packageManifest.dependencies)).sort(),
      expectedDependencies.get(packageName),
    );
  }
});

test("runtime base excludes host orchestration while its lock includes optional workflow dependencies", async () => {
  const files = await sourceFiles(runtimeRoot);
  const forbidden = [
    "@agent-context/objective-kernel",
    "@agent-context/objective-runtime",
    "pg-boss",
    "postgres",
    "tools/codex-workflows",
    "packages/objective-",
  ];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const token of forbidden) {
      assert.equal(
        content.includes(token),
        false,
        `${path.relative(runtimeRoot, file)} contains forbidden ${token}`,
      );
    }
  }
  const lock = await readFile(path.join(runtimeRoot, "pnpm-lock.yaml"), "utf8");
  assert.equal(lock.includes("packages/codex-workflow-runtime:"), true);
  assert.equal(lock.includes("packages/codex-frontend-workflows:"), true);
  assert.equal(lock.includes("@openai/codex-sdk@0.145.0"), true);
  for (const file of files.filter((candidate) => !candidate.endsWith("pnpm-lock.yaml"))) {
    assert.equal(
      (await readFile(file, "utf8")).includes("@openai/codex-sdk"),
      false,
      `${path.relative(runtimeRoot, file)} contains host SDK source dependency`,
    );
  }
  const hostWorkspace = await readFile(
    path.join(frameworkRoot, "pnpm-workspace.yaml"),
    "utf8",
  );
  const hostTypeScript = await readFile(
    path.join(frameworkRoot, "tsconfig.json"),
    "utf8",
  );
  assert.equal(hostWorkspace.includes(".agent-context/runtime"), false);
  assert.equal(hostTypeScript.includes(".agent-context/runtime"), false);
});

async function sourceFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(candidate);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") ||
          entry.name.endsWith(".json") ||
          entry.name.endsWith(".yaml"))
      ) {
        files.push(candidate);
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function readJson(candidate: string): Promise<Record<string, unknown>> {
  return record(JSON.parse(await readFile(candidate, "utf8")) as unknown);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
