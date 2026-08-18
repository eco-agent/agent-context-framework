import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import { EffectObjectiveRunner } from "../src/effect-runner.js";

const context = {
  snapshot: {} as never,
  signal: new AbortController().signal,
  async checkpoint() {
    return {} as never;
  },
};

test("Effect programs remain local attempt implementations", async () => {
  const runtime = { runPromise: Effect.runPromise };
  const success = new EffectObjectiveRunner({
    runtime,
    program: () => Effect.succeed({
      type: "completed" as const,
      summary: "effect completed",
      evidence: [],
    }),
    onFailure: () => ({ type: "retry", reason: "unreachable", retryAfterMs: 0 }),
  });
  assert.equal((await success.run(context)).type, "completed");

  const failure = new EffectObjectiveRunner({
    runtime,
    program: () => Effect.fail("dependency unavailable"),
    onFailure: (error) => ({ type: "retry", reason: error, retryAfterMs: 100 }),
  });
  assert.deepEqual(await failure.run(context), {
    type: "retry",
    reason: "dependency unavailable",
    retryAfterMs: 100,
  });
});
