import assert from "node:assert/strict";
import test from "node:test";
import {
  OBJECTIVE_CONFORMANCE_START,
  runObjectiveStoreConformance,
} from "@agent-context/objective-test-fixtures/objective-store-conformance";
import { PostgresObjectiveStore } from "../src/postgres-store.js";

const databaseUrl = process.env.OBJECTIVE_POSTGRES_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("OBJECTIVE_POSTGRES_URL is required for PostgreSQL objective tests.");
}

test("PostgresObjectiveStore satisfies the objective store contract", async () => {
  let sequence = 0;
  await runObjectiveStoreConformance(async (scenario) => {
    sequence += 1;
    const store = await PostgresObjectiveStore.open({
      databaseUrl,
      storeName: `conformance-${process.pid}-${sequence}-${scenario}`,
      applicationName: "objective-runtime-postgres-test",
      maxConnections: 4,
    });
    return {
      store,
      clock: {
        now: () => OBJECTIVE_CONFORMANCE_START,
        advance: async (milliseconds) => {
          await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
        },
      },
      close: () => store.close(),
    };
  });
});

test("PostgreSQL store namespaces isolate objective identity", async () => {
  const left = await PostgresObjectiveStore.open({
    databaseUrl,
    storeName: `isolation-left-${process.pid}`,
  });
  const right = await PostgresObjectiveStore.open({
    databaseUrl,
    storeName: `isolation-right-${process.pid}`,
  });
  try {
    assert.deepEqual(await left.list({ limit: 10 }), []);
    assert.deepEqual(await right.list({ limit: 10 }), []);
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
});
