import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeContextRegistry,
  discoverWorkspaceUnits,
  resolveContextComponents,
} from "../src/index.js";

test("policy registry decoding remains strict and resolution is deterministic", () => {
  const registry = decodeContextRegistry({
    schemaVersion: 2,
    revision: "0.1.0",
    decisionPath: "decisions/0.1.0.md",
    components: [
      {
        name: "source",
        dependencies: [],
        capabilities: [],
        licenses: [{ kind: "project" }],
        artifacts: [
          {
            operation: "file",
            sourcePath: "source.md",
            sourceSha256: "a".repeat(64),
            targetPath: "target.md",
            mediaType: "text/markdown",
          },
        ],
      },
      {
        name: "bundle",
        dependencies: ["source"],
        capabilities: [],
        licenses: [{ kind: "project" }],
        artifacts: [],
      },
    ],
  });
  assert.deepEqual(
    resolveContextComponents(registry, ["bundle"]).map((component) => component.name),
    ["source", "bundle"],
  );
  assert.throws(
    () => decodeContextRegistry({ ...registry, command: "pnpm install" }),
    /unknown fields: command/u,
  );
});

test("workspace inspection accepts a non-Node repository", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-non-node-"));
  try {
    await writeFile(path.join(root, "README.md"), "# fixture\n", "utf8");
    await mkdir(path.join(root, ".agent-context", "runtime"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "runtime", "package.json"),
      '{"name":"@agent-context/runtime-workspace","private":true}\n',
      "utf8",
    );
    assert.deepEqual(await discoverWorkspaceUnits(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
