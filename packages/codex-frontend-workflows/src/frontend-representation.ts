import {
  PlanCodexClient,
  assertConfidence,
  toJson,
  validateTaskAcceptanceEvaluation,
  validateWorkflowPlan,
  type CodexRole,
  type Delegation,
  type Evidence,
  type EvidenceLedger,
  type JsonValue,
  type PlannedTask,
  type WorkflowCodex,
} from "@agent-context/codex-workflow-runtime";

const compositionModes = ["single-flow", "split-pane", "workbench", "master-detail"] as const;
const containmentKinds = ["none", "primary", "additional"] as const;
const comparisonDimensions = [
  "hierarchy",
  "grouping",
  "alignment",
  "density",
  "surfaces",
  "omission",
  "state-legibility",
] as const;

type CompositionMode = (typeof compositionModes)[number];
type ContainmentKind = (typeof containmentKinds)[number];
type ComparisonDimension = (typeof comparisonDimensions)[number];

export interface RepresentationEvidence {
  readonly id: string;
  readonly kind: "screenshot" | "layout-facts" | "product-task" | "constraint";
  readonly reference: string;
  readonly observation: string;
}

export interface RepresentationState {
  readonly id: string;
  readonly description: string;
  readonly userNeed: string;
}

export interface RepresentationRequest {
  readonly schemaVersion: 1;
  readonly subject: string;
  readonly decision: string;
  readonly audience: string;
  readonly productJob: string;
  readonly contentIds: readonly string[];
  readonly requiredStates: readonly RepresentationState[];
  readonly evidence: readonly RepresentationEvidence[];
  readonly constraints: readonly string[];
}

export interface SpatialGroup {
  readonly id: string;
  readonly contentIds: readonly string[];
  readonly layoutOwner: string;
  readonly containment: ContainmentKind;
  readonly interactionReason: string;
}

export interface StateTreatment {
  readonly stateId: string;
  readonly treatment: string;
}

export interface RepresentationCandidate {
  readonly id: "a" | "b";
  readonly title: string;
  readonly thesis: string;
  readonly compositionMode: CompositionMode;
  readonly readingOrder: readonly string[];
  readonly spatialGroups: readonly SpatialGroup[];
  readonly primarySurfaceCount: 0 | 1;
  readonly additionalSurfaceReasons: readonly string[];
  readonly density: {
    readonly rowHeightPx: number;
    readonly gapPx: number;
    readonly controlHeightPx: number;
    readonly source: string;
  };
  readonly preservedContentIds: readonly string[];
  readonly stateTreatments: readonly StateTreatment[];
  readonly omissions: readonly string[];
  readonly majorChoiceReplaced: string;
}

export interface ComparisonFinding {
  readonly dimension: ComparisonDimension;
  readonly candidateA: string;
  readonly candidateB: string;
  readonly judgment: string;
}

export interface RepresentationComparison {
  readonly recommended: "a" | "b";
  readonly findings: readonly ComparisonFinding[];
  readonly selectedReason: string;
  readonly rejectedRisk: string;
  readonly unresolvedRisks: readonly string[];
  readonly approvalQuestion: string;
}

interface AcceptedDecision<T> {
  readonly kind: "accept";
  readonly artifact: T;
  readonly confidence: number;
  readonly evidence: readonly Evidence[];
}

export interface RepresentationArtifactStore {
  store(name: "candidate-a" | "candidate-b" | "comparison", value: JsonValue): Promise<string>;
}

export interface RepresentationWorkflowOptions {
  readonly request: RepresentationRequest;
  readonly workingDirectory: string;
  readonly ledger: EvidenceLedger;
  readonly artifacts: RepresentationArtifactStore;
  readonly model: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly codex?: WorkflowCodex;
}

export interface RepresentationWorkflowResult {
  readonly status: "awaiting_human_approval";
  readonly candidateA: RepresentationCandidate;
  readonly candidateAReference: string;
  readonly candidateB: RepresentationCandidate;
  readonly candidateBReference: string;
  readonly comparison: RepresentationComparison;
  readonly comparisonReference: string;
}

function evidenceSchema(evidenceIds: readonly string[], evidenceKind: string): JsonValue {
  return {
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "references"],
      properties: {
        kind: { type: "string", enum: [evidenceKind] },
        summary: { type: "string", minLength: 1 },
        references: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: [...evidenceIds] },
        },
      },
    },
  } as const satisfies JsonValue;
}

function candidateSchema(evidenceIds: readonly string[], evidenceKind: "candidate-a" | "candidate-b"): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "artifact", "confidence", "evidence"],
    properties: {
      kind: { type: "string", enum: ["accept"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      evidence: evidenceSchema(evidenceIds, evidenceKind),
      artifact: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "title", "thesis", "compositionMode", "readingOrder", "spatialGroups",
        "primarySurfaceCount", "additionalSurfaceReasons", "density", "preservedContentIds",
        "stateTreatments", "omissions", "majorChoiceReplaced",
      ],
      properties: {
        id: { type: "string", enum: ["a", "b"] },
        title: { type: "string", minLength: 1 },
        thesis: { type: "string", minLength: 1 },
        compositionMode: { type: "string", enum: compositionModes },
        readingOrder: { type: "array", minItems: 2, items: { type: "string", minLength: 1 } },
        spatialGroups: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "contentIds", "layoutOwner", "containment", "interactionReason"],
            properties: {
              id: { type: "string", minLength: 1 },
              contentIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              layoutOwner: { type: "string", minLength: 1 },
              containment: { type: "string", enum: containmentKinds },
              interactionReason: { type: "string", minLength: 1 },
            },
          },
        },
        primarySurfaceCount: { type: "integer", enum: [0, 1] },
        additionalSurfaceReasons: { type: "array", items: { type: "string", minLength: 1 } },
        density: {
          type: "object",
          additionalProperties: false,
          required: ["rowHeightPx", "gapPx", "controlHeightPx", "source"],
          properties: {
            rowHeightPx: { type: "integer", minimum: 24, maximum: 40 },
            gapPx: { type: "integer", minimum: 8, maximum: 20 },
            controlHeightPx: { type: "integer", minimum: 24, maximum: 36 },
            source: { type: "string", minLength: 1 },
          },
        },
        preservedContentIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        stateTreatments: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["stateId", "treatment"],
            properties: {
              stateId: { type: "string", minLength: 1 },
              treatment: { type: "string", minLength: 1 },
            },
          },
        },
        omissions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        majorChoiceReplaced: { type: "string", minLength: 1 },
      },
      },
    },
  } as const satisfies JsonValue;
}

function comparisonSchema(evidenceIds: readonly string[]): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "artifact", "confidence", "evidence"],
    properties: {
      kind: { type: "string", enum: ["accept"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      evidence: evidenceSchema(evidenceIds, "comparison"),
      artifact: {
      type: "object",
      additionalProperties: false,
      required: ["recommended", "findings", "selectedReason", "rejectedRisk", "unresolvedRisks", "approvalQuestion"],
      properties: {
        recommended: { type: "string", enum: ["a", "b"] },
        findings: {
          type: "array",
          minItems: comparisonDimensions.length,
          maxItems: comparisonDimensions.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dimension", "candidateA", "candidateB", "judgment"],
            properties: {
              dimension: { type: "string", enum: comparisonDimensions },
              candidateA: { type: "string", minLength: 1 },
              candidateB: { type: "string", minLength: 1 },
              judgment: { type: "string", minLength: 1 },
            },
          },
        },
        selectedReason: { type: "string", minLength: 1 },
        rejectedRisk: { type: "string", minLength: 1 },
        unresolvedRisks: { type: "array", items: { type: "string", minLength: 1 } },
        approvalQuestion: { type: "string", minLength: 1 },
      },
      },
    },
  } as const satisfies JsonValue;
}

export function decodeRepresentationRequest(value: unknown): RepresentationRequest {
  const record = exactRecord(value, [
    "schemaVersion", "subject", "decision", "audience", "productJob", "contentIds",
    "requiredStates", "evidence", "constraints",
  ], "Representation request");
  if (record.schemaVersion !== 1) throw new Error("Representation request schemaVersion must be 1");
  const contentIds = uniqueStrings(record.contentIds, "Representation contentIds", 1);
  const requiredStates = array(record.requiredStates, "Representation requiredStates", 1).map((entry, index) => {
    const state = exactRecord(entry, ["id", "description", "userNeed"], `Representation state ${index}`);
    return {
      id: string(state.id, `Representation state ${index} id`),
      description: string(state.description, `Representation state ${index} description`),
      userNeed: string(state.userNeed, `Representation state ${index} userNeed`),
    };
  });
  requireUnique(requiredStates.map((state) => state.id), "Representation state IDs");
  const evidence = array(record.evidence, "Representation evidence", 1).map((entry, index) => {
    const item = exactRecord(entry, ["id", "kind", "reference", "observation"], `Representation evidence ${index}`);
    return {
      id: string(item.id, `Representation evidence ${index} id`),
      kind: enumeration(item.kind, ["screenshot", "layout-facts", "product-task", "constraint"], `Representation evidence ${index} kind`),
      reference: string(item.reference, `Representation evidence ${index} reference`),
      observation: string(item.observation, `Representation evidence ${index} observation`),
    };
  });
  requireUnique(evidence.map((item) => item.id), "Representation evidence IDs");
  return {
    schemaVersion: 1,
    subject: string(record.subject, "Representation subject"),
    decision: string(record.decision, "Representation decision"),
    audience: string(record.audience, "Representation audience"),
    productJob: string(record.productJob, "Representation productJob"),
    contentIds,
    requiredStates,
    evidence,
    constraints: uniqueStrings(record.constraints, "Representation constraints", 1),
  };
}

export function representationOutputSchemasForPreflight(
  request: RepresentationRequest,
): readonly JsonValue[] {
  const evidenceIds = request.evidence.map((item) => item.id);
  return [
    candidateSchema(evidenceIds, "candidate-a"),
    candidateSchema(evidenceIds, "candidate-b"),
    comparisonSchema(evidenceIds),
  ];
}

export async function runFrontendRepresentationWorkflow(
  options: RepresentationWorkflowOptions,
): Promise<RepresentationWorkflowResult> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error("Representation timeoutMs must be a positive safe integer");
  }
  const roles = roleRegistry(options.model, options.workingDirectory);
  const plan = representationPlan(roles);
  const client = new PlanCodexClient(options.ledger, plan, undefined, options.codex);
  const evidenceIdList = options.request.evidence.map((item) => item.id);
  const evidenceIds = new Set(evidenceIdList);

  const candidateAResult = await client.invoke({
    taskId: "candidate-a",
    delegation: delegationFor(plan.tasks[0]!, "representation-author", {
      request: toJson(options.request),
      instruction: "Create the quietest coherent composition. Preserve every content ID and state. Do not inspect source code.",
    }, evidenceIdList),
    input: toJson({ request: options.request }),
    outputSchema: candidateSchema(evidenceIdList, "candidate-a"),
    decode: (value) => decodeCandidateDecision(value, "a"),
    extractEvidence: (decision) => decision.evidence,
    timeoutMs: options.timeoutMs,
    freshThread: true,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  validateCandidate(candidateAResult.value, options.request, evidenceIds, "candidate-a");
  const candidateAReference = await options.artifacts.store("candidate-a", toJson(candidateAResult.value.artifact));
  await client.acceptTask("candidate-a", acceptedEvaluation(plan.tasks[0]!));

  const candidateBResult = await client.invoke({
    taskId: "candidate-b",
    delegation: delegationFor(plan.tasks[1]!, "representation-author", {
      request: toJson(options.request),
      candidateA: toJson(candidateAResult.value.artifact),
      candidateAReference,
      instruction: "Replace one major composition choice. Preserve every content ID and state. Do not inspect source code.",
    }, evidenceIdList),
    input: toJson({ request: options.request, candidateA: candidateAResult.value.artifact, candidateAReference }),
    outputSchema: candidateSchema(evidenceIdList, "candidate-b"),
    decode: (value) => decodeCandidateDecision(value, "b"),
    extractEvidence: (decision) => decision.evidence,
    timeoutMs: options.timeoutMs,
    freshThread: true,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  validateCandidate(candidateBResult.value, options.request, evidenceIds, "candidate-b");
  if (candidateBResult.value.artifact.compositionMode === candidateAResult.value.artifact.compositionMode) {
    throw new Error("Candidate B must replace the composition mode used by candidate A");
  }
  if (candidateBResult.value.artifact.majorChoiceReplaced.trim().toLowerCase() === "none") {
    throw new Error("Candidate B must name the major choice it replaced");
  }
  const candidateBReference = await options.artifacts.store("candidate-b", toJson(candidateBResult.value.artifact));
  await client.acceptTask("candidate-b", acceptedEvaluation(plan.tasks[1]!));

  const comparisonResult = await client.invoke({
    taskId: "compare",
    delegation: delegationFor(plan.tasks[2]!, "representation-reviewer", {
      request: toJson(options.request),
      candidateA: toJson(candidateAResult.value.artifact),
      candidateAReference,
      candidateB: toJson(candidateBResult.value.artifact),
      candidateBReference,
      instruction: "Compare rendered-evidence implications only. Do not inspect source code and do not claim human approval.",
    }, evidenceIdList),
    input: toJson({
      request: options.request,
      candidateA: candidateAResult.value.artifact,
      candidateAReference,
      candidateB: candidateBResult.value.artifact,
      candidateBReference,
    }),
    outputSchema: comparisonSchema(evidenceIdList),
    decode: decodeComparisonDecision,
    extractEvidence: (decision) => decision.evidence,
    timeoutMs: options.timeoutMs,
    freshThread: true,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  validateComparison(comparisonResult.value, evidenceIds);
  const comparisonReference = await options.artifacts.store("comparison", toJson(comparisonResult.value.artifact));
  await client.acceptTask("compare", acceptedEvaluation(plan.tasks[2]!));

  return {
    status: "awaiting_human_approval",
    candidateA: candidateAResult.value.artifact,
    candidateAReference,
    candidateB: candidateBResult.value.artifact,
    candidateBReference,
    comparison: comparisonResult.value.artifact,
    comparisonReference,
  };
}

function roleRegistry(model: string, workingDirectory: string): readonly CodexRole[] {
  return [
    {
      identity: "representation-author",
      role: "frontend representation author",
      scope: ["prepared-evidence"],
      capabilities: ["propose"],
      authority: ["read", "propose"],
      thread: {
        model,
        modelReasoningEffort: "high",
        workingDirectory,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
    },
    {
      identity: "representation-reviewer",
      role: "independent frontend composition reviewer",
      scope: ["prepared-evidence"],
      capabilities: ["verify"],
      authority: ["read", "verify"],
      thread: {
        model,
        modelReasoningEffort: "high",
        workingDirectory,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
    },
  ];
}

function representationPlan(roles: readonly CodexRole[]) {
  return validateWorkflowPlan({
    objective: "Produce two evidence-grounded frontend compositions and compare them for human approval",
    acceptanceCriteria: ["all three fixed representation tasks are deterministically accepted"],
    primaryRoleId: "representation-author",
    loop: "authority-ladder",
    roles,
    tasks: [
      task("candidate-a", "representation-author", "Create candidate A", [], "candidate-a"),
      task("candidate-b", "representation-author", "Replace one major choice and create candidate B", ["candidate-a"], "candidate-b"),
      task("compare", "representation-reviewer", "Compare both candidates without approving either", ["candidate-a", "candidate-b"], "comparison"),
    ],
  });
}

function task(id: string, roleId: string, purpose: string, dependencies: readonly string[], evidenceKind: string): PlannedTask {
  return {
    id,
    roleId,
    purpose,
    scope: ["prepared-evidence"],
    requiredCapabilities: [roleId === "representation-author" ? "propose" : "verify"],
    grantedAuthority: [roleId === "representation-author" ? "propose" : "verify"],
    dependencies,
    acceptanceCriteria: ["output decoded", "required content and states preserved", "evidence references allowed"],
    expectedEvidence: [evidenceKind],
    maxAttempts: 1,
  };
}

function delegationFor(
  task: PlannedTask,
  roleId: string,
  context: JsonValue,
  evidenceIds: readonly string[],
): Delegation {
  return {
    from: "representation-author",
    to: roleId,
    purpose: task.purpose,
    scope: task.scope,
    requiredCapabilities: task.requiredCapabilities,
    context,
    constraints: [
      "Use only the prepared evidence packet and prior accepted artifacts",
      "Do not inspect TSX, CSS, component source, or repository history",
      "Do not invent content, controls, navigation, actions, or states",
      "Semantic code boundaries do not imply visual containment",
      `Evidence references must use these evidence IDs, never file paths: ${evidenceIds.join(", ")}`,
      `Every evidence item kind must be exactly: ${task.expectedEvidence.join(", ")}`,
      "Return only schema-valid JSON",
    ],
    grantedAuthority: task.grantedAuthority,
    expectedEvidence: task.expectedEvidence,
    returnContract: "Return one accepted decision matching the supplied JSON schema",
  };
}

function acceptedEvaluation(task: PlannedTask) {
  return validateTaskAcceptanceEvaluation({
    taskId: task.id,
    criteria: task.acceptanceCriteria.map((criterion) => ({ criterion, satisfied: true })),
  });
}

function decodeCandidateDecision(value: unknown, expectedId: "a" | "b"): AcceptedDecision<RepresentationCandidate> {
  const decision = exactRecord(value, ["kind", "artifact", "confidence", "evidence"], `Candidate ${expectedId} decision`);
  if (decision.kind !== "accept") throw new Error(`Candidate ${expectedId} decision kind must be accept`);
  const confidence = number(decision.confidence, `Candidate ${expectedId} confidence`);
  assertConfidence(confidence);
  const artifact = decodeCandidate(decision.artifact, expectedId);
  return { kind: "accept", artifact, confidence, evidence: decodeEvidence(decision.evidence, `Candidate ${expectedId} evidence`) };
}

function decodeCandidate(value: unknown, expectedId: "a" | "b"): RepresentationCandidate {
  const candidate = exactRecord(value, [
    "id", "title", "thesis", "compositionMode", "readingOrder", "spatialGroups",
    "primarySurfaceCount", "additionalSurfaceReasons", "density", "preservedContentIds",
    "stateTreatments", "omissions", "majorChoiceReplaced",
  ], `Candidate ${expectedId}`);
  if (candidate.id !== expectedId) throw new Error(`Candidate ID must be ${expectedId}`);
  const density = exactRecord(candidate.density, ["rowHeightPx", "gapPx", "controlHeightPx", "source"], `Candidate ${expectedId} density`);
  const rowHeightPx = boundedInteger(density.rowHeightPx, 24, 40, `Candidate ${expectedId} rowHeightPx`);
  const gapPx = boundedInteger(density.gapPx, 8, 20, `Candidate ${expectedId} gapPx`);
  const controlHeightPx = boundedInteger(density.controlHeightPx, 24, 36, `Candidate ${expectedId} controlHeightPx`);
  const primarySurfaceCount = boundedInteger(candidate.primarySurfaceCount, 0, 1, `Candidate ${expectedId} primarySurfaceCount`) as 0 | 1;
  return {
    id: expectedId,
    title: string(candidate.title, `Candidate ${expectedId} title`),
    thesis: string(candidate.thesis, `Candidate ${expectedId} thesis`),
    compositionMode: enumeration(candidate.compositionMode, compositionModes, `Candidate ${expectedId} compositionMode`),
    readingOrder: uniqueStrings(candidate.readingOrder, `Candidate ${expectedId} readingOrder`, 2),
    spatialGroups: array(candidate.spatialGroups, `Candidate ${expectedId} spatialGroups`, 2).map((entry, index) => {
      const group = exactRecord(entry, ["id", "contentIds", "layoutOwner", "containment", "interactionReason"], `Candidate ${expectedId} group ${index}`);
      return {
        id: string(group.id, `Candidate ${expectedId} group ${index} id`),
        contentIds: uniqueStrings(group.contentIds, `Candidate ${expectedId} group ${index} contentIds`, 1),
        layoutOwner: string(group.layoutOwner, `Candidate ${expectedId} group ${index} layoutOwner`),
        containment: enumeration(group.containment, containmentKinds, `Candidate ${expectedId} group ${index} containment`),
        interactionReason: string(group.interactionReason, `Candidate ${expectedId} group ${index} interactionReason`),
      };
    }),
    primarySurfaceCount,
    additionalSurfaceReasons: uniqueStrings(candidate.additionalSurfaceReasons, `Candidate ${expectedId} additionalSurfaceReasons`, 0),
    density: {
      rowHeightPx,
      gapPx,
      controlHeightPx,
      source: string(density.source, `Candidate ${expectedId} density source`),
    },
    preservedContentIds: uniqueStrings(candidate.preservedContentIds, `Candidate ${expectedId} preservedContentIds`, 1),
    stateTreatments: array(candidate.stateTreatments, `Candidate ${expectedId} stateTreatments`, 1).map((entry, index) => {
      const treatment = exactRecord(entry, ["stateId", "treatment"], `Candidate ${expectedId} state treatment ${index}`);
      return {
        stateId: string(treatment.stateId, `Candidate ${expectedId} state treatment ${index} stateId`),
        treatment: string(treatment.treatment, `Candidate ${expectedId} state treatment ${index} treatment`),
      };
    }),
    omissions: uniqueStrings(candidate.omissions, `Candidate ${expectedId} omissions`, 1),
    majorChoiceReplaced: string(candidate.majorChoiceReplaced, `Candidate ${expectedId} majorChoiceReplaced`),
  };
}

function decodeComparisonDecision(value: unknown): AcceptedDecision<RepresentationComparison> {
  const decision = exactRecord(value, ["kind", "artifact", "confidence", "evidence"], "Comparison decision");
  if (decision.kind !== "accept") throw new Error("Comparison decision kind must be accept");
  const confidence = number(decision.confidence, "Comparison confidence");
  assertConfidence(confidence);
  const artifact = exactRecord(decision.artifact, ["recommended", "findings", "selectedReason", "rejectedRisk", "unresolvedRisks", "approvalQuestion"], "Comparison artifact");
  return {
    kind: "accept",
    confidence,
    evidence: decodeEvidence(decision.evidence, "Comparison evidence"),
    artifact: {
      recommended: enumeration(artifact.recommended, ["a", "b"], "Comparison recommended"),
      findings: array(artifact.findings, "Comparison findings", comparisonDimensions.length).map((entry, index) => {
        const finding = exactRecord(entry, ["dimension", "candidateA", "candidateB", "judgment"], `Comparison finding ${index}`);
        return {
          dimension: enumeration(finding.dimension, comparisonDimensions, `Comparison finding ${index} dimension`),
          candidateA: string(finding.candidateA, `Comparison finding ${index} candidateA`),
          candidateB: string(finding.candidateB, `Comparison finding ${index} candidateB`),
          judgment: string(finding.judgment, `Comparison finding ${index} judgment`),
        };
      }),
      selectedReason: string(artifact.selectedReason, "Comparison selectedReason"),
      rejectedRisk: string(artifact.rejectedRisk, "Comparison rejectedRisk"),
      unresolvedRisks: uniqueStrings(artifact.unresolvedRisks, "Comparison unresolvedRisks", 0),
      approvalQuestion: string(artifact.approvalQuestion, "Comparison approvalQuestion"),
    },
  };
}

function validateCandidate(
  decision: AcceptedDecision<RepresentationCandidate>,
  request: RepresentationRequest,
  evidenceIds: ReadonlySet<string>,
  expectedEvidenceKind: string,
): void {
  requireSameSet(decision.artifact.preservedContentIds, request.contentIds, `${decision.artifact.id} preserved content`);
  requireSameSet(decision.artifact.stateTreatments.map((item) => item.stateId), request.requiredStates.map((item) => item.id), `${decision.artifact.id} state coverage`);
  const grouped = decision.artifact.spatialGroups.flatMap((group) => group.contentIds);
  requireSameSet(grouped, request.contentIds, `${decision.artifact.id} spatial group content`);
  validateDecisionEvidence(decision.evidence, expectedEvidenceKind, evidenceIds);
}

function validateComparison(decision: AcceptedDecision<RepresentationComparison>, evidenceIds: ReadonlySet<string>): void {
  requireSameSet(decision.artifact.findings.map((finding) => finding.dimension), comparisonDimensions, "Comparison dimensions");
  validateDecisionEvidence(decision.evidence, "comparison", evidenceIds);
}

function validateDecisionEvidence(evidence: readonly Evidence[], expectedKind: string, evidenceIds: ReadonlySet<string>): void {
  if (!evidence.some((item) => item.kind === expectedKind)) {
    throw new Error(`Decision evidence must include ${expectedKind}`);
  }
  const invalid = evidence.flatMap((item) => item.references).filter((reference) => !evidenceIds.has(reference));
  if (invalid.length > 0) throw new Error(`Decision evidence contains unknown references: ${invalid.join(", ")}`);
}

function decodeEvidence(value: unknown, label: string): readonly Evidence[] {
  return array(value, label, 1).map((entry, index) => {
    const item = exactRecord(entry, ["kind", "summary", "references"], `${label} ${index}`);
    return {
      kind: string(item.kind, `${label} ${index} kind`),
      summary: string(item.summary, `${label} ${index} summary`),
      references: uniqueStrings(item.references, `${label} ${index} references`, 1),
    };
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

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
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

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
}

function requireSameSet(actual: readonly string[], expected: readonly string[], label: string): void {
  requireUnique(actual, label);
  if (actual.length !== expected.length || actual.some((value) => !expected.includes(value))) {
    throw new Error(`${label} must exactly match the request`);
  }
}

function enumeration<const Values extends readonly string[]>(value: unknown, values: Values, label: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new Error(`${label} has an unsupported value`);
  return value as Values[number];
}
