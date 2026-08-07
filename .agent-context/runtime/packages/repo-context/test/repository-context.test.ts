import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RepositoryContextTool } from "../src/index.js";

test("read is line-bounded, byte-bounded, and cursor-resumable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-read-"));
  try {
    await writeFile(
      path.join(root, "source.txt"),
      Array.from({ length: 205 }, (_, index) => `line-${index + 1}`).join("\n"),
      "utf8",
    );
    const tool = await RepositoryContextTool.open(root);
    const first = await tool.read({ path: "source.txt" });
    assert.equal(first.outcome, "success");
    assert.equal(first.metadata.returned, 200);
    assert.notEqual(first.metadata.nextCursor, null);
    const cursor = first.metadata.nextCursor;
    if (cursor === null) {
      throw new Error("Expected a continuation cursor.");
    }
    const second = await tool.read({
      path: "source.txt",
      cursor,
    });
    assert.equal(second.metadata.returned, 5);
    assert.match(second.content, /line-205/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository context rejects targets outside its explicit root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "agent-context-outside-"));
  try {
    await writeFile(path.join(outside, "source.txt"), "outside", "utf8");
    const tool = await RepositoryContextTool.open(root);
    await assert.rejects(
      tool.read({ path: path.join(outside, "source.txt") }),
      /outside the root/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("fixed-string search keeps no-match distinct from failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-search-"));
  try {
    await writeFile(path.join(root, "source.txt"), "present\n", "utf8");
    const tool = await RepositoryContextTool.open(root);
    const result = await tool.search({ query: "missing", path: "." });
    assert.equal(result.outcome, "no_match");
    assert.equal(result.metadata.exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
