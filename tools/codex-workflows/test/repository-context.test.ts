import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  decodeObjectiveId,
  MemoryLedger,
  ObjectiveRepositoryContext,
  RepositoryContextTool,
} from "../src/index.js";

test("read is line-bounded, byte-bounded, hashed, and cursor-resumable", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-read-"));
  try {
    const source = Array.from(
      { length: 250 },
      (_, index) => `line-${index + 1}`,
    ).join("\n");
    await writeFile(join(root, "source.txt"), source, "utf8");
    const tool = await RepositoryContextTool.open(root);

    const first = await tool.read({
      path: "source.txt",
      maxOutputBytes: 70,
    });
    assert.equal(first.outcome, "success");
    assert.equal(first.metadata.total, 250);
    assert.ok(first.metadata.returned <= 200);
    assert.ok(first.metadata.returnedUtf8Bytes <= 70);
    assert.equal(first.metadata.contentHash?.length, 64);
    assert.equal(first.metadata.truncated, true);
    assert.notEqual(first.metadata.nextCursor, null);
    const readCursor = requireCursor(first.metadata.nextCursor);

    const second = await tool.read({
      path: "source.txt",
      cursor: readCursor,
      maxOutputBytes: 70,
    });
    assert.equal(second.outcome, "success");
    assert.notEqual(second.content, first.content);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read requires an explicit override above 200 lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-all-"));
  try {
    await writeFile(
      join(root, "source.txt"),
      Array.from({ length: 210 }, () => "x").join("\n"),
      "utf8",
    );
    const tool = await RepositoryContextTool.open(root);

    await assert.rejects(
      tool.read({ path: "source.txt", lines: 201 }),
      /cannot exceed 200 without --all/u,
    );
    const expanded = await tool.read({
      path: "source.txt",
      all: true,
    });
    assert.equal(expanded.metadata.overrideUsed, true);
    assert.equal(expanded.metadata.returned, 210);
    assert.equal(expanded.metadata.nextCursor, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read rejects targets outside the repository root", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-root-"));
  const outside = await mkdtemp(join(tmpdir(), "repository-context-outside-"));
  try {
    await writeFile(join(outside, "source.txt"), "outside", "utf8");
    const tool = await RepositoryContextTool.open(root);
    await assert.rejects(
      tool.read({ path: join(outside, "source.txt") }),
      /outside the root/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("search preserves no-match exit semantics and paginates matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-search-"));
  try {
    await writeFile(
      join(root, "source.txt"),
      Array.from({ length: 55 }, (_, index) => `needle ${index + 1}`).join(
        "\n",
      ),
      "utf8",
    );
    const tool = await RepositoryContextTool.open(root);

    const missing = await tool.search({ path: ".", query: "absent" });
    assert.equal(missing.outcome, "no_match");
    assert.equal(missing.metadata.exitCode, 1);

    const fileScoped = await tool.search({
      path: "source.txt",
      query: "needle",
      contextLines: 0,
    });
    assert.equal(fileScoped.metadata.total, 55);

    const undersizedBudget = await tool.search({
      path: "source.txt",
      query: "needle",
      contextLines: 0,
      maxOutputBytes: 50,
    });
    assert.equal(undersizedBudget.outcome, "budget_exhausted");
    assert.equal(undersizedBudget.metadata.returned, 0);
    assert.notEqual(undersizedBudget.metadata.nextCursor, null);

    const first = await tool.search({
      path: ".",
      query: "needle",
      contextLines: 0,
    });
    assert.equal(first.outcome, "success");
    assert.equal(first.metadata.total, 55);
    assert.equal(first.metadata.returned, 50);
    assert.notEqual(first.metadata.nextCursor, null);
    assert.ok(first.metadata.returnedUtf8Bytes <= 10_000);
    const searchCursor = requireCursor(first.metadata.nextCursor);

    const second = await tool.search({
      path: ".",
      query: "needle",
      cursor: searchCursor,
      contextLines: 0,
    });
    assert.equal(second.metadata.returned, 5);
    assert.equal(second.metadata.nextCursor, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy CLI model footers report success and no-match outcomes", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-cli-"));
  try {
    await writeFile(join(root, "source.txt"), "needle\n", "utf8");
    const cliPath = fileURLToPath(
      new URL("../src/context-cli.js", import.meta.url),
    );

    const read = spawnSync(
      process.execPath,
      [cliPath, "read", "--path", "source.txt", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(read.status, 0);
    assert.match(read.stdout, /\[context outcome=success /u);

    const missing = spawnSync(
      process.execPath,
      [
        cliPath,
        "search",
        "--query",
        "absent",
        "--path",
        ".",
        "--root",
        root,
      ],
      { encoding: "utf8" },
    );
    assert.equal(missing.status, 0);
    assert.match(missing.stdout, /\[context outcome=no_match /u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("optimization skill routes bounded repository context without --all", async () => {
  const skillPath = fileURLToPath(
    new URL(
      "../../../../.codex/skills/optimize-codex-sessions/SKILL.md",
      import.meta.url,
    ),
  );
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /`mcp__repo_context__repo_context`/u);
  assert.match(skill, /batch up to four requests in one call/u);
  assert.match(skill, /dist\/src\/context-cli\.js/u);
  assert.match(skill, /Follow `nextCursor` to continue/u);
  assert.equal(skill.includes("pnpm --silent context"), false);
  assert.equal(skill.includes("--all"), false);
});

test("objective budget is inherited from ledger evidence across instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-budget-"));
  try {
    await writeFile(join(root, "source.txt"), "abcdefghijklmnopqrstuvwxyz", "utf8");
    const tool = await RepositoryContextTool.open(root);
    const ledger = new MemoryLedger("budget-test");
    const objective = {
      objectiveId: decodeObjectiveId("70000000-0000-4000-8000-000000000003"),
      maxRepositoryOutputBytes: 20,
    } as const;
    const firstContext = new ObjectiveRepositoryContext(
      tool,
      ledger,
      objective,
    );

    const first = await firstContext.read({
      path: "source.txt",
      maxOutputBytes: 12,
    });
    assert.equal(first.metadata.returnedUtf8Bytes, 12);
    const budgetCursor = requireCursor(first.metadata.nextCursor);

    const resumedContext = new ObjectiveRepositoryContext(
      tool,
      ledger,
      objective,
    );
    const second = await resumedContext.read({
      path: "source.txt",
      cursor: budgetCursor,
    });
    assert.equal(second.metadata.returnedUtf8Bytes, 8);

    const exhausted = await resumedContext.read({ path: "source.txt" });
    assert.equal(exhausted.outcome, "budget_exhausted");
    assert.equal(exhausted.metadata.exitCode, 126);

    const serializedLedger = JSON.stringify(await ledger.list());
    assert.equal(serializedLedger.includes("abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(serializedLedger.includes("source.txt"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent nested readers share one aggregate objective budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "repository-context-concurrent-"));
  try {
    await writeFile(join(root, "source.txt"), "abcdefghijklmnopqrstuvwxyz", "utf8");
    const tool = await RepositoryContextTool.open(root);
    const ledger = new MemoryLedger("concurrent-budget");
    const objective = {
      objectiveId: decodeObjectiveId("70000000-0000-4000-8000-000000000003"),
      maxRepositoryOutputBytes: 10,
    } as const;
    const left = new ObjectiveRepositoryContext(tool, ledger, objective);
    const right = new ObjectiveRepositoryContext(tool, ledger, objective);

    const results = await Promise.all([
      left.read({ path: "source.txt" }),
      right.read({ path: "source.txt" }),
    ]);

    assert.deepEqual(
      results.map((result) => result.outcome),
      ["success", "budget_exhausted"],
    );
    assert.equal(
      results.reduce(
        (total, result) => total + result.metadata.returnedUtf8Bytes,
        0,
      ),
      10,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function requireCursor(value: string | null): string {
  assert.notEqual(value, null);
  return value as string;
}
