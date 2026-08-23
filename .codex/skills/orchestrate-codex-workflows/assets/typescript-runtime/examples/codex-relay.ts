import {
  PlanCodexClient,
  JsonlLedger,
  assertConfidence,
  validateTaskAcceptanceEvaluation,
  validateWorkflowPlan,
  type CodexRole,
  type Decision,
  type Delegation,
  type Evidence,
  type JsonValue,
  type PlannedTask,
} from "../src/index.js";

type AcceptedStringDecision = Extract<
  Decision<string>,
  { readonly kind: "accept" }
>;

const decisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "artifact", "confidence", "evidence"],
  properties: {
    kind: { type: "string", enum: ["accept"] },
    artifact: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "summary", "references"],
        properties: {
          kind: { type: "string" },
          summary: { type: "string" },
          references: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const satisfies JsonValue;

function decodeAcceptedString(
  value: unknown,
): AcceptedStringDecision {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "accept" ||
    !("artifact" in value) ||
    typeof value.artifact !== "string" ||
    !("confidence" in value) ||
    typeof value.confidence !== "number" ||
    !("evidence" in value) ||
    !Array.isArray(value.evidence) ||
    !value.evidence.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "kind" in item &&
        typeof item.kind === "string" &&
        "summary" in item &&
        typeof item.summary === "string" &&
        "references" in item &&
        Array.isArray(item.references) &&
        item.references.every(
          (reference: unknown) => typeof reference === "string",
        ),
    )
  ) {
    throw new Error("Codex returned an invalid relay decision");
  }
  assertConfidence(value.confidence);

  return {
    kind: "accept",
    artifact: value.artifact,
    confidence: value.confidence,
    evidence: value.evidence,
  };
}

function evaluateTaskAcceptance(
  task: PlannedTask,
  decision: AcceptedStringDecision,
) {
  const evidenceKinds = new Set(decision.evidence.map((item) => item.kind));
  const checks = new Map<string, boolean>([
    ["artifact is non-empty", decision.artifact.trim().length > 0],
    [
      "confidence is at least 0.8",
      Number.isFinite(decision.confidence) && decision.confidence >= 0.8,
    ],
    [
      "all expected evidence kinds are present",
      task.expectedEvidence.every((kind) => evidenceKinds.has(kind)),
    ],
  ]);

  return validateTaskAcceptanceEvaluation({
    taskId: task.id,
    // Project code owns the concrete checks. It does not ask generic runtime
    // code to interpret the plan's prose criteria.
    criteria: task.acceptanceCriteria.map((criterion) => {
      const satisfied = checks.get(criterion);
      if (satisfied === undefined) {
        throw new Error(`No project acceptance check owns: ${criterion}`);
      }
      return { criterion, satisfied };
    }),
  });
}

async function main(): Promise<void> {
  const model = requireEnvironment("CODEX_MODEL");
  const ledger = await JsonlLedger.open(
    ".codex-runs/example-relay.jsonl",
    crypto.randomUUID(),
  );
  const roles: readonly CodexRole[] = [
    {
      identity: "primary",
      role: "implementer and integrator",
      scope: ["repository"],
      capabilities: ["plan", "write"],
      authority: ["read", "write"],
      thread: {
        model,
        workingDirectory: process.cwd(),
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        modelReasoningEffort: "high",
      },
    },
    {
      identity: "verifier",
      role: "independent verifier",
      scope: ["repository"],
      capabilities: ["verify"],
      authority: ["read", "verify"],
      thread: {
        model,
        workingDirectory: process.cwd(),
        sandboxMode: "read-only",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        modelReasoningEffort: "medium",
      },
    },
  ];
  const plan = validateWorkflowPlan({
    objective: "Implement the requested change",
    acceptanceCriteria: [
      "both planned tasks are accepted with implementation and verification evidence",
    ],
    primaryRoleId: "primary",
    loop: "relay-chain",
    roles,
    tasks: [
      {
        id: "implement",
        roleId: "primary",
        purpose: "Implement and integrate the requested change",
        scope: ["repository"],
        requiredCapabilities: ["plan", "write"],
        grantedAuthority: ["read", "write"],
        dependencies: [],
        acceptanceCriteria: [
          "artifact is non-empty",
          "confidence is at least 0.8",
          "all expected evidence kinds are present",
        ],
        expectedEvidence: ["implementation"],
        maxAttempts: 2,
      },
      {
        id: "verify",
        roleId: "verifier",
        purpose: "Independently verify the requested behavior",
        scope: ["repository"],
        requiredCapabilities: ["verify"],
        grantedAuthority: ["read", "verify"],
        dependencies: ["implement"],
        acceptanceCriteria: [
          "artifact is non-empty",
          "confidence is at least 0.8",
          "all expected evidence kinds are present",
        ],
        expectedEvidence: ["verification"],
        maxAttempts: 2,
      },
    ],
  });
  const client = new PlanCodexClient(ledger, plan);

  let artifact = "Implement the requested change";
  const acceptedEvidence: Evidence[] = [];
  const acceptedTaskIds = new Set<string>();
  for (const taskId of plan.topologicalOrder) {
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) throw new Error(`Unknown planned task ${taskId}`);
    const role = plan.roles.find((candidate) => candidate.identity === task.roleId);
    if (role === undefined) throw new Error(`Unknown planned role ${task.roleId}`);
    const delegation: Delegation = {
      from: plan.primaryRoleId,
      to: role.identity,
      purpose: task.purpose,
      scope: task.scope,
      requiredCapabilities: task.requiredCapabilities,
      context: { artifact },
      constraints: ["Preserve task ownership in the primary role"],
      grantedAuthority: task.grantedAuthority,
      expectedEvidence: task.expectedEvidence,
      returnContract: "Return a schema-valid accepted task decision",
    };
    const response = await client.invoke({
      taskId,
      delegation,
      input: { artifact },
      outputSchema: decisionSchema,
      decode: decodeAcceptedString,
      extractEvidence: (decision) => decision.evidence,
      timeoutMs: 60_000,
      freshThread: role.identity === "verifier",
    });
    const evaluation = evaluateTaskAcceptance(task, response.value);
    // The client checks exact criteria coverage, then records acceptance using
    // only the evidence frozen from this successful turn.
    await client.acceptTask(taskId, evaluation);
    acceptedTaskIds.add(taskId);
    artifact = response.value.artifact;
    acceptedEvidence.push(...response.value.evidence);
  }

  const acceptedEvidenceKinds = new Set(
    acceptedEvidence.map((item) => item.kind),
  );
  const workflowAcceptance = plan.acceptanceCriteria.map((criterion) => {
    if (
      criterion !==
      "both planned tasks are accepted with implementation and verification evidence"
    ) {
      throw new Error(`No project workflow acceptance check owns: ${criterion}`);
    }
    return {
      criterion,
      satisfied:
        acceptedTaskIds.size === plan.tasks.length &&
        acceptedEvidenceKinds.has("implementation") &&
        acceptedEvidenceKinds.has("verification"),
    };
  });
  if (workflowAcceptance.some((criterion) => !criterion.satisfied)) {
    throw new Error("Project workflow acceptance criteria are not satisfied");
  }

  console.log({
    status: "completed",
    artifact,
    evidence: acceptedEvidence,
    workflowAcceptance,
  });
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must select an approved Codex model`);
  }
  return value;
}

await main();
