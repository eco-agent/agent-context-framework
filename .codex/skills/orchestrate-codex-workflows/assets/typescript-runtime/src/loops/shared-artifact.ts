import type {
  Evidence,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import { assertPositiveSafeInteger } from "../contracts.js";
import {
  completed,
  exhausted,
  mapWithConcurrency,
  record,
} from "../loop-support.js";

export interface ArtifactGap {
  readonly id: string;
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly expectedEvidence: readonly string[];
}

export interface ArtifactClaim<Artifact> {
  readonly gap: ArtifactGap;
  readonly ownerId: string;
  contribute(slice: Artifact): Promise<{
    readonly contribution: Artifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export interface SharedArtifactBoard<Artifact> {
  acceptanceMet(artifact: Artifact): Promise<boolean>;
  openGaps(artifact: Artifact): Promise<readonly ArtifactGap[]>;
  relevantSlice(artifact: Artifact, gap: ArtifactGap): Promise<Artifact>;
  append(
    artifact: Artifact,
    input: {
      readonly author: string;
      readonly gap: ArtifactGap;
      readonly contribution: Artifact;
      readonly evidence: readonly Evidence[];
    },
  ): Promise<Artifact>;
  integrate(artifact: Artifact): Promise<{
    readonly artifact: Artifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export interface ClaimAssigner<Artifact> {
  assign(
    gaps: readonly ArtifactGap[],
  ): Promise<readonly ArtifactClaim<Artifact>[]>;
}

export interface ConvergenceBudget {
  readonly maxRounds: number;
  readonly concurrency: number;
}

export async function runSharedArtifactConvergence<Artifact>(
  initialArtifact: Artifact,
  board: SharedArtifactBoard<Artifact>,
  assigner: ClaimAssigner<Artifact>,
  budget: ConvergenceBudget,
  context: LoopContext,
): Promise<LoopResult<Artifact>> {
  assertPositiveSafeInteger(budget.maxRounds, "Convergence maxRounds");
  assertPositiveSafeInteger(budget.concurrency, "Convergence concurrency");
  const loop = "shared-artifact-convergence";
  const evidence: Evidence[] = [];
  let artifact = initialArtifact;

  await record(context, "loop.started", loop, {
    maxRounds: budget.maxRounds,
    concurrency: budget.concurrency,
  });

  for (let round = 1; round <= budget.maxRounds; round += 1) {
    if (await board.acceptanceMet(artifact)) {
      await record(context, "loop.completed", loop, { round: round - 1 }, evidence);
      return completed(artifact, evidence);
    }

    const gaps = await board.openGaps(artifact);
    if (gaps.length === 0) {
      const issue = "Acceptance failed but the board reported no open gaps";
      await record(context, "loop.budget_exhausted", loop, { issue, round }, evidence);
      return exhausted(issue, evidence);
    }

    const claims = await assigner.assign(gaps);
    const gapIds = new Set(gaps.map((gap) => gap.id));
    const claimedGapIds = claims.map((claim) => claim.gap.id);
    if (
      claims.length === 0 ||
      claims.some((claim) => !gapIds.has(claim.gap.id)) ||
      new Set(claimedGapIds).size !== claimedGapIds.length
    ) {
      const issue = "Claim assignment was empty, duplicated, or referenced a closed gap";
      await record(context, "loop.budget_exhausted", loop, { issue, round }, evidence);
      return exhausted(issue, evidence);
    }

    const contributions = await mapWithConcurrency(
      claims,
      budget.concurrency,
      async (claim) => {
        const slice = await board.relevantSlice(artifact, claim.gap);
        const result = await claim.contribute(slice);
        return { claim, result };
      },
    );

    const roundEvidence = contributions.flatMap(({ result }) => result.evidence);
    let nextArtifact = artifact;
    for (const { claim, result } of contributions) {
      nextArtifact = await board.append(nextArtifact, {
        author: claim.ownerId,
        gap: claim.gap,
        contribution: result.contribution,
        evidence: result.evidence,
      });
    }

    const integrated = await board.integrate(nextArtifact);
    roundEvidence.push(...integrated.evidence);

    await record(
      context,
      "loop.transition",
      loop,
      {
        round,
        gaps: gaps.map((gap) => gap.id),
        contributors: claims.map((claim) => claim.ownerId),
      },
      roundEvidence,
    );
    artifact = integrated.artifact;
    evidence.push(...roundEvidence);
  }

  if (await board.acceptanceMet(artifact)) {
    await record(context, "loop.completed", loop, { round: budget.maxRounds }, evidence);
    return completed(artifact, evidence);
  }

  const issue = "Shared artifact convergence round budget exhausted";
  await record(context, "loop.budget_exhausted", loop, { issue }, evidence);
  return exhausted(issue, evidence);
}
