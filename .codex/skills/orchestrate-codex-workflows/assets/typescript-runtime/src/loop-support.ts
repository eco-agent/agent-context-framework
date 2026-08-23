import type {
  Evidence,
  JsonValue,
  LoopContext,
  LoopEventType,
  LoopResult,
} from "./contracts.js";
import { assertPositiveSafeInteger } from "./contracts.js";

export async function record(
  context: LoopContext,
  type: LoopEventType,
  loop: string,
  state: JsonValue,
  evidence: readonly Evidence[] = [],
  actor?: string,
): Promise<void> {
  await context.ledger.append({
    type,
    loop,
    state,
    evidence,
    ...(actor === undefined ? {} : { actor }),
  });
}

export function exhausted<T>(
  issue: string,
  evidence: readonly Evidence[],
): LoopResult<T> {
  return { status: "budget_exhausted", issue, evidence };
}

export function escalated<T>(
  issue: string,
  evidence: readonly Evidence[],
): LoopResult<T> {
  return { status: "escalated", issue, evidence };
}

export function completed<T>(
  artifact: T,
  evidence: readonly Evidence[],
): LoopResult<T> {
  return { status: "completed", artifact, evidence };
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  assertPositiveSafeInteger(concurrency, "Concurrency");

  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) {
        throw new Error(`Missing value at index ${index}`);
      }
      results[index] = await map(value, index);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => worker()),
  );
  return results;
}
