import {
  decodeCapabilityRequest,
  type CapabilityRequest,
  type PolicyResult,
} from "@agent-context/repo-policy";
import {
  runReviewerRepair,
  type Evidence,
  type LoopContext,
  type LoopResult,
  type ReviewDecision,
  type ReviewFinding,
} from "@agent-context/codex-workflow-runtime";

export interface CapabilityArtifact {
  readonly revision: string;
  readonly summary: string;
  readonly changedFiles: readonly string[];
}

export interface ImplementationInput {
  readonly objective: string;
  readonly writableScope: readonly string[];
  readonly requiredReferences: readonly string[];
  readonly verificationProfile: string;
}

export interface RepairInput {
  readonly objective: string;
  readonly writableScope: readonly string[];
  readonly observedFailures: readonly {
    readonly id: string;
    readonly summary: string;
    readonly diagnostics: readonly string[];
    readonly artifact?: string;
  }[];
}

export interface ReviewInput {
  readonly objective: string;
  readonly writableScope: readonly string[];
  readonly artifact: CapabilityArtifact;
  readonly verification: {
    readonly profile?: string;
    readonly checks: readonly {
      readonly id: string;
      readonly summary: string;
      readonly artifact?: string;
    }[];
  };
}

export interface CapabilityWorker {
  readonly id: string;
  implement(input: ImplementationInput): Promise<{
    readonly artifact: CapabilityArtifact;
    readonly evidence: readonly Evidence[];
  }>;
  repair(
    input: RepairInput,
    artifact: CapabilityArtifact,
  ): Promise<{
    readonly artifact: CapabilityArtifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export interface CapabilityVerifier {
  verify(request: CapabilityRequest): Promise<PolicyResult>;
}

export interface CapabilityReviewer {
  readonly id: string;
  inspect(input: ReviewInput): Promise<CapabilityReviewDecision>;
}

export type CapabilityReviewDecision =
  | Extract<ReviewDecision, { readonly kind: "accept" }>
  | Omit<Extract<ReviewDecision, { readonly kind: "repair" }>, "repairOwner">
  | Extract<ReviewDecision, { readonly kind: "escalate" }>;

export interface CapabilityWorkflowPorts {
  readonly worker: CapabilityWorker;
  readonly verifier: CapabilityVerifier;
  readonly reviewer: CapabilityReviewer;
}

export async function runCapabilityWorkflow(
  requestValue: unknown,
  ports: CapabilityWorkflowPorts,
  context: LoopContext,
): Promise<LoopResult<CapabilityArtifact>> {
  const request = decodeCapabilityRequest(requestValue);
  let latestVerification: PolicyResult | undefined;

  return await runReviewerRepair(
    request,
    {
      id: ports.worker.id,
      async implement(capabilityRequest) {
        return await ports.worker.implement({
          objective: capabilityRequest.objective,
          writableScope: capabilityRequest.writablePaths,
          requiredReferences: capabilityRequest.readableReferences,
          verificationProfile: capabilityRequest.verificationProfile,
        });
      },
      async revise(capabilityRequest, artifact) {
        if (latestVerification === undefined) {
          throw new Error("A repair requires deterministic verification evidence.");
        }
        return await ports.worker.repair(
          {
            objective: capabilityRequest.objective,
            writableScope: capabilityRequest.writablePaths,
            observedFailures: failedChecks(latestVerification),
          },
          artifact,
        );
      },
    },
    {
      id: ports.reviewer.id,
      async inspect(capabilityRequest, artifact) {
        latestVerification = await ports.verifier.verify(capabilityRequest);
        const verificationEvidence = policyEvidence(latestVerification);
        if (!latestVerification.ok) {
          return {
            kind: "repair",
            repairOwner: "implementer",
            findings: policyFindings(latestVerification),
            evidence: verificationEvidence,
          };
        }

        const decision = await ports.reviewer.inspect({
          objective: capabilityRequest.objective,
          writableScope: capabilityRequest.writablePaths,
          artifact,
          verification: {
            ...(latestVerification.profile === undefined
              ? {}
              : { profile: latestVerification.profile }),
            checks: latestVerification.checks.map((check) => ({
              id: check.id,
              summary: check.summary,
              ...(check.artifact === undefined ? {} : { artifact: check.artifact }),
            })),
          },
        });
        if (decision.kind === "repair") {
          return {
            ...decision,
            repairOwner: "implementer",
            evidence: [...verificationEvidence, ...decision.evidence],
          };
        }
        return {
          ...decision,
          evidence: [...verificationEvidence, ...decision.evidence],
        };
      },
      async repair() {
        throw new Error("The independent reviewer has no write authority.");
      },
    },
    {
      maxReviewPasses: request.repairBudget + 1,
      maxRepairs: request.repairBudget,
    },
    context,
  );
}

function failedChecks(result: PolicyResult): RepairInput["observedFailures"] {
  return result.checks
    .filter((check) => !check.ok)
    .map((check) => ({
      id: check.id,
      summary: check.summary,
      diagnostics: check.diagnostics,
      ...(check.artifact === undefined ? {} : { artifact: check.artifact }),
    }));
}

function policyFindings(result: PolicyResult): readonly ReviewFinding[] {
  return failedChecks(result).map((failure) => ({
    id: `policy:${failure.id}`,
    summary: failure.summary,
    evidence: [
      {
        kind: "repository-policy",
        summary: failure.diagnostics.join(" "),
        references: failure.artifact === undefined ? [] : [failure.artifact],
      },
    ],
  }));
}

function policyEvidence(result: PolicyResult): readonly Evidence[] {
  return result.checks.map((check) => ({
    kind: "repository-policy",
    summary: check.summary,
    references: check.artifact === undefined ? [] : [check.artifact],
    data: {
      id: check.id,
      ok: check.ok,
      durationMs: check.durationMs,
    },
  }));
}
