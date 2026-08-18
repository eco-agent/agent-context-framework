import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  formatRepoContextBatchResult,
  formatRepoContextResult,
  MAX_BATCH_MODEL_VISIBLE_BYTES,
  RepoContextRuntime,
} from "../src/repo-context-runtime.js";

const execFileAsync = promisify(execFile);

test("repository context binds cumulative output to the active objective", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-context-runtime-"));
  try {
    await execFileAsync("git", ["init"], { cwd: root });
    await mkdir(path.join(root, ".codex", "work"), { recursive: true });
    const contractPath = ".codex/work/contract.md";
    const requestPath = ".codex/work/request.json";
    await writeFile(path.join(root, contractPath), "# Contract\n", "utf8");
    const request = {
      objectiveId: "76000000-0000-4000-8000-000000000001",
      objective: "Read bounded context",
      contractPath,
      baselineRevision: "a".repeat(40),
      supersedes: [],
      writablePaths: ["sample.txt"],
      readableReferences: ["sample.txt"],
      verificationProfile: "workflow",
      repairBudget: 0,
    };
    const requestBytes = Buffer.from(JSON.stringify(request), "utf8");
    await writeFile(path.join(root, requestPath), requestBytes);
    await writeFile(path.join(root, "sample.txt"), "alpha\nbeta\ngamma\n", "utf8");
    const gitDirectory = (await execFileAsync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-dir"],
      { cwd: root, encoding: "utf8" },
    )).stdout.trim();
    await mkdir(path.join(gitDirectory, "codex"), { recursive: true });
    const requestHash = sha256(requestBytes);
    await writeFile(
      path.join(gitDirectory, "codex", "active-task.json"),
      JSON.stringify({
        schemaVersion: 1,
        state: "attempt",
        objectiveId: request.objectiveId,
        leaseId: "76000000-0000-4000-8000-000000000002",
        runId: "76000000-0000-4000-8000-000000000003",
        workerId: "context-worker",
        attempt: 1,
        requestPath,
        requestHash,
        contractPath,
        contractHash: sha256(Buffer.from("# Contract\n", "utf8")),
        implementationContract: null,
        productPrecedentMaterialization: null,
        baselineRevision: request.baselineRevision,
        executionDirectory: root,
        envelopeArtifact: {
          hash: `sha256:${sha256(Buffer.from("envelope", "utf8"))}`,
          mediaType: "application/vnd.agent-context.task-envelope.v2+json",
          bytes: 8,
          label: "TaskEnvelopeV2 attempt 1",
        },
      }),
      "utf8",
    );

    const runtime = await RepoContextRuntime.open(root, { budgetBytes: 9 });
    const first = await runtime.execute({
      operation: "read",
      path: "sample.txt",
      limit: 1,
    });
    assert.equal(first.outcome, "success");
    assert.equal(first.metadata.objective?.id, request.objectiveId);
    assert.equal(first.metadata.objective?.cumulativeUtf8Bytes, 5);

    const second = await runtime.execute({
      operation: "search",
      path: ".",
      query: "missing",
    });
    assert.equal(second.outcome, "no_match");
    assert.match(formatRepoContextResult(second), /outcome=no_match/u);

    await runtime.execute({
      operation: "read",
      path: "sample.txt",
      startLine: 2,
      limit: 1,
    });
    const exhausted = await runtime.execute({
      operation: "read",
      path: "sample.txt",
      startLine: 3,
      limit: 1,
    });
    assert.equal(exhausted.outcome, "budget_exhausted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository context batches four operations under one response ceiling", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-context-batch-"));
  try {
    await execFileAsync("git", ["init"], { cwd: root });
    await writeFile(path.join(root, "source.txt"), `${"x".repeat(6_000)}\n`, "utf8");
    const runtime = await RepoContextRuntime.open(root, {
      budgetBytes: 100_000,
      unboundId: "batch-test",
    });
    const result = await runtime.execute({
      operation: "batch",
      requests: Array.from({ length: 4 }, () => ({
        operation: "read" as const,
        path: "source.txt",
        limit: 1,
      })),
    });
    assert.equal("results" in result, true);
    if (!("results" in result)) {
      return;
    }
    assert.equal(result.results.length, 4);
    assert.equal(result.metadata.returnedUtf8Bytes, 10_000);
    assert.equal(result.results.every((item) => item.outcome === "success"), true);
    assert.equal(
      Buffer.byteLength(formatRepoContextBatchResult(result), "utf8") <=
        MAX_BATCH_MODEL_VISIBLE_BYTES,
      true,
    );

    await assert.rejects(
      runtime.execute({
        operation: "batch",
        requests: Array.from({ length: 5 }, () => ({
          operation: "search" as const,
          path: ".",
          query: "missing",
        })),
      }),
      /require 1-4 requests/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
