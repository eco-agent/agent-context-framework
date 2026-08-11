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

export type ScopeEvaluation<Result, Impact> =
  | {
      readonly kind: "fits";
      readonly result: Result;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "outside";
      readonly impact: Impact;
      readonly evidence: readonly Evidence[];
    };

export type ScopeResolution<Change, Result> =
  | {
      readonly kind: "integrate";
      readonly result: Result;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "lateral";
      readonly targetId: string;
      readonly change: Change;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "ascend";
      readonly change: Change;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface ScopeNode<Change, Result, Impact> {
  readonly id: string;
  readonly parentId?: string;
  evaluate(change: Change): Promise<ScopeEvaluation<Result, Impact>>;
  applyOrReview(result: Result): Promise<{
    readonly result: Result;
    readonly evidence: readonly Evidence[];
  }>;
  resolveImpact(
    impact: Impact,
    originId: string,
  ): Promise<ScopeResolution<Change, Result>>;
}

export interface ScopeRegistry<Change, Result, Impact> {
  get(id: string): ScopeNode<Change, Result, Impact>;
}

export async function runScopeReconciliation<Change, Result, Impact>(
  change: Change,
  startingNodeId: string,
  registry: ScopeRegistry<Change, Result, Impact>,
  maxHops: number,
  context: LoopContext,
): Promise<LoopResult<Result>> {
  const loop = "scope-reconciliation";
  const evidence: Evidence[] = [];
  const visitedEdges = new Set<string>();
  let currentId = startingNodeId;
  let currentChange = change;

  await record(context, "loop.started", loop, {
    startingNodeId,
    maxHops,
  });

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const current = registry.get(currentId);
    const evaluation = await current.evaluate(currentChange);
    evidence.push(...evaluation.evidence);

    if (evaluation.kind === "fits") {
      const applied = await current.applyOrReview(evaluation.result);
      evidence.push(...applied.evidence);
      await record(
        context,
        "loop.completed",
        loop,
        { hop, node: current.id },
        evidence,
        current.id,
      );
      return completed(applied.result, evidence);
    }

    if (current.parentId === undefined) {
      const issue = `Impact escaped root scope ${current.id}`;
      await record(context, "loop.escalated", loop, { issue, hop }, evidence);
      return escalated(issue, evidence);
    }

    const parent = registry.get(current.parentId);
    const resolution = await parent.resolveImpact(
      evaluation.impact,
      current.id,
    );
    evidence.push(...resolution.evidence);

    if (resolution.kind === "integrate") {
      await record(
        context,
        "loop.completed",
        loop,
        { hop, node: parent.id, resolution: resolution.kind },
        evidence,
        parent.id,
      );
      return completed(resolution.result, evidence);
    }

    if (resolution.kind === "escalate") {
      await record(
        context,
        "loop.escalated",
        loop,
        { issue: resolution.issue, hop, node: parent.id },
        evidence,
        parent.id,
      );
      return escalated(resolution.issue, evidence);
    }

    const nextId =
      resolution.kind === "lateral" ? resolution.targetId : parent.id;
    if (resolution.kind === "lateral") {
      const sibling = registry.get(nextId);
      if (sibling.parentId !== parent.id) {
        const issue = `${nextId} is not a sibling under ${parent.id}`;
        await record(context, "loop.escalated", loop, { issue, hop }, evidence);
        return escalated(issue, evidence);
      }
    }

    const edge = `${current.id}->${nextId}`;
    if (visitedEdges.has(edge)) {
      const issue = `Scope reconciliation cycle detected at ${edge}`;
      await record(context, "loop.escalated", loop, { issue, hop }, evidence);
      return escalated(issue, evidence);
    }
    visitedEdges.add(edge);

    await record(
      context,
      "loop.transition",
      loop,
      { hop, from: current.id, to: nextId, resolution: resolution.kind },
      resolution.evidence,
      parent.id,
    );
    currentId = nextId;
    currentChange = resolution.change;
  }

  const issue = "Scope reconciliation hop budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
