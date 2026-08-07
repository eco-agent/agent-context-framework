import assert from "node:assert/strict";
import test from "node:test";

import {
  portableRelativePath,
  sha256Digest,
  strictRecord,
} from "../src/index.js";

test("shared decoders end uncertainty at the runtime boundary", () => {
  assert.deepEqual(strictRecord({ path: "src/file.ts" }, "Input", ["path"]), {
    path: "src/file.ts",
  });
  assert.throws(
    () => strictRecord({ command: "git push" }, "Input", ["path"]),
    /unknown fields: command/u,
  );
  assert.equal(portableRelativePath("src/file.ts", "path"), "src/file.ts");
  assert.throws(() => portableRelativePath("../outside", "path"), /normalized/u);
  assert.equal(sha256Digest("a".repeat(64), "hash"), "a".repeat(64));
});
