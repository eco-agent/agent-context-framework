import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { checkTypeScriptProjects } from "../src/checks/typescript-projects.js";
import {
  collectWorktreeStatus,
  worktreeMutationDiagnostics,
  type WorktreeStatus,
} from "../src/git.js";

const execFileAsync = promisify(execFile);

test("root-referenced projects select one safe output mode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-context-ts-policy-"));
  try {
    await writeJson(path.join(root, "tsconfig.json"), {
      references: [
        { path: "./emitting" },
        { path: "./checking" },
        { path: "./unsafe" },
      ],
    });
    await writeJson(path.join(root, "emitting", "tsconfig.json"), {
      compilerOptions: { outDir: "dist" },
    });
    await writeJson(path.join(root, "checking", "tsconfig.json"), {
      compilerOptions: { noEmit: true },
    });
    await writeJson(path.join(root, "unsafe", "tsconfig.json"), {
      compilerOptions: {},
    });

    assert.deepEqual(await checkTypeScriptProjects(root), [
      "unsafe/tsconfig.json must set noEmit: true or a package-local dist outDir.",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project output cannot escape its package dist tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-context-ts-policy-"));
  try {
    await writeJson(path.join(root, "tsconfig.json"), {
      references: [{ path: "./unsafe" }],
    });
    await writeJson(path.join(root, "unsafe", "tsconfig.json"), {
      compilerOptions: { outDir: "." },
    });

    assert.deepEqual(await checkTypeScriptProjects(root), [
      "unsafe/tsconfig.json must emit inside its package-local dist directory.",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification reports additions and removals from Git status", () => {
  const initial: WorktreeStatus = {
    entries: [" M tracked.ts", "?? existing.txt"],
  };
  const final: WorktreeStatus = {
    entries: [" M tracked.ts", "?? generated.js"],
  };

  assert.deepEqual(worktreeMutationDiagnostics(initial, final), [
    "Verification created or changed Git state: ?? generated.js",
    "Verification removed or reverted Git state: ?? existing.txt",
  ]);
});

test("Git status snapshots expose files created during verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-context-git-policy-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    const initial = await collectWorktreeStatus(root);
    await writeFile(path.join(root, "generated.js"), "export {};\n", "utf8");
    const final = await collectWorktreeStatus(root);

    assert.deepEqual(worktreeMutationDiagnostics(initial, final), [
      "Verification created or changed Git state: ?? generated.js",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");
}
