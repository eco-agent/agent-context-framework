import type {
  Authority,
  Evidence,
  JsonValue,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import {
  assertPositiveSafeInteger,
  toJson,
} from "../contracts.js";
import {
  completed,
  escalated,
  exhausted,
  record,
} from "../loop-support.js";

export type EnvironmentDecision<Action, Result> =
  | {
      readonly kind: "complete";
      readonly result: Result;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "act";
      readonly action: Action;
      readonly requiredAuthority: readonly Authority[];
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface Environment<State, Action, Effect> {
  observe(): Promise<State>;
  execute(
    action: Action,
    context: { readonly idempotencyKey: string },
  ): Promise<Effect>;
  measure(previous: State, next: State): Promise<JsonValue>;
  madeProgress(measuredChange: JsonValue): boolean;
}

export interface EnvironmentHolon<Mission, State, Action, Result> {
  readonly id: string;
  readonly authority: readonly Authority[];
  decide(input: {
    readonly mission: Mission;
    readonly observation: State;
    readonly history: readonly EnvironmentStep<Action>[];
    readonly remainingSteps: number;
  }): Promise<EnvironmentDecision<Action, Result>>;
}

export interface EnvironmentStep<Action> {
  readonly action: Action;
  readonly measuredChange: JsonValue;
  readonly progressed: boolean;
}

export interface EnvironmentBudget {
  readonly maxSteps: number;
  readonly maxConsecutiveStagnantSteps: number;
  readonly retainedHistory: number;
}

export async function runAutonomousEnvironment<
  Mission,
  State,
  Action,
  Effect,
  Result,
>(
  mission: Mission,
  holon: EnvironmentHolon<Mission, State, Action, Result>,
  environment: Environment<State, Action, Effect>,
  budget: EnvironmentBudget,
  context: LoopContext,
): Promise<LoopResult<Result>> {
  assertPositiveSafeInteger(budget.maxSteps, "Environment maxSteps");
  assertPositiveSafeInteger(
    budget.maxConsecutiveStagnantSteps,
    "Environment maxConsecutiveStagnantSteps",
  );
  assertPositiveSafeInteger(
    budget.retainedHistory,
    "Environment retainedHistory",
  );
  const loop = "autonomous-environment";
  const evidence: Evidence[] = [];
  const history: EnvironmentStep<Action>[] = [];
  let state = (await environment.observe()) as State;
  let stagnantSteps = 0;

  await record(context, "loop.started", loop, {
    actor: holon.id,
    maxSteps: budget.maxSteps,
  });

  for (let step = 1; step <= budget.maxSteps; step += 1) {
    const decision = await holon.decide({
      mission,
      observation: state,
      history: history.slice(-budget.retainedHistory),
      remainingSteps: budget.maxSteps - step + 1,
    });
    evidence.push(...decision.evidence);

    if (decision.kind === "complete") {
      await record(context, "loop.completed", loop, { step }, evidence, holon.id);
      return completed(decision.result, evidence);
    }

    if (decision.kind === "escalate") {
      await record(
        context,
        "loop.escalated",
        loop,
        { issue: decision.issue, step },
        evidence,
        holon.id,
      );
      return escalated(decision.issue, evidence);
    }

    const heldAuthority = new Set(holon.authority);
    const missingAuthority = decision.requiredAuthority.filter(
      (authority) => !heldAuthority.has(authority),
    );
    if (missingAuthority.length > 0) {
      const issue = `Action requires ungranted authority: ${missingAuthority.join(", ")}`;
      await record(context, "loop.escalated", loop, { issue, step }, evidence);
      return escalated(issue, evidence);
    }

    const idempotencyKey = `${context.ledger.runId}:${loop}:${holon.id}:${step}`;
    await record(
      context,
      "environment.intent",
      loop,
      { step, idempotencyKey, action: toJson(decision.action) },
      decision.evidence,
      holon.id,
    );

    let nextState: State;
    let measuredChange: JsonValue;
    let progressed: boolean;
    try {
      await environment.execute(decision.action, { idempotencyKey });
      nextState = (await environment.observe()) as State;
      measuredChange = await environment.measure(state, nextState);
      progressed = environment.madeProgress(measuredChange);
    } catch (error) {
      await record(
        context,
        "environment.failed",
        loop,
        {
          step,
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        decision.evidence,
        holon.id,
      );
      throw error;
    }

    await record(
      context,
      "environment.applied",
      loop,
      { step, idempotencyKey, progressed, measuredChange },
      decision.evidence,
      holon.id,
    );
    await record(
      context,
      "loop.transition",
      loop,
      { step, progressed, measuredChange },
      decision.evidence,
      holon.id,
    );

    history.push({ action: decision.action, measuredChange, progressed });
    stagnantSteps = progressed ? 0 : stagnantSteps + 1;

    if (stagnantSteps >= budget.maxConsecutiveStagnantSteps) {
      const issue = `No measured progress for ${stagnantSteps} consecutive steps`;
      await record(context, "loop.escalated", loop, { issue, step }, evidence);
      return escalated(issue, evidence);
    }
    state = nextState;
  }

  const issue = "Autonomous environment step budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
