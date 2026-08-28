import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationServer, renderPage } from "../src/server.mjs";

test("renders the fixture identity", () => {
  assert.match(renderPage(), /ACF test application/u);
});

test("serves the health contract", async () => {
  const server = createApplicationServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
});
