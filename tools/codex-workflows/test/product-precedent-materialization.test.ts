import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { FilesystemArtifactStore } from "@agent-context/objective-runtime";
import type { ImplementationContractV2 } from "@agent-context/repo-policy";

import {
  deriveProductPrecedentMaterialization,
  normalizeGitRepositoryUrl,
  publishVerifiedPrecedentEvidence,
  VerifiedProductPrecedentMaterializationV2,
} from "../src/product-precedent-materialization.js";

const execFileAsync = promisify(execFile);

test("materialization derives and reverifies Git origin, ancestry, license, and evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-precedent-"));
  try {
    const repository = "https://github.com/example/product.git";
    await git(root, ["init"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test"]);
    await git(root, ["remote", "add", "origin", repository]);
    await writeFile(path.join(root, "LICENSE"), "The MIT License (MIT)\n\nPermission granted.\n");
    const pinnedBoard = Buffer.from("export const Board = () => null;\n");
    await writeFile(path.join(root, "board.tsx"), pinnedBoard);
    await git(root, ["add", "LICENSE", "board.tsx"]);
    await git(root, ["commit", "-m", "upstream source"]);
    const requestedRevision = await git(root, ["rev-parse", "HEAD"]);
    await writeFile(path.join(root, "precedent.md"), "# Product evidence\n\nUse list/detail topology.\n");
    await writeFile(path.join(root, "task.md"), "# Local task\n");
    await writeFile(path.join(root, "board.tsx"), "export const Board = () => 'new head';\n");
    await git(root, ["add", "precedent.md", "task.md", "board.tsx"]);
    await git(root, ["commit", "-m", "local task evidence"]);

    const contract = implementationContract(repository, requestedRevision);
    const derived = await deriveProductPrecedentMaterialization(
      root,
      requiredPrecedent(contract),
    );
    assert.equal(derived.value.ancestry, "ancestor");
    assert.equal(
      derived.value.sourceFiles[0]?.sha256,
      createHash("sha256").update(pinnedBoard).digest("hex"),
    );
    assert.equal(
      normalizeGitRepositoryUrl("git@github.com:example/product.git"),
      normalizeGitRepositoryUrl(repository),
    );
    const verified = await VerifiedProductPrecedentMaterializationV2.create(
      root,
      contract,
      derived.value,
    );
    const artifacts = new FilesystemArtifactStore(path.join(root, ".artifacts"));
    await publishVerifiedPrecedentEvidence(artifacts, verified);
    assert.equal(await artifacts.has(derived.value.evidence.artifact.hash), true);

    await git(root, ["remote", "set-url", "origin", "https://github.com/example/other.git"]);
    await assert.rejects(
      VerifiedProductPrecedentMaterializationV2.create(root, contract, derived.value),
      /origin does not match/u,
    );
    await git(root, ["remote", "set-url", "origin", repository]);
    await writeFile(path.join(root, "LICENSE"), "The MIT License (MIT)\n\nChanged bytes.\n");
    await VerifiedProductPrecedentMaterializationV2.create(root, contract, derived.value);
    await writeFile(path.join(root, "precedent.md"), "# Changed local evidence\n");
    await assert.rejects(
      VerifiedProductPrecedentMaterializationV2.create(root, contract, derived.value),
      /does not match direct Git and file evidence/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("materialization rejects a declared license absent from source bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-license-"));
  try {
    await git(root, ["init"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test"]);
    await git(root, ["remote", "add", "origin", "https://github.com/example/product.git"]);
    await writeFile(path.join(root, "LICENSE"), "Proprietary. All rights reserved.\n");
    await writeFile(path.join(root, "board.tsx"), "export const Board = () => null;\n");
    await writeFile(path.join(root, "precedent.md"), "# Evidence\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "source"]);
    const revision = await git(root, ["rev-parse", "HEAD"]);
    const contract = implementationContract(
      "https://github.com/example/product.git",
      revision,
    );
    await assert.rejects(
      deriveProductPrecedentMaterialization(root, requiredPrecedent(contract)),
      /declared license is not evidenced/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function implementationContract(
  repository: string,
  revision: string,
): ImplementationContractV2 {
  return {
    schemaVersion: 2,
    replacements: [],
    skills: [],
    productPrecedent: {
      product: "Example Product",
      source: { repository, revision, license: "MIT" },
      checkoutPath: ".",
      licensePath: "LICENSE",
      evidencePath: "precedent.md",
      materializationPath: "materialization.json",
      adopt: ["list/detail topology"],
      deviations: [],
      implementation: {
        kind: "reuse",
        licenseNoticePath: "THIRD_PARTY_LICENSE.txt",
        files: [{ sourcePath: "board.tsx", targetPath: "adopted/board.tsx", mode: "copy" }],
      },
    },
  };
}

function requiredPrecedent(
  contract: ImplementationContractV2,
): NonNullable<ImplementationContractV2["productPrecedent"]> {
  if (contract.productPrecedent === null) throw new Error("Fixture precedent is missing.");
  return contract.productPrecedent;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.stdout.trim();
}
