import type {
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

export interface ReviewFinding {
  readonly id: string;
  readonly summary: string;
  readonly evidence: readonly Evidence[];
}

export type ReviewDecision =
  | {
      readonly kind: "accept";
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "repair";
      readonly repairOwner: "implementer" | "reviewer";
      readonly findings: readonly ReviewFinding[];
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface Implementer<Request, Artifact> {
  readonly id: string;
  implement(request: Request): Promise<{
    readonly artifact: Artifact;
    readonly evidence: readonly Evidence[];
  }>;
  revise(
    request: Request,
    artifact: Artifact,
    findings: readonly ReviewFinding[],
  ): Promise<{
    readonly artifact: Artifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export interface Reviewer<Request, Artifact> {
  readonly id: string;
  inspect(
    request: Request,
    artifact: Artifact,
    priorFindings: readonly ReviewFinding[],
  ): Promise<ReviewDecision>;
  repair(
    artifact: Artifact,
    findings: readonly ReviewFinding[],
  ): Promise<{
    readonly artifact: Artifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export async function runReviewerRepair<Request, Artifact>(
  request: Request,
  implementer: Implementer<Request, Artifact>,
  reviewer: Reviewer<Request, Artifact>,
  maxReviewPasses: number,
  context: LoopContext,
): Promise<LoopResult<Artifact>> {
  assertPositiveSafeInteger(maxReviewPasses, "Reviewer repair maxReviewPasses");
  const loop = "reviewer-repair";
  const evidence: Evidence[] = [];
  const priorFindings: ReviewFinding[] = [];

  await record(context, "loop.started", loop, {
    implementer: implementer.id,
    reviewer: reviewer.id,
    maxReviewPasses,
  });

  const initial = await implementer.implement(request);
  await record(
    context,
    "loop.transition",
    loop,
    { phase: "initial-implementation" },
    initial.evidence,
    implementer.id,
  );
  let artifact = initial.artifact;
  evidence.push(...initial.evidence);

  for (let pass = 1; pass <= maxReviewPasses; pass += 1) {
    const review = await reviewer.inspect(request, artifact, priorFindings);

    await record(
      context,
      "loop.transition",
      loop,
      { pass, decision: review.kind },
      review.evidence,
      reviewer.id,
    );
    evidence.push(...review.evidence);

    if (review.kind === "accept") {
      await record(context, "loop.completed", loop, { pass }, evidence);
      return completed(artifact, evidence);
    }

    if (review.kind === "escalate") {
      await record(
        context,
        "loop.escalated",
        loop,
        { issue: review.issue, pass },
        evidence,
        reviewer.id,
      );
      return escalated(review.issue, evidence);
    }

    priorFindings.push(...review.findings);
    const revision =
      review.repairOwner === "reviewer"
        ? await reviewer.repair(artifact, review.findings)
        : await implementer.revise(request, artifact, review.findings);
    const revisionOwner =
      review.repairOwner === "reviewer" ? reviewer.id : implementer.id;
    await record(
      context,
      "loop.transition",
      loop,
      { pass, phase: "revision", repairOwner: review.repairOwner },
      revision.evidence,
      revisionOwner,
    );
    artifact = revision.artifact;
    evidence.push(...revision.evidence);
  }

  const issue = "Reviewer–repair pass budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
