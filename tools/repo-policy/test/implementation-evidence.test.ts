import assert from "node:assert/strict";
import test from "node:test";

import { validateImplementationSkill } from "../src/implementation-skill.js";
import { decodeProductPrecedentMaterialization } from "../src/product-precedent-materialization.js";

const validSkill = [
  "---",
  "name: adopt-established-product",
  "description: Use one pinned external product for substantial topology work.",
  "---",
  "",
  "# Adopt established product",
  "",
].join("\n");

test("implementation skill validation binds path, directory, frontmatter, and bytes", () => {
  assert.deepEqual(
    validateImplementationSkill(
      ".codex/skills/adopt-established-product/SKILL.md",
      validSkill,
    ),
    {
      path: ".codex/skills/adopt-established-product/SKILL.md",
      name: "adopt-established-product",
      description: "Use one pinned external product for substantial topology work.",
    },
  );
  assert.throws(
    () => validateImplementationSkill("product-skill.md", validSkill),
    /must match \.codex\/skills/u,
  );
  assert.throws(
    () => validateImplementationSkill(
      ".codex/skills/different-name/SKILL.md",
      validSkill,
    ),
    /does not match directory/u,
  );
  assert.throws(
    () => validateImplementationSkill(
      ".codex/skills/adopt-established-product/SKILL.md",
      "# Missing frontmatter\n",
    ),
    /must start with YAML frontmatter/u,
  );
});

test("materialization receipt rejects unknown, malformed, and mismatched artifact identity", () => {
  const evidenceHash = "e".repeat(64);
  const valid = {
    schemaVersion: 2,
    repository: "https://github.com/example/project.git",
    resolvedOrigin: "git@github.com:example/project.git",
    requestedRevision: "a".repeat(40),
    checkoutPath: ".codex/reference/project",
    checkedOutRevision: "b".repeat(40),
    ancestry: "ancestor",
    license: {
      declared: "MIT",
      path: "LICENSE",
      noticePath: ".codex/work/frontend/LICENSE.upstream",
      sha256: "c".repeat(64),
    },
    evidence: {
      path: ".codex/work/frontend/project.md",
      sha256: evidenceHash,
      artifact: {
        hash: `sha256:${evidenceHash}`,
        mediaType: "text/markdown",
        bytes: 120,
        label: "Product precedent evidence: Project",
      },
    },
    sourceFiles: [{
      sourcePath: "src/board.tsx",
      targetPath: "apps/web/src/board.tsx",
      mode: "copy",
      sha256: "d".repeat(64),
      bytes: 120,
    }],
  };
  assert.deepEqual(decodeProductPrecedentMaterialization(valid), valid);
  assert.throws(
    () => decodeProductPrecedentMaterialization({ ...valid, verified: true }),
    /unknown fields: verified/u,
  );
  assert.throws(
    () => decodeProductPrecedentMaterialization({
      ...valid,
      evidence: {
        ...valid.evidence,
        artifact: { ...valid.evidence.artifact, hash: `sha256:${"f".repeat(64)}` },
      },
    }),
    /artifact hash must match/u,
  );
});
