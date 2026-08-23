import type {
  Decision,
  Evidence,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import {
  assertConfidence,
  assertPositiveSafeInteger,
} from "../contracts.js";
import {
  completed,
  escalated,
  exhausted,
  record,
} from "../loop-support.js";

export interface RelayStage<T> {
  readonly id: string;
  run(
    artifact: T,
    context: {
      readonly feedback: readonly string[];
      readonly transition: number;
    },
  ): Promise<Decision<T>>;
}

export interface RelayBudget {
  readonly maxTransitions: number;
  readonly maxRepairs: number;
}

export async function runRelayChain<T>(
  initialArtifact: T,
  stages: readonly RelayStage<T>[],
  budget: RelayBudget,
  context: LoopContext,
): Promise<LoopResult<T>> {
  assertPositiveSafeInteger(budget.maxTransitions, "Relay maxTransitions");
  assertPositiveSafeInteger(budget.maxRepairs, "Relay maxRepairs");
  const loop = "relay-chain";
  let artifact = initialArtifact;
  let position = 0;
  let transitions = 0;
  let repairs = 0;
  let feedback: readonly string[] = [];
  const evidence: Evidence[] = [];

  await record(context, "loop.started", loop, {
    stages: stages.map((stage) => stage.id),
  });

  while (position < stages.length && transitions < budget.maxTransitions) {
    const stage = stages[position];
    if (stage === undefined) {
      throw new Error(`Missing relay stage at position ${position}`);
    }

    transitions += 1;
    const decision = await stage.run(artifact, { feedback, transition: transitions });
    if (decision.kind === "accept") {
      assertConfidence(decision.confidence);
    }
    evidence.push(...decision.evidence);

    await record(
      context,
      "loop.transition",
      loop,
      {
        stage: stage.id,
        position,
        transition: transitions,
        decision: decision.kind,
      },
      decision.evidence,
      stage.id,
    );

    if (decision.kind === "accept") {
      artifact = decision.artifact;
      feedback = [];
      position += 1;
      continue;
    }

    if (decision.kind === "repair") {
      repairs += 1;
      if (repairs > budget.maxRepairs) {
        const issue = `Relay repair budget exceeded at ${stage.id}`;
        await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
        return exhausted(issue, evidence);
      }
      artifact = decision.artifact;
      feedback = decision.feedback;
      position = Math.max(0, position - 1);
      continue;
    }

    await record(
      context,
      "loop.escalated",
      loop,
      { issue: decision.issue, stage: stage.id },
      evidence,
      stage.id,
    );
    return escalated(decision.issue, evidence);
  }

  if (position === stages.length) {
    await record(context, "loop.completed", loop, { transitions, repairs }, evidence);
    return completed(artifact, evidence);
  }

  const issue = "Relay transition budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
