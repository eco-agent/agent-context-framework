import type {
  Evidence,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import {
  completed,
  escalated,
  exhausted,
  record,
} from "../loop-support.js";

export type AuthorityStageDecision<Workspace> =
  | {
      readonly kind: "accept";
      readonly workspace: Workspace;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "return";
      readonly targetStageId: string;
      readonly workspace: Workspace;
      readonly feedback: readonly string[];
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface AuthorityStage<Request, Workspace> {
  readonly id: string;
  readonly roleId: string;
  run(input: {
    readonly request: Request;
    readonly workspace: Workspace;
    readonly priorEvidence: readonly Evidence[];
    readonly feedback: readonly string[];
  }): Promise<AuthorityStageDecision<Workspace>>;
}

export async function runAuthorityLadder<Request, Workspace>(
  request: Request,
  initialWorkspace: Workspace,
  stages: readonly AuthorityStage<Request, Workspace>[],
  maxTransitions: number,
  context: LoopContext,
): Promise<LoopResult<Workspace>> {
  const loop = "authority-ladder";
  const evidence: Evidence[] = [];
  const stageIndexes = new Map(stages.map((stage, index) => [stage.id, index]));
  let workspace = initialWorkspace;
  let position = 0;
  let feedback: readonly string[] = [];

  if (stageIndexes.size !== stages.length) {
    throw new Error("Authority ladder stage IDs must be unique");
  }

  await record(context, "loop.started", loop, {
    stages: stages.map((stage) => stage.id),
    maxTransitions,
  });

  for (let transition = 1; transition <= maxTransitions; transition += 1) {
    const stage = stages[position];
    if (stage === undefined) {
      await record(context, "loop.completed", loop, { transition: transition - 1 }, evidence);
      return completed(workspace, evidence);
    }

    const decision = await stage.run({
      request,
      workspace,
      priorEvidence: evidence,
      feedback,
    });
    evidence.push(...decision.evidence);

    await record(
      context,
      "loop.transition",
      loop,
      { transition, stage: stage.id, decision: decision.kind },
      decision.evidence,
      stage.roleId,
    );

    if (decision.kind === "accept") {
      workspace = decision.workspace;
      feedback = [];
      position += 1;
      continue;
    }

    if (decision.kind === "escalate") {
      await record(
        context,
        "loop.escalated",
        loop,
        { issue: decision.issue, stage: stage.id },
        evidence,
        stage.roleId,
      );
      return escalated(decision.issue, evidence);
    }

    const target = stageIndexes.get(decision.targetStageId);
    if (target === undefined || target >= position) {
      const issue = `${stage.id} returned to invalid stage ${decision.targetStageId}`;
      await record(context, "loop.escalated", loop, { issue }, evidence);
      return escalated(issue, evidence);
    }
    workspace = decision.workspace;
    feedback = decision.feedback;
    position = target;
  }

  const issue = "Authority ladder transition budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
