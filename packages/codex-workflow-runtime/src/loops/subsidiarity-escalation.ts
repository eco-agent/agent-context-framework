import type {
  Authority,
  Evidence,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import { assertPositiveSafeInteger } from "../contracts.js";
import {
  completed,
  escalated,
  exhausted,
  record,
} from "../loop-support.js";

export interface CapabilityAssessment {
  readonly capable: boolean;
  readonly withinScope: boolean;
  readonly withinAuthority: boolean;
  readonly requiredScope: readonly string[];
  readonly requiredAuthority: readonly Authority[];
}

export type LocalSolution<Problem, Result> =
  | {
      readonly kind: "sufficient";
      readonly result: Result;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "partial";
      readonly unresolved: Problem;
      readonly evidence: readonly Evidence[];
    };

export interface Escalation<Problem> {
  readonly origin: string;
  readonly unresolved: Problem;
  readonly attemptedEvidence: readonly Evidence[];
  readonly requiredScope: readonly string[];
  readonly requiredAuthority: readonly Authority[];
}

export type EscalationResolution<Result> =
  | {
      readonly kind: "handle";
      readonly result: Result;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "sibling";
      readonly targetId: string;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "ascend";
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface SubsidiarityNode<Problem, Result> {
  readonly id: string;
  readonly parentId?: string;
  assess(problem: Problem): Promise<CapabilityAssessment>;
  solve(problem: Problem): Promise<LocalSolution<Problem, Result>>;
  resolveEscalation(
    escalation: Escalation<Problem>,
  ): Promise<EscalationResolution<Result>>;
}

export interface SubsidiarityRegistry<Problem, Result> {
  get(id: string): SubsidiarityNode<Problem, Result>;
}

export async function runSubsidiarityEscalation<Problem, Result>(
  initialProblem: Problem,
  startingNodeId: string,
  registry: SubsidiarityRegistry<Problem, Result>,
  maxAscents: number,
  context: LoopContext,
): Promise<LoopResult<Result>> {
  assertPositiveSafeInteger(maxAscents, "Subsidiarity maxAscents");
  const loop = "subsidiarity-escalation";
  const evidence: Evidence[] = [];
  const visited = new Set<string>();
  let problem = initialProblem;
  let current = registry.get(startingNodeId);

  await record(context, "loop.started", loop, {
    startingNodeId,
    maxAscents,
  });

  for (let ascent = 0; ascent <= maxAscents; ascent += 1) {
    if (visited.has(current.id)) {
      const issue = `Subsidiarity cycle detected at ${current.id}`;
      await record(context, "loop.escalated", loop, { issue, ascent }, evidence);
      return escalated(issue, evidence);
    }
    visited.add(current.id);

    const assessment = await current.assess(problem);
    if (
      assessment.capable &&
      assessment.withinScope &&
      assessment.withinAuthority
    ) {
      const solution = await current.solve(problem);
      if (solution.kind === "sufficient") {
        const completionEvidence = [...evidence, ...solution.evidence];
        await record(
          context,
          "loop.completed",
          loop,
          { ascent, node: current.id },
          completionEvidence,
          current.id,
        );
        return completed(solution.result, completionEvidence);
      }
      await record(
        context,
        "loop.transition",
        loop,
        { ascent, node: current.id, solution: solution.kind },
        solution.evidence,
        current.id,
      );
      evidence.push(...solution.evidence);
      problem = solution.unresolved;
    }

    if (current.parentId === undefined) {
      const issue = `No parent can resolve the problem above ${current.id}`;
      await record(context, "loop.escalated", loop, { issue, ascent }, evidence);
      return escalated(issue, evidence);
    }

    if (ascent >= maxAscents) {
      const issue = "Subsidiarity ascent budget exhausted";
      await record(
        context,
        "loop.budget_exhausted",
        loop,
        {
          issue,
          ascent,
          from: current.id,
          blockedTarget: current.parentId,
        },
        evidence,
      );
      return exhausted(issue, evidence);
    }

    const parent = registry.get(current.parentId);
    const resolution = await parent.resolveEscalation({
      origin: current.id,
      unresolved: problem,
      attemptedEvidence: evidence,
      requiredScope: assessment.requiredScope,
      requiredAuthority: assessment.requiredAuthority,
    });

    if (resolution.kind === "handle") {
      const completionEvidence = [...evidence, ...resolution.evidence];
      await record(
        context,
        "loop.completed",
        loop,
        { ascent, node: parent.id },
        completionEvidence,
        parent.id,
      );
      return completed(resolution.result, completionEvidence);
    }

    if (resolution.kind === "escalate") {
      const escalationEvidence = [...evidence, ...resolution.evidence];
      await record(
        context,
        "loop.escalated",
        loop,
        { issue: resolution.issue, ascent },
        escalationEvidence,
        parent.id,
      );
      return escalated(resolution.issue, escalationEvidence);
    }

    const nextId =
      resolution.kind === "sibling" ? resolution.targetId : parent.id;
    if (resolution.kind === "sibling") {
      const sibling = registry.get(nextId);
      if (sibling.parentId !== parent.id) {
        const issue = `${nextId} is not a sibling under ${parent.id}`;
        const escalationEvidence = [...evidence, ...resolution.evidence];
        await record(
          context,
          "loop.escalated",
          loop,
          { issue, ascent },
          escalationEvidence,
        );
        return escalated(issue, escalationEvidence);
      }
    }

    await record(
      context,
      "loop.transition",
      loop,
      { ascent, from: current.id, to: nextId, resolution: resolution.kind },
      resolution.evidence,
      parent.id,
    );
    evidence.push(...resolution.evidence);
    current = registry.get(nextId);
  }

  throw new Error("Subsidiarity loop terminated without a result");
}
