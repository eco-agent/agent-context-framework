import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectTaskPreflight,
  formatTaskPreflight,
} from "../src/task-preflight.js";
import { materializeProductPrecedent } from "../src/product-precedent-materializer.js";
import { runCommand } from "../src/workspace.js";

test("task preflight binds a request to repository state without writing context files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-preflight-"));
  const requestPath = path.join(root, "request.json");
  const previousRequestPath = path.join(root, "previous-request.json");
  try {
    await mkdir(path.join(root, "tools", "sample"), { recursive: true });
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
    await writeFile(path.join(root, "AGENTS.md"), "# Test instructions\n");
    await writeFile(path.join(root, "LICENSE"), "MIT License\n\nPermission is hereby granted.\n");
    const upstreamBoard = "export const Board = () => 'upstream';\n";
    await writeFile(path.join(root, "tools", "sample", "upstream-board.tsx"), upstreamBoard);
    await writeFile(
      path.join(root, "tools", "sample", "package.json"),
      JSON.stringify({ name: "@agent-context/sample", private: true }),
    );
    await runCommand("git", ["init"], { cwd: root });
    await runCommand(
      "git",
      ["remote", "add", "origin", "https://github.com/example/issues-clone.git"],
      { cwd: root },
    );
    await runCommand("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    await runCommand("git", ["config", "user.name", "Test"], { cwd: root });
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "-m", "fixture"], { cwd: root });
    const head = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
    const request = {
      contractPath: "AGENTS.md",
      objective: "Inspect one bounded task",
      baselineRevision: head,
      supersedes: [],
      writablePaths: ["tools/sample/**"],
      readableReferences: ["AGENTS.md"],
      verificationProfile: "workspace-structure",
      repairBudget: 0,
    } as const;
    await writeFile(
      previousRequestPath,
      JSON.stringify({
        ...request,
        objectiveId: "61000000-0000-4000-8000-000000000001",
        objective: "Inspect the previous bounded task",
      }),
      "utf8",
    );
    await writeFile(
      requestPath,
      JSON.stringify({
        ...request,
        objectiveId: "61000000-0000-4000-8000-000000000002",
        supersedes: ["previous-request.json"],
      }),
      "utf8",
    );
    const preflight = await collectTaskPreflight(root, requestPath, []);
    assert.equal(preflight.baselineIsAncestor, true);
    assert.equal(preflight.objectiveId, "61000000-0000-4000-8000-000000000002");
    assert.deepEqual(preflight.supersedes, [
      {
        requestPath: "previous-request.json",
        objectiveId: "61000000-0000-4000-8000-000000000001",
      },
    ]);
    assert.equal(preflight.references[0]?.exists, true);
    assert.deepEqual(preflight.instructions, ["AGENTS.md"]);
    assert.equal(preflight.workspacePackages[0]?.name, "@agent-context/sample");
    assert.match(formatTaskPreflight(preflight), /Working tree:/u);
    assert.match(
      formatTaskPreflight(preflight),
      /Objective ID: 61000000-0000-4000-8000-000000000002/u,
    );
    assert.match(
      formatTaskPreflight(preflight),
      /previous-request\.json \(61000000-0000-4000-8000-000000000001\)/u,
    );

    const ordinaryFrontendPath = path.join(root, "ordinary-frontend-request.json");
    await writeFile(
      ordinaryFrontendPath,
      JSON.stringify({
        ...request,
        objectiveId: "61000000-0000-4000-8000-000000000004",
        verificationProfile: "frontend",
      }),
    );
    const ordinaryFrontend = await collectTaskPreflight(root, ordinaryFrontendPath, []);
    assert.equal(ordinaryFrontend.implementationContract, null);

    const implementationContractPath = "implementation.json";
    const evidencePath = "precedent.md";
    const skillPath = ".codex/skills/product-skill/SKILL.md";
    const materializationPath = "materialization.json";
    await writeFile(path.join(root, evidencePath), "# GitHub Issues\nUse list/detail topology.\n");
    await mkdir(path.dirname(path.join(root, skillPath)), { recursive: true });
    await writeFile(
      path.join(root, skillPath),
      "---\nname: product-skill\ndescription: Use pinned product evidence.\n---\n",
    );
    await writeFile(
      path.join(root, implementationContractPath),
      JSON.stringify({
        schemaVersion: 2,
        replacements: [{ path: "tools/sample/legacy-board.ts", disposition: "remove" }],
        skills: [skillPath],
        productPrecedent: {
          product: "GitHub Issues",
          source: {
            repository: "https://github.com/example/issues-clone.git",
            revision: head,
            license: "MIT",
          },
          checkoutPath: ".",
          licensePath: "LICENSE",
          evidencePath,
          materializationPath,
          adopt: ["list/detail topology"],
          deviations: [],
          implementation: {
            kind: "reuse",
            licenseNoticePath: "tools/sample/THIRD_PARTY_LICENSE.txt",
            files: [{
              sourcePath: "tools/sample/upstream-board.tsx",
              targetPath: "tools/sample/adopted-board.tsx",
              mode: "copy",
            }],
          },
        },
      }),
    );
    await materializeProductPrecedent(root, implementationContractPath);
    const frontendRequestPath = path.join(root, "frontend-request.json");
    await writeFile(
      frontendRequestPath,
      JSON.stringify({
        ...request,
        objectiveId: "61000000-0000-4000-8000-000000000003",
        implementationContractPath,
        readableReferences: [
          evidencePath,
          skillPath,
          materializationPath,
          "tools/sample/upstream-board.tsx",
        ],
        verificationProfile: "product-topology",
      }),
    );
    const frontend = await collectTaskPreflight(root, frontendRequestPath, []);
    assert.equal(frontend.implementationContract?.contract.productPrecedent?.product, "GitHub Issues");
    assert.match(formatTaskPreflight(frontend), /Product precedent: GitHub Issues/u);
    assert.match(formatTaskPreflight(frontend), /Precedent materialization: materialization\.json/u);
    assert.equal(
      await readFile(path.join(root, "tools/sample/adopted-board.tsx"), "utf8"),
      upstreamBoard,
    );
    assert.equal(
      await readFile(path.join(root, "tools/sample/THIRD_PARTY_LICENSE.txt"), "utf8"),
      await readFile(path.join(root, "LICENSE"), "utf8"),
    );

    await writeFile(
      path.join(root, implementationContractPath),
      JSON.stringify({ schemaVersion: 2, replacements: [], skills: [skillPath], productPrecedent: null }),
    );
    await assert.rejects(
      collectTaskPreflight(root, frontendRequestPath, []),
      /require a product precedent/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
