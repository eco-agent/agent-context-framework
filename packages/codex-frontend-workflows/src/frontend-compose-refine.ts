import {
  PlanCodexClient,
  runReviewerRepair,
  toJson,
  validateTaskAcceptanceEvaluation,
  validateWorkflowPlan,
  type CodexRole,
  type Delegation,
  type Evidence,
  type EvidenceLedger,
  type JsonValue,
  type PlannedTask,
  type ReviewDecision,
  type ReviewFinding,
  type WorkflowCodex,
} from "@agent-context/codex-workflow-runtime";

const implementationTaskIds = ["implement", "repair-1", "repair-2"] as const;
const reviewTaskIds = ["review-1", "review-2", "review-3"] as const;
const reviewDimensions = [
  "hierarchy",
  "grouping",
  "alignment",
  "density",
  "containment",
  "omission",
  "state-legibility",
] as const;

export type ImplementationTaskId = (typeof implementationTaskIds)[number];
export type ReviewTaskId = (typeof reviewTaskIds)[number];
export type ReviewDimension = (typeof reviewDimensions)[number];

export interface ComposeRenderState {
  readonly id: string;
  readonly beforeReference: string;
  readonly screenshotName: string;
  readonly observation: string;
}

export interface ComposeRefineRequest {
  readonly schemaVersion: 1;
  readonly objective: string;
  readonly baselineRevision: string;
  readonly approvedCandidateReference: string;
  readonly approvedCandidatePath: string;
  readonly specificationPath: string;
  readonly specificationSha256: string;
  readonly writablePaths: readonly string[];
  readonly verificationChecks: readonly string[];
  readonly renderStates: readonly ComposeRenderState[];
  readonly constraints: readonly string[];
  readonly repairBudget: 0 | 1 | 2;
}

export interface ImplementationDecision {
  readonly kind: "implemented";
  readonly summary: string;
  readonly changedFiles: readonly string[];
  readonly evidence: readonly Evidence[];
}

export interface VerificationCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly diagnostics: readonly string[];
}

export interface RenderStateEvidence {
  readonly id: string;
  readonly screenshotReference: string;
  readonly sha256: string;
  readonly observation: string;
}

export interface RenderEvidence {
  readonly revision: string;
  readonly aggregateSha256: string;
  readonly states: readonly RenderStateEvidence[];
  readonly consoleErrors: readonly string[];
  readonly layoutFacts: JsonValue;
}

export type RevisionArtifact =
  | {
      readonly status: "ready_for_review";
      readonly stage: ImplementationTaskId;
      readonly revision: string;
      readonly summary: string;
      readonly changedFiles: readonly string[];
      readonly verification: readonly VerificationCheck[];
      readonly render: RenderEvidence;
    }
  | {
      readonly status: "verification_failed";
      readonly stage: ImplementationTaskId;
      readonly revision: string;
      readonly summary: string;
      readonly changedFiles: readonly string[];
      readonly verification: readonly VerificationCheck[];
      readonly problem: string;
    };

export type CompositionReviewDecision =
  | {
      readonly kind: "accept";
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "repair";
      readonly findings: readonly ReviewFinding[];
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export interface ComposeArtifactStore {
  store(name: string, value: JsonValue): Promise<string>;
}

export interface ComposeRevisionEnvironment {
  materialize(input: {
    readonly stage: ImplementationTaskId;
    readonly decision: ImplementationDecision;
    readonly priorArtifact?: RevisionArtifact;
    readonly findings: readonly ReviewFinding[];
  }): Promise<{
    readonly artifact: RevisionArtifact;
    readonly evidence: readonly Evidence[];
  }>;
}

export interface ComposeRefineWorkflowOptions {
  readonly request: ComposeRefineRequest;
  readonly repositoryDirectory: string;
  readonly reviewerDirectory: string;
  readonly ledger: EvidenceLedger;
  readonly artifacts: ComposeArtifactStore;
  readonly environment: ComposeRevisionEnvironment;
  readonly model: string;
  readonly implementationTimeoutMs: number;
  readonly reviewTimeoutMs: number;
  readonly signal?: AbortSignal;
  readonly codex?: WorkflowCodex;
}

export type ComposeRefineWorkflowResult =
  | {
      readonly status: "ready_for_human_review";
      readonly artifact: RevisionArtifact & { readonly status: "ready_for_review" };
      readonly artifactReference: string;
      readonly reviewReference: string;
    }
  | {
      readonly status: "exhausted" | "stopped";
      readonly issue: string;
    };

export function decodeComposeRefineRequest(value: unknown): ComposeRefineRequest {
  const record = exactRecord(value, [
    "schemaVersion", "objective", "baselineRevision", "approvedCandidateReference",
    "approvedCandidatePath", "specificationPath", "specificationSha256", "writablePaths",
    "verificationChecks", "renderStates", "constraints", "repairBudget",
  ], "Compose request");
  if (record.schemaVersion !== 1) throw new Error("Compose request schemaVersion must be 1");
  const repairBudget = integer(record.repairBudget, 0, 2, "Compose request repairBudget");
  const renderStates = array(record.renderStates, "Compose request renderStates", 1).map((entry, index) => {
    const state = exactRecord(entry, ["id", "beforeReference", "screenshotName", "observation"], `Compose render state ${index}`);
    return {
      id: string(state.id, `Compose render state ${index} id`),
      beforeReference: relativePath(state.beforeReference, `Compose render state ${index} beforeReference`),
      screenshotName: fileName(state.screenshotName, `Compose render state ${index} screenshotName`),
      observation: string(state.observation, `Compose render state ${index} observation`),
    };
  });
  requireUnique(renderStates.map((state) => state.id), "Compose render state IDs");
  return {
    schemaVersion: 1,
    objective: string(record.objective, "Compose request objective"),
    baselineRevision: sha(record.baselineRevision, "Compose request baselineRevision"),
    approvedCandidateReference: contentReference(record.approvedCandidateReference, "Compose request approvedCandidateReference"),
    approvedCandidatePath: relativePath(record.approvedCandidatePath, "Compose request approvedCandidatePath"),
    specificationPath: relativePath(record.specificationPath, "Compose request specificationPath"),
    specificationSha256: sha(record.specificationSha256, "Compose request specificationSha256"),
    writablePaths: uniqueRelativePaths(record.writablePaths, "Compose request writablePaths"),
    verificationChecks: uniqueStrings(record.verificationChecks, "Compose request verificationChecks", 1),
    renderStates,
    constraints: uniqueStrings(record.constraints, "Compose request constraints", 1),
    repairBudget: repairBudget as 0 | 1 | 2,
  };
}

export function composeOutputSchemasForPreflight(
  request: ComposeRefineRequest,
): readonly JsonValue[] {
  const reviewReferenceIds = [
    "specification",
    "approved-candidate",
    "revision",
    ...request.verificationChecks.map((id) => `verification:${id}`),
    ...request.renderStates.flatMap((state) => [`before:${state.id}`, `after:${state.id}`]),
  ];
  return [
    implementationSchema(request.writablePaths, "implement"),
    implementationSchema(request.writablePaths, "repair-1"),
    implementationSchema(request.writablePaths, "repair-2"),
    reviewSchema(reviewReferenceIds, "review-1"),
    reviewSchema(reviewReferenceIds, "review-2"),
    reviewSchema(reviewReferenceIds, "review-3"),
  ];
}

export async function runFrontendComposeRefineWorkflow(
  options: ComposeRefineWorkflowOptions,
): Promise<ComposeRefineWorkflowResult> {
  if (!Number.isSafeInteger(options.implementationTimeoutMs) || options.implementationTimeoutMs < 1) {
    throw new Error("Compose implementationTimeoutMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.reviewTimeoutMs) || options.reviewTimeoutMs < 1) {
    throw new Error("Compose reviewTimeoutMs must be a positive safe integer");
  }
  const roles = roleRegistry(options);
  const plan = composePlan(roles);
  const client = new PlanCodexClient(options.ledger, plan, undefined, options.codex);
  let repairIndex = 0;
  let reviewIndex = 0;
  let latestArtifactReference = "";
  let latestReviewReference = "";

  const loop = await runReviewerRepair(
    options.request,
    {
      id: "frontend-implementer",
      async implement() {
        return await implement("implement", [], undefined);
      },
      async revise(_request, artifact, findings) {
        repairIndex += 1;
        const stage = implementationTaskIds[repairIndex];
        if (stage === undefined) throw new Error("Compose repair stage exceeds the fixed task plan");
        return await implement(stage, findings, artifact);
      },
    },
    {
      id: "composition-reviewer",
      async inspect(_request, artifact, priorFindings) {
        reviewIndex += 1;
        const taskId = reviewTaskIds[reviewIndex - 1];
        if (taskId === undefined) throw new Error("Compose review stage exceeds the fixed task plan");
        const decision = await review(taskId, artifact, priorFindings);
        if (decision.kind === "repair") {
          return { ...decision, repairOwner: "implementer" } satisfies ReviewDecision;
        }
        return decision;
      },
      async repair() {
        throw new Error("The composition reviewer has no write authority");
      },
    },
    {
      maxReviewPasses: options.request.repairBudget + 1,
      maxRepairs: options.request.repairBudget,
    },
    { ledger: options.ledger },
  );

  if (loop.status === "budget_exhausted") return { status: "exhausted", issue: loop.issue };
  if (loop.status === "escalated") return { status: "stopped", issue: loop.issue };
  if (loop.artifact.status !== "ready_for_review") {
    return { status: "stopped", issue: "Reviewer accepted a revision without complete verification and render evidence" };
  }
  if (latestArtifactReference.length === 0 || latestReviewReference.length === 0) {
    throw new Error("Completed compose workflow is missing stored artifact references");
  }
  return {
    status: "ready_for_human_review",
    artifact: loop.artifact,
    artifactReference: latestArtifactReference,
    reviewReference: latestReviewReference,
  };

  async function implement(
    taskId: ImplementationTaskId,
    findings: readonly ReviewFinding[],
    priorArtifact: RevisionArtifact | undefined,
  ) {
    const result = await client.invoke({
      taskId,
      delegation: implementationDelegation(plan.tasks.find((task) => task.id === taskId)!, options.request, findings, priorArtifact),
      input: toJson({ stage: taskId, findings }),
      outputSchema: implementationSchema(options.request.writablePaths, taskId),
      decode: (value) => decodeImplementationDecision(value, options.request.writablePaths, taskId),
      extractEvidence: (decision) => decision.evidence,
      timeoutMs: options.implementationTimeoutMs,
      freshThread: false,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const materialized = await options.environment.materialize({
      stage: taskId,
      decision: result.value,
      ...(priorArtifact === undefined ? {} : { priorArtifact }),
      findings,
    });
    validateRevisionArtifact(materialized.artifact, options.request, taskId);
    latestArtifactReference = await options.artifacts.store(taskId, toJson(materialized.artifact));
    await client.acceptTask(taskId, acceptedEvaluation(plan.tasks.find((task) => task.id === taskId)!));
    return {
      artifact: materialized.artifact,
      evidence: [...result.value.evidence, ...materialized.evidence],
    };
  }

  async function review(
    taskId: ReviewTaskId,
    artifact: RevisionArtifact,
    priorFindings: readonly ReviewFinding[],
  ): Promise<CompositionReviewDecision> {
    const allowedReferences = reviewReferences(options.request, artifact);
    const result = await client.invoke({
      taskId,
      delegation: reviewDelegation(plan.tasks.find((task) => task.id === taskId)!, options.request, artifact, priorFindings, allowedReferences),
      input: toJson({ taskId, priorFindingIds: priorFindings.map((finding) => finding.id) }),
      outputSchema: reviewSchema(allowedReferences, taskId),
      decode: (value) => decodeReviewDecision(value, allowedReferences, taskId),
      extractEvidence: (decision) => decision.evidence,
      timeoutMs: options.reviewTimeoutMs,
      freshThread: true,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    validateReviewDecision(result.value, artifact);
    latestReviewReference = await options.artifacts.store(taskId, toJson(result.value));
    await client.acceptTask(taskId, acceptedEvaluation(plan.tasks.find((task) => task.id === taskId)!));
    return result.value;
  }
}

function roleRegistry(options: ComposeRefineWorkflowOptions): readonly CodexRole[] {
  return [
    {
      identity: "frontend-implementer",
      role: "primary frontend implementation owner",
      scope: ["approved-workspace-presentation"],
      capabilities: ["implement", "repair"],
      authority: ["read", "write"],
      thread: {
        model: options.model,
        modelReasoningEffort: "high",
        workingDirectory: options.repositoryDirectory,
        // The host environment validates the exact writable paths before it
        // materializes any model-authored change.
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
    },
    {
      identity: "composition-reviewer",
      role: "independent rendered composition reviewer",
      scope: ["prepared-render-evidence"],
      capabilities: ["verify"],
      authority: ["read", "verify"],
      thread: {
        model: options.model,
        modelReasoningEffort: "high",
        workingDirectory: options.reviewerDirectory,
        skipGitRepoCheck: true,
        // This role starts in a host-prepared evidence directory, has no workflow
        // write authority, and has no network access.
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
    },
  ];
}

function composePlan(roles: readonly CodexRole[]) {
  const implementationCriteria = ["model output decoded", "workspace diff remained in scope", "revision evidence stored"];
  const reviewCriteria = ["review output decoded", "review cites only supplied evidence", "review decision stored"];
  return validateWorkflowPlan({
    objective: "Implement the approved frontend specification and run bounded rendered composition review",
    acceptanceCriteria: ["a verified rendered revision reaches the human review gate or the workflow stops visibly"],
    primaryRoleId: "frontend-implementer",
    loop: "reviewer-repair",
    roles,
    tasks: [
      task("implement", "frontend-implementer", [], implementationCriteria),
      task("review-1", "composition-reviewer", ["implement"], reviewCriteria),
      task("repair-1", "frontend-implementer", ["review-1"], implementationCriteria),
      task("review-2", "composition-reviewer", ["repair-1"], reviewCriteria),
      task("repair-2", "frontend-implementer", ["review-2"], implementationCriteria),
      task("review-3", "composition-reviewer", ["repair-2"], reviewCriteria),
    ],
  }, {
    owner: "compose-controller",
    justification: "The host validates exact implementation paths and isolates review in a prepared evidence directory before either role starts",
    dangerFullAccessRoleIds: ["frontend-implementer", "composition-reviewer"],
  });
}

function task(id: ImplementationTaskId | ReviewTaskId, roleId: string, dependencies: readonly string[], criteria: readonly string[]): PlannedTask {
  const implementation = roleId === "frontend-implementer";
  return {
    id,
    roleId,
    purpose: implementation ? `${id} the approved frontend presentation` : `${id} the rendered frontend evidence`,
    scope: [implementation ? "approved-workspace-presentation" : "prepared-render-evidence"],
    requiredCapabilities: [implementation ? id === "implement" ? "implement" : "repair" : "verify"],
    grantedAuthority: [implementation ? "write" : "verify"],
    dependencies,
    acceptanceCriteria: criteria,
    expectedEvidence: [id],
    maxAttempts: 1,
  };
}

function implementationDelegation(
  task: PlannedTask,
  request: ComposeRefineRequest,
  findings: readonly ReviewFinding[],
  priorArtifact: RevisionArtifact | undefined,
): Delegation {
  return {
    from: "frontend-implementer",
    to: "frontend-implementer",
    purpose: task.purpose,
    scope: task.scope,
    requiredCapabilities: task.requiredCapabilities,
    context: toJson({
      objective: "Edit the approved frontend presentation. The host environment owns verification, rendering, revision materialization, and evidence storage after this turn.",
      approvedCandidatePath: request.approvedCandidatePath,
      approvedCandidateReference: request.approvedCandidateReference,
      specificationPath: request.specificationPath,
      writablePaths: request.writablePaths,
      findings,
      priorArtifact,
    }),
    constraints: [
      "Implement only the approved frontend specification and candidate",
      `Edit only these paths: ${request.writablePaths.join(", ")}`,
      "Preserve all content, labels, actions, state ownership, focus behavior, and disabled behavior",
      "Use the existing component library and Tailwind utilities",
      "The host project owns its work record and repository transaction",
      "Do not edit workflow evidence, run tests or builds, start a browser, or commit; the host environment owns those actions",
      `Every evidence item kind must be exactly ${task.id}`,
      "Evidence references may use only approved-candidate and specification",
      "Return only schema-valid JSON after completing the edits",
    ],
    grantedAuthority: task.grantedAuthority,
    expectedEvidence: task.expectedEvidence,
    returnContract: "Return the implemented summary, exact changed paths, and task-owned evidence",
  };
}

function reviewDelegation(
  task: PlannedTask,
  request: ComposeRefineRequest,
  artifact: RevisionArtifact,
  priorFindings: readonly ReviewFinding[],
  allowedReferences: readonly string[],
): Delegation {
  return {
    from: "frontend-implementer",
    to: "composition-reviewer",
    purpose: task.purpose,
    scope: task.scope,
    requiredCapabilities: task.requiredCapabilities,
    context: toJson({ objective: "Judge the supplied rendered composition against the approved specification and return a bounded review decision.", artifact, priorFindings }),
    constraints: [
      "Inspect specification.md, candidate-a.json, manifest.json, and the supplied before and after screenshots",
      "Use view_image directly for the supplied screenshots; do not start a browser, inspect image metadata, recompute hashes, or search for other viewing tools",
      "The controller already validated screenshot hashes, dimensions, console output, and horizontal overflow",
      "Judge the rendered result before requesting source context",
      "Do not inspect the product repository, source code, CSS, component names, or Git history",
      "Do not invent content, actions, states, or responsive conclusions",
      "Accept only when verification passed and every required rendered state is present",
      "Request repair only for concrete blocking findings supported by supplied evidence",
      `Evidence references may use only: ${allowedReferences.join(", ")}`,
      `Every evidence item kind must be exactly ${task.id}`,
      "Human visual acceptance remains outside this workflow",
      "Return only schema-valid JSON",
    ],
    grantedAuthority: task.grantedAuthority,
    expectedEvidence: task.expectedEvidence,
    returnContract: "Return accept, repair with typed findings, or escalate",
  };
}

function implementationSchema(writablePaths: readonly string[], taskId: ImplementationTaskId): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "summary", "changedFiles", "evidence"],
    properties: {
      kind: { type: "string", enum: ["implemented"] },
      summary: { type: "string", minLength: 1 },
      changedFiles: { type: "array", minItems: 1, items: { type: "string", enum: [...writablePaths] } },
      evidence: evidenceSchema(["approved-candidate", "specification"], taskId),
    },
  };
}

function reviewSchema(allowedReferences: readonly string[], taskId: ReviewTaskId): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "findings", "issue", "evidence"],
    properties: {
      kind: { type: "string", enum: ["accept", "repair", "escalate"] },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "dimension", "summary", "evidence"],
          properties: {
            id: { type: "string", minLength: 1 },
            dimension: { type: "string", enum: reviewDimensions },
            summary: { type: "string", minLength: 1 },
            evidence: evidenceSchema(allowedReferences, taskId),
          },
        },
      },
      issue: { type: "string" },
      evidence: evidenceSchema(allowedReferences, taskId),
    },
  };
}

function evidenceSchema(references: readonly string[], kind: string): JsonValue {
  return {
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "references"],
      properties: {
        kind: { type: "string", enum: [kind] },
        summary: { type: "string", minLength: 1 },
        references: { type: "array", minItems: 1, items: { type: "string", enum: [...references] } },
      },
    },
  };
}

function decodeImplementationDecision(value: unknown, writablePaths: readonly string[], taskId: ImplementationTaskId): ImplementationDecision {
  const record = exactRecord(value, ["kind", "summary", "changedFiles", "evidence"], `${taskId} decision`);
  if (record.kind !== "implemented") throw new Error(`${taskId} decision kind must be implemented`);
  const changedFiles = uniqueRelativePaths(record.changedFiles, `${taskId} changedFiles`);
  const invalid = changedFiles.filter((path) => !writablePaths.includes(path));
  if (invalid.length > 0) throw new Error(`${taskId} changed files exceed writable scope: ${invalid.join(", ")}`);
  return {
    kind: "implemented",
    summary: string(record.summary, `${taskId} summary`),
    changedFiles,
    evidence: decodeEvidence(record.evidence, taskId, new Set(["approved-candidate", "specification"])),
  };
}

function decodeReviewDecision(value: unknown, allowedReferences: readonly string[], taskId: ReviewTaskId): CompositionReviewDecision {
  const record = exactRecord(value, ["kind", "findings", "issue", "evidence"], `${taskId} decision`);
  const evidence = decodeEvidence(record.evidence, taskId, new Set(allowedReferences));
  const findings = array(record.findings, `${taskId} findings`, 0).map((entry, index) => {
    const finding = exactRecord(entry, ["id", "dimension", "summary", "evidence"], `${taskId} finding ${index}`);
    const dimension = enumeration(finding.dimension, reviewDimensions, `${taskId} finding ${index} dimension`);
    return {
      id: string(finding.id, `${taskId} finding ${index} id`),
      summary: `[${dimension}] ${string(finding.summary, `${taskId} finding ${index} summary`)}`,
      evidence: decodeEvidence(finding.evidence, taskId, new Set(allowedReferences)),
    };
  });
  requireUnique(findings.map((finding) => finding.id), `${taskId} finding IDs`);
  const issue = typeof record.issue === "string" ? record.issue.trim() : "";
  if (record.kind === "accept") {
    if (findings.length > 0) throw new Error(`${taskId} accept cannot include findings`);
    return { kind: "accept", evidence };
  }
  if (record.kind === "repair") {
    if (findings.length === 0 || issue.length > 0) throw new Error(`${taskId} repair requires findings and no issue`);
    return { kind: "repair", findings, evidence };
  }
  if (record.kind === "escalate") {
    if (findings.length > 0 || issue.length === 0) throw new Error(`${taskId} escalate requires one issue and no findings`);
    return { kind: "escalate", issue, evidence };
  }
  throw new Error(`${taskId} decision kind is unsupported`);
}

function validateRevisionArtifact(artifact: RevisionArtifact, request: ComposeRefineRequest, stage: ImplementationTaskId): void {
  if (artifact.stage !== stage) throw new Error(`Revision artifact stage must be ${stage}`);
  sha(artifact.revision, "Revision artifact revision");
  if (artifact.changedFiles.length === 0) throw new Error("Revision artifact must contain changed files");
  const invalid = artifact.changedFiles.filter((path) => !request.writablePaths.includes(path));
  if (invalid.length > 0) throw new Error(`Revision artifact exceeds writable scope: ${invalid.join(", ")}`);
  requireSameSet(artifact.verification.map((check) => check.id), request.verificationChecks, "Revision verification checks");
  if (artifact.status === "ready_for_review") {
    if (artifact.verification.some((check) => !check.ok)) throw new Error("Ready revision contains a failed verification check");
    if (artifact.render.revision !== artifact.revision) throw new Error("Render evidence revision differs from the artifact revision");
    requireSameSet(artifact.render.states.map((state) => state.id), request.renderStates.map((state) => state.id), "Render states");
  } else if (artifact.verification.every((check) => check.ok)) {
    throw new Error("Failed revision must contain a failed verification check");
  }
}

function validateReviewDecision(decision: CompositionReviewDecision, artifact: RevisionArtifact): void {
  if (decision.kind === "accept" && artifact.status !== "ready_for_review") {
    throw new Error("Review cannot accept a revision without verification and render evidence");
  }
}

function reviewReferences(request: ComposeRefineRequest, artifact: RevisionArtifact): readonly string[] {
  const references = [
    "specification",
    "approved-candidate",
    "revision",
    ...request.verificationChecks.map((id) => `verification:${id}`),
    ...request.renderStates.map((state) => `before:${state.id}`),
  ];
  if (artifact.status === "ready_for_review") {
    references.push(...request.renderStates.map((state) => `after:${state.id}`));
  } else {
    references.push("verification-failure");
  }
  return references;
}

function acceptedEvaluation(task: PlannedTask) {
  return validateTaskAcceptanceEvaluation({
    taskId: task.id,
    criteria: task.acceptanceCriteria.map((criterion) => ({ criterion, satisfied: true })),
  });
}

function decodeEvidence(value: unknown, kind: string, references: ReadonlySet<string>): readonly Evidence[] {
  return array(value, `${kind} evidence`, 1).map((entry, index) => {
    const item = exactRecord(entry, ["kind", "summary", "references"], `${kind} evidence ${index}`);
    if (item.kind !== kind) throw new Error(`${kind} evidence ${index} kind must be ${kind}`);
    const itemReferences = uniqueStrings(item.references, `${kind} evidence ${index} references`, 0);
    const invalid = itemReferences.filter((reference) => !references.has(reference));
    if (invalid.length > 0) throw new Error(`${kind} evidence contains unknown references: ${invalid.join(", ")}`);
    return { kind, summary: string(item.summary, `${kind} evidence ${index} summary`), references: itemReferences };
  });
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} keys differ from the contract${unknown.length === 0 ? "" : `; unknown: ${unknown.join(", ")}`}${missing.length === 0 ? "" : `; missing: ${missing.join(", ")}`}`);
  }
  return record;
}

function array(value: unknown, label: string, minimum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum) throw new Error(`${label} must contain at least ${minimum} items`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function sha(value: unknown, label: string): string {
  const result = string(value, label);
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} must be a lowercase Git or SHA-256 hash`);
  return result;
}

function contentReference(value: unknown, label: string): string {
  const result = string(value, label);
  if (!/^sha256:[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} must be a SHA-256 content reference`);
  return result;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function uniqueStrings(value: unknown, label: string, minimum: number): readonly string[] {
  const values = array(value, label, minimum).map((entry, index) => string(entry, `${label} ${index}`));
  requireUnique(values, label);
  return values;
}

function uniqueRelativePaths(value: unknown, label: string): readonly string[] {
  const values = array(value, label, 1).map((entry, index) => relativePath(entry, `${label} ${index}`));
  requireUnique(values, label);
  return values;
}

function relativePath(value: unknown, label: string): string {
  const result = string(value, label).replaceAll("\\", "/");
  if (result.startsWith("/") || /^[A-Za-z]:\//u.test(result) || result.split("/").includes("..")) {
    throw new Error(`${label} must be a contained relative path`);
  }
  return result;
}

function fileName(value: unknown, label: string): string {
  const result = relativePath(value, label);
  if (result.includes("/")) throw new Error(`${label} must be one file name`);
  return result;
}

function enumeration<const Values extends readonly string[]>(value: unknown, values: Values, label: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new Error(`${label} has an unsupported value`);
  return value as Values[number];
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
}

function requireSameSet(actual: readonly string[], expected: readonly string[], label: string): void {
  requireUnique(actual, label);
  if (actual.length !== expected.length || actual.some((value) => !expected.includes(value))) {
    throw new Error(`${label} must exactly match the request`);
  }
}
