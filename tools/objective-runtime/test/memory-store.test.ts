import test from "node:test";
import {
  OBJECTIVE_CONFORMANCE_START,
  runObjectiveStoreConformance,
} from "@agent-context/objective-test-fixtures/objective-store-conformance";
import { ManualObjectiveClock } from "../src/clock.js";
import { MemoryObjectiveStore } from "../src/memory-store.js";

test("MemoryObjectiveStore satisfies the objective store contract", async () => {
  await runObjectiveStoreConformance(async () => {
    const clock = new ManualObjectiveClock(OBJECTIVE_CONFORMANCE_START);
    return { clock, store: new MemoryObjectiveStore(clock) };
  });
});
