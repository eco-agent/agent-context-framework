import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { decodeImplementationContract } from "../src/implementation-contract.js";
import { checkScope } from "../src/checks/scope.js";

const execFileAsync = promisify(execFile);

const valid = {
  schemaVersion: 2,
  replacements: [{ path: "apps/web/src/legacy-board.tsx", disposition: "remove" }],
  skills: [".codex/skills/adopt-established-product/SKILL.md"],
  productPrecedent: {
    product: "GitHub Issues",
    source: {
      repository: "https://github.com/example/issues-clone.git",
      revision: "a".repeat(40),
      license: "MIT",
    },
    checkoutPath: ".",
    licensePath: "LICENSE",
    evidencePath: ".codex/work/frontend/issues-reference.md",
    materializationPath: ".codex/work/frontend/issues-materialization.json",
    adopt: ["list and detail topology", "timeline interaction grammar"],
    deviations: [
      { acceptanceGateId: "objective-state", description: "Show leased objective state." },
    ],
    implementation: {
      kind: "reuse",
      licenseNoticePath: "apps/web/THIRD_PARTY_LICENSES/issues-clone.txt",
      files: [{
        sourcePath: "upstream/issue-list.tsx",
        targetPath: "apps/web/src/issue-list.tsx",
        mode: "copy",
      }],
    },
  },
} as const;

test("implementation contract decodes pinned precedent and direct replacements", () => {
  assert.deepEqual(decodeImplementationContract(valid), valid);
});

test("implementation contract rejects floating source and invented modes", () => {
  assert.throws(
    () => decodeImplementationContract({
      ...valid,
      productPrecedent: {
        ...valid.productPrecedent,
        source: { ...valid.productPrecedent.source, revision: "main" },
      },
    }),
    /exact Git commit hash/u,
  );
  assert.throws(
    () => decodeImplementationContract({ ...valid, compatibility: "preserve" }),
    /unknown fields: compatibility/u,
  );
});

test("implementation contract rejects precedent without adopted behavior", () => {
  assert.throws(
    () => decodeImplementationContract({
      ...valid,
      productPrecedent: { ...valid.productPrecedent, adopt: [] },
    }),
    /at least one preserved behavior/u,
  );
});

test("implementation contract rejects observation when the pinned license permits reuse", () => {
  assert.throws(
    () => decodeImplementationContract({
      ...valid,
      productPrecedent: {
        ...valid.productPrecedent,
        implementation: {
          kind: "observe",
          acceptanceGateId: "objective-state",
          reason: "Rewrite it from memory.",
        },
      },
    }),
    /permits source reuse/u,
  );
});

test("scope proves declared rewrites and removals against the branch diff", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-implementation-scope-"));
  try {
    await writeFile(path.join(root, "AGENTS.md"), "# Original\n");
    await writeFile(path.join(root, "legacy.ts"), "export const legacy = true;\n");
    const upstreamBytes = Buffer.from("export const IssueList = () => null;\n");
    await mkdir(path.join(root, "upstream"), { recursive: true });
    await writeFile(path.join(root, "upstream/issue-list.tsx"), upstreamBytes);
    const licenseBytes = Buffer.from("MIT License\n");
    await writeFile(path.join(root, "LICENSE"), licenseBytes);
    await git(root, ["init"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test"]);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    const baseline = await git(root, ["rev-parse", "HEAD"]);

    await writeFile(path.join(root, "AGENTS.md"), "# Rewritten\n");
    await unlink(path.join(root, "legacy.ts"));
    await writeFile(path.join(root, "precedent.md"), "# Pinned product evidence\n");
    await mkdir(path.join(root, "apps/web/src"), { recursive: true });
    await writeFile(path.join(root, "apps/web/src/issue-list.tsx"), upstreamBytes);
    await mkdir(path.join(root, "apps/web/THIRD_PARTY_LICENSES"), { recursive: true });
    await writeFile(
      path.join(root, "apps/web/THIRD_PARTY_LICENSES/issues-clone.txt"),
      licenseBytes,
    );
    const skillPath = ".codex/skills/product-skill/SKILL.md";
    await mkdir(path.dirname(path.join(root, skillPath)), { recursive: true });
    await writeFile(
      path.join(root, skillPath),
      "---\nname: product-skill\ndescription: Adopt established product.\n---\n",
    );
    const evidenceHash = "e".repeat(64);
    await writeFile(path.join(root, "materialization.json"), JSON.stringify({
      schemaVersion: 2,
      repository: valid.productPrecedent.source.repository,
      resolvedOrigin: valid.productPrecedent.source.repository,
      requestedRevision: valid.productPrecedent.source.revision,
      checkoutPath: ".",
      checkedOutRevision: valid.productPrecedent.source.revision,
      ancestry: "equal",
      license: {
        declared: "MIT",
        path: "LICENSE",
        noticePath: "apps/web/THIRD_PARTY_LICENSES/issues-clone.txt",
        sha256: hash(licenseBytes),
      },
      evidence: {
        path: "precedent.md",
        sha256: evidenceHash,
        artifact: {
          hash: `sha256:${evidenceHash}`,
          mediaType: "text/markdown",
          bytes: 26,
          label: "Product precedent evidence: GitHub Issues",
        },
      },
      sourceFiles: [{
        sourcePath: "upstream/issue-list.tsx",
        targetPath: "apps/web/src/issue-list.tsx",
        mode: "copy",
        sha256: hash(upstreamBytes),
        bytes: upstreamBytes.byteLength,
      }],
    }));
    await writeFile(path.join(root, "implementation.json"), JSON.stringify({
      ...valid,
      replacements: [
        { path: "AGENTS.md", disposition: "rewrite" },
        { path: "legacy.ts", disposition: "remove" },
      ],
      skills: [skillPath],
      productPrecedent: {
        ...valid.productPrecedent,
        evidencePath: "precedent.md",
        materializationPath: "materialization.json",
      },
    }));
    await writeFile(path.join(root, "request.json"), JSON.stringify({
      objectiveId: "62000000-0000-4000-8000-000000000001",
      objective: "Replace one frontend",
      contractPath: "AGENTS.md",
      implementationContractPath: "implementation.json",
      baselineRevision: baseline,
      supersedes: [],
      writablePaths: ["AGENTS.md", "legacy.ts", "precedent.md", skillPath, "materialization.json", "implementation.json", "request.json", "apps/web/src/issue-list.tsx", "apps/web/THIRD_PARTY_LICENSES/issues-clone.txt"],
      readableReferences: ["precedent.md", skillPath, "materialization.json", "upstream/issue-list.tsx"],
      verificationProfile: "product-topology",
      repairBudget: 0,
    }));

    assert.deepEqual(await checkScope(root, { requestFile: "request.json", base: baseline }), []);

    await writeFile(path.join(root, "legacy.ts"), "export const preserved = true;\n");
    assert.deepEqual(
      await checkScope(root, { requestFile: "request.json", base: baseline }),
      ["Declared replacement still exists: legacy.ts"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function git(root: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return stdout.trim();
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
