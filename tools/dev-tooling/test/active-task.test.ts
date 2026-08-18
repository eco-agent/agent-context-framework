import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { artifactHash, leaseId, objectiveId, runId } from "@agent-context/objective-kernel";
import {
  activateTaskAttempt,
  bindActiveTaskSession,
  loadActiveTask,
  prepareTaskActivation,
  releaseActiveTaskAttempt,
} from "../src/active-task.js";
import { runCommand } from "../src/workspace.js";

test("active task state is a disposable projection of one leased objective attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-active-task-"));
  try {
    await mkdir(path.join(root, ".codex", "work"), { recursive: true });
    await writeFile(path.join(root, ".codex", "work", "contract.md"), "# Contract\n");
    await writeFile(
      path.join(root, ".codex", "work", "implementation.json"),
      JSON.stringify({ schemaVersion: 2, replacements: [], skills: [], productPrecedent: null }),
    );
    await writeFile(path.join(root, ".codex", "work", "unrelated.md"), "# Unrelated\n");
    await runCommand("git", ["init"], { cwd: root });
    await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await runCommand("git", ["config", "user.name", "Test"], { cwd: root });
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "-m", "fixture"], { cwd: root });
    const baselineRevision = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
    const requestPath = ".codex/work/request.json";
    const id = objectiveId("74000000-0000-4000-8000-000000000001");
    await writeFile(
      path.join(root, requestPath),
      JSON.stringify({
        objectiveId: id,
        objective: "Implement one task",
        contractPath: ".codex/work/contract.md",
        implementationContractPath: ".codex/work/implementation.json",
        baselineRevision,
        supersedes: [],
        writablePaths: ["tools/sample/**"],
        readableReferences: [],
        verificationProfile: "workflow",
        repairBudget: 0,
      }),
    );
    const prepared = await prepareTaskActivation(root, requestPath);
    const bytes = Buffer.from("test envelope", "utf8");
    const attempt = {
      schemaVersion: 1 as const,
      state: "attempt" as const,
      objectiveId: id,
      leaseId: leaseId("74000000-0000-4000-8000-000000000002"),
      runId: runId("74000000-0000-4000-8000-000000000003"),
      workerId: "test-worker",
      attempt: 1,
      ...prepared.binding,
      executionDirectory: await realpath(root),
      envelopeArtifact: {
        hash: artifactHash(
          `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        ),
        mediaType: "application/vnd.agent-context.task-envelope.v2+json",
        bytes: bytes.byteLength,
        label: "test envelope",
      },
    };

    const activation = await activateTaskAttempt(root, attempt);
    assert.equal(activation.binding.objectiveId, id);
    assert.equal(activation.binding.contractPath, ".codex/work/contract.md");
    assert.equal(
      activation.binding.implementationContract?.path,
      ".codex/work/implementation.json",
    );
    assert.doesNotMatch(await readFile(activation.bindingPath, "utf8"), /unrelated/u);
    assert.equal((await loadActiveTask(root))?.binding.leaseId, attempt.leaseId);

    const session = await bindActiveTaskSession(root, attempt, "opaque-thread-token");
    assert.equal(session.binding.sessionId, "opaque-thread-token");
    assert.equal(
      (await loadActiveTask(root, "opaque-thread-token"))?.binding.objectiveId,
      id,
    );
    await writeFile(
      path.join(root, ".codex", "work", "implementation.json"),
      JSON.stringify({ schemaVersion: 2, replacements: [{ path: "drift.ts", disposition: "remove" }], skills: [], productPrecedent: null }),
    );
    await assert.rejects(
      loadActiveTask(root, "opaque-thread-token"),
      /source changed after attempt projection/u,
    );

    await releaseActiveTaskAttempt(root, attempt);
    assert.equal(await loadActiveTask(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
