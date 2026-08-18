import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("search no_match is a successful CLI outcome", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "context-cli-"));
  try {
    await writeFile(path.join(root, "source.txt"), "haystack\n", "utf8");
    const { stdout } = await run(
      process.execPath,
      [
        path.resolve("dist/src/context-cli.js"),
        "search",
        "--query",
        "needle",
        "--path",
        "source.txt",
        "--root",
        root,
        "--format",
        "json",
      ],
      { encoding: "utf8" },
    );
    const result = JSON.parse(stdout) as {
      readonly outcome: string;
      readonly metadata: { readonly exitCode: number };
    };
    assert.equal(result.outcome, "no_match");
    assert.equal(result.metadata.exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
