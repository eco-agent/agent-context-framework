import { Effect, Either } from "effect";
import type {
  ObjectiveAttemptContext,
  ObjectiveAttemptOutcome,
  ObjectiveAttemptRunner,
} from "./scheduler.js";

export interface ObjectiveEffectRuntime<R> {
  runPromise<A, E>(effect: Effect.Effect<A, E, R>): Promise<A>;
}

export interface EffectObjectiveRunnerOptions<R, E> {
  readonly runtime: ObjectiveEffectRuntime<R>;
  readonly program: (
    context: ObjectiveAttemptContext,
  ) => Effect.Effect<ObjectiveAttemptOutcome, E, R>;
  readonly onFailure: (
    error: E,
    context: ObjectiveAttemptContext,
  ) => ObjectiveAttemptOutcome | Promise<ObjectiveAttemptOutcome>;
}

export class EffectObjectiveRunner<R, E> implements ObjectiveAttemptRunner {
  readonly #options: EffectObjectiveRunnerOptions<R, E>;

  public constructor(options: EffectObjectiveRunnerOptions<R, E>) {
    this.#options = options;
  }

  public async run(context: ObjectiveAttemptContext): Promise<ObjectiveAttemptOutcome> {
    const result = await this.#options.runtime.runPromise(
      Effect.either(this.#options.program(context)),
    );
    return Either.isRight(result)
      ? result.right
      : await this.#options.onFailure(result.left, context);
  }
}
