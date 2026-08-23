import {
  ObjectiveCodexClient,
  createObjectiveLoopContext,
  decodeObjectiveId,
  ObjectiveJsonlLedger,
  runRelayChain,
  type CodexRole,
  type Decision,
  type JsonValue,
  type ObjectiveDelegation,
} from "../src/index.js";
import { execFileSync } from "node:child_process";

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

function decodeAcceptedString(value: unknown): Decision<string> {
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

  return {
    kind: "accept",
    artifact: value.artifact,
    confidence: value.confidence,
    evidence: value.evidence,
  };
}

async function main(): Promise<void> {
  const objectiveId = decodeObjectiveId(crypto.randomUUID());
  const ledger = await ObjectiveJsonlLedger.open(
    ".codex-runs/example-relay.jsonl",
    crypto.randomUUID(),
  );
  const client = new ObjectiveCodexClient(ledger);
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  const headRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const baseRevision = execFileSync(
    "git",
    ["merge-base", "main", "HEAD"],
    { encoding: "utf8" },
  ).trim();

  const roles: readonly CodexRole[] = [
    {
      identity: "primary",
      role: "implementer and integrator",
      scope: ["repository"],
      capabilities: ["plan", "write"],
      authority: ["read", "write"],
      thread: {
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
        workingDirectory: process.cwd(),
        sandboxMode: "read-only",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        modelReasoningEffort: "medium",
      },
    },
  ];

  const result = await runRelayChain(
    "Implement the requested change",
    roles.map((role) => ({
      id: role.identity,
      async run(artifact: string): Promise<Decision<string>> {
        const delegation: ObjectiveDelegation = {
          objectiveId,
          from: "workflow-primary",
          to: role.identity,
          purpose: role.role,
          scope: role.scope,
          requiredCapabilities: role.capabilities,
          context: { artifact },
          constraints: ["Preserve task ownership in the primary role"],
          grantedAuthority: role.authority,
          expectedEvidence: ["diff or verification signal"],
          returnContract: "Return a schema-valid stage decision",
        };
        const response = await client.invoke({
          objective: {
            objectiveId,
            repository: {
              branch,
              baseRevision,
              headRevision,
            },
            authority: role.authority,
            acceptanceGates: ["schema-valid decision", "required evidence"],
            previousResult: null,
            maxPromptBytes: 20_000,
            maxLedgerStateBytes: 2_000,
            threadPolicy:
              role.identity === "verifier"
                ? "fresh"
                : "reuse_within_objective",
            terminalAfterTurn: false,
          },
          role,
          delegation,
          input: { artifact },
          outputSchema: decisionSchema,
          decode: decodeAcceptedString,
        });
        return response.value;
      },
    })),
    { maxTransitions: 4, maxRepairs: 1 },
    createObjectiveLoopContext(objectiveId, ledger),
  );

  console.log(result);
}

await main();
