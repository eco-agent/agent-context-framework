import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyContextTransaction,
  CONTEXT_TRANSACTION_STAGE_PATH,
  inspectContextTransaction,
  resumeContextTransaction,
  type ContextMutation,
  type ContextTransactionMutationBoundary,
} from "../src/context-transaction.js";

const mutations: readonly ContextMutation[] = [
  { operation: "write", targetPath: "existing.txt", content: "after\n" },
  { operation: "write", targetPath: "nested/new.txt", content: "new\n" },
  { operation: "delete", targetPath: "delete.txt" },
];

test("failure injection after every transaction mutation boundary remains recoverable", async () => {
  const boundaryFixture = await createTransactionFixture();
  const boundaries: ContextTransactionMutationBoundary[] = [];
  try {
    await applyContextTransaction(boundaryFixture, "update", "0.2.0", mutations, {
      afterMutation: (boundary) => {
        boundaries.push(boundary);
      },
    });
    assert.deepEqual(boundaries.map((boundary) => boundary.kind), [
      "stage-root-created",
      "write-staged",
      "write-staged",
      "journal-staged",
      "journal-published",
      "target-parent-created",
      "target-written",
      "target-parent-created",
      "target-written",
      "target-deleted",
      "stage-removed",
      "journal-removed",
    ]);
  } finally {
    await rm(boundaryFixture, { recursive: true, force: true });
  }

  for (const [failureIndex, expectedBoundary] of boundaries.entries()) {
    const projectRoot = await createTransactionFixture();
    let boundaryIndex = 0;
    try {
      await assert.rejects(
        applyContextTransaction(projectRoot, "update", "0.2.0", mutations, {
          afterMutation: (boundary) => {
            if (boundaryIndex === failureIndex) {
              throw new Error(`Injected failure after ${boundary.kind}.`);
            }
            boundaryIndex += 1;
          },
        }),
        new RegExp(`Injected failure after ${expectedBoundary.kind}`, "u"),
      );

      const inspection = await inspectContextTransaction(projectRoot);
      if (inspection.status === "resumable") {
        await resumeContextTransaction(projectRoot);
      } else {
        assert.equal(inspection.status, "none");
        if (!(await hasDesiredState(projectRoot))) {
          await applyContextTransaction(projectRoot, "update", "0.2.0", mutations);
        }
      }
      assert.equal(await hasDesiredState(projectRoot), true);
      assert.equal((await inspectContextTransaction(projectRoot)).status, "none");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test("an existing stage claim blocks a second writer without deleting its files", async () => {
  const projectRoot = await createTransactionFixture();
  const stageRoot = path.join(projectRoot, CONTEXT_TRANSACTION_STAGE_PATH);
  const sentinelPath = path.join(stageRoot, "winner.staged");
  try {
    await mkdir(stageRoot, { recursive: true });
    await writeFile(sentinelPath, "winner\n", "utf8");
    await assert.rejects(
      applyContextTransaction(
        projectRoot,
        "capsule",
        "0.14.0",
        [{ operation: "write", targetPath: "capsule.txt", content: "capsule\n" }],
      ),
      /incomplete context transaction exists/u,
    );
    assert.equal(await readFile(sentinelPath, "utf8"), "winner\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("transaction inspection discards pre-journal staging and blocks target drift", async () => {
  const orphanedRoot = await createTransactionFixture();
  try {
    const stageRoot = path.join(orphanedRoot, CONTEXT_TRANSACTION_STAGE_PATH);
    await mkdir(stageRoot, { recursive: true });
    await writeFile(path.join(stageRoot, "partial.staged"), "partial");
    assert.equal((await inspectContextTransaction(orphanedRoot)).status, "discardable");
    assert.deepEqual(await resumeContextTransaction(orphanedRoot), {
      status: "discarded",
      recoveredPaths: [],
    });
    assert.equal((await inspectContextTransaction(orphanedRoot)).status, "none");
    assert.equal(await readFile(path.join(orphanedRoot, "existing.txt"), "utf8"), "before\n");
  } finally {
    await rm(orphanedRoot, { recursive: true, force: true });
  }

  const driftedRoot = await createTransactionFixture();
  try {
    await assert.rejects(
      applyContextTransaction(driftedRoot, "update", "0.2.0", mutations, {
        afterMutation: (boundary) => {
          if (boundary.kind === "journal-published") throw new Error("interrupt");
        },
      }),
      /interrupt/u,
    );
    await writeFile(path.join(driftedRoot, "existing.txt"), "tampered\n");
    const inspection = await inspectContextTransaction(driftedRoot);
    assert.equal(inspection.status, "blocked");
    assert.match(inspection.detail, /matches neither journal boundary/u);
    await assert.rejects(resumeContextTransaction(driftedRoot), /cannot be resumed safely/u);
    assert.equal(await readFile(path.join(driftedRoot, "existing.txt"), "utf8"), "tampered\n");
  } finally {
    await rm(driftedRoot, { recursive: true, force: true });
  }
});

test("binary capsule writes keep exact bytes across interrupted recovery", async () => {
  const projectRoot = await createTransactionFixture();
  const capsuleBytes = Buffer.from([0x41, 0x43, 0x46, 0x00, 0x0d, 0x0a, 0xff]);
  try {
    await assert.rejects(
      applyContextTransaction(
        projectRoot,
        "capsule",
        "0.14.0",
        [{
          operation: "write",
          targetPath: ".agent-context/capsule.acf",
          content: capsuleBytes,
        }],
        {
          afterMutation: (boundary) => {
            if (boundary.kind === "journal-published") throw new Error("interrupt binary write");
          },
        },
      ),
      /interrupt binary write/u,
    );
    assert.equal((await inspectContextTransaction(projectRoot)).status, "resumable");
    await resumeContextTransaction(projectRoot);
    assert.equal(
      (await readFile(path.join(projectRoot, ".agent-context", "capsule.acf"))).equals(
        capsuleBytes,
      ),
      true,
    );
    assert.equal((await inspectContextTransaction(projectRoot)).status, "none");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("promotion revalidates a symbolic-link ancestor immediately before rename", async (t) => {
  const projectRoot = await createTransactionFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "agent-context-promotion-outside-"));
  const linked = path.join(projectRoot, "linked");
  try {
    try {
      await symlink(outside, linked, "junction");
      await unlink(linked);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        t.skip("This Windows environment does not permit junction creation.");
        return;
      }
      throw error;
    }

    await assert.rejects(
      applyContextTransaction(
        projectRoot,
        "update",
        "0.2.0",
        [{ operation: "write", targetPath: "linked/tool.md", content: "safe\n" }],
        {
          afterMutation: async (boundary) => {
            if (boundary.kind !== "target-parent-created") return;
            await rm(linked, { recursive: true });
            await symlink(outside, linked, "junction");
          },
        },
      ),
      /traverses symbolic link/u,
    );
    await assert.rejects(readFile(path.join(outside, "tool.md")), /ENOENT/u);
    assert.equal((await inspectContextTransaction(projectRoot)).status, "blocked");

    await unlink(linked);
    await mkdir(linked);
    assert.equal((await inspectContextTransaction(projectRoot)).status, "resumable");
    await resumeContextTransaction(projectRoot);
    assert.equal(await readFile(path.join(linked, "tool.md"), "utf8"), "safe\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

async function createTransactionFixture(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-transaction-"));
  await writeFile(path.join(projectRoot, "existing.txt"), "before\n");
  await writeFile(path.join(projectRoot, "delete.txt"), "delete\n");
  return projectRoot;
}

async function hasDesiredState(projectRoot: string): Promise<boolean> {
  try {
    return await readFile(path.join(projectRoot, "existing.txt"), "utf8") === "after\n" &&
      await readFile(path.join(projectRoot, "nested", "new.txt"), "utf8") === "new\n" &&
      !(await fileExists(path.join(projectRoot, "delete.txt")));
  } catch {
    return false;
  }
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await readFile(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
