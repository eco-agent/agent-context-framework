import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  objectiveId,
  type ArtifactReference,
  type ContextReference,
  type ObjectiveDefinition,
  type ObjectiveEvidence,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import {
  decodeCapabilityRequest,
  decodeImplementationContract,
  decodeProductPrecedentMaterialization,
  type CapabilityRequest,
  type ImplementationContractV2,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import {
  FilesystemArtifactStore,
  JsonlObjectiveStore,
  ObjectiveScheduler,
  SystemObjectiveClock,
} from "@agent-context/objective-runtime";
import {
  CodexObjectiveRunner,
  CodexWorkflowClient,
  JsonlLedger,
  publishTaskEnvelope,
  type CodexRole,
  type JsonValue,
  type TaskEnvelopeSourceBinding,
} from "../src/index.js";

interface ReadmeResult {
  readonly kind: "readme";
  readonly summary: string;
  readonly lineCount: number;
  readonly sha256: string;
}

interface ProductPrecedentResult {
  readonly kind: "product_precedent";
  readonly summary: string;
  readonly product: string;
  readonly sourceRevision: string;
  readonly license: string;
  readonly adoptedPatterns: readonly string[];
  readonly boardStatuses: readonly string[];
  readonly evidencePaths: readonly string[];
}

interface ProductTopologyUiResult {
  readonly kind: "product_topology_ui";
  readonly summary: string;
  readonly files: readonly string[];
}

type DemoResult = ReadmeResult | ProductPrecedentResult | ProductTopologyUiResult;

interface DemoConfiguration {
  readonly objectiveKey: string;
  readonly purpose: string;
  readonly acceptance: ObjectiveDefinition["acceptance"];
  readonly context: readonly ContextReference[];
  readonly role: Omit<CodexRole, "identity" | "thread">;
  readonly capability: CapabilityRequest;
  readonly implementationContract: ImplementationContractV2 | null;
  readonly productPrecedentMaterialization: ProductPrecedentMaterializationV2 | null;
  readonly binding: TaskEnvelopeSourceBinding;
  readonly taskInput: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (input: unknown) => DemoResult;
  readonly verify: (value: DemoResult) => string | null | Promise<string | null>;
  readonly sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  readonly constraints: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly returnContract: string;
  readonly completionSummary: string;
  readonly evidence: (
    value: DemoResult,
    artifact: ArtifactReference,
    revision: string,
  ) => readonly ObjectiveEvidence[];
}

const repositoryInput = requiredEnvironment("OBJECTIVE_DEMO_REPOSITORY");
const stateInput = requiredEnvironment("OBJECTIVE_DEMO_STATE");
const durableObjectiveId = objectiveId(requiredEnvironment("OBJECTIVE_DEMO_ID"));
const demoKind = process.env.OBJECTIVE_DEMO_KIND ?? "readme";
const repository = await realpath(repositoryInput);
const stateRoot = resolve(stateInput);
await mkdir(stateRoot, { recursive: true });

const branch = git(repository, ["branch", "--show-current"]) || "detached";
const revision = git(repository, ["rev-parse", "HEAD"]);
const configuration = demoKind === "product_precedent"
  ? await productPrecedentConfiguration(repository, durableObjectiveId)
  : demoKind === "product_topology_ui"
    ? await productTopologyUiConfiguration(repository, durableObjectiveId)
    : await readmeConfiguration(repository, durableObjectiveId, revision);
const clock = new SystemObjectiveClock();
const store = await JsonlObjectiveStore.open(join(stateRoot, "objectives.jsonl"), { clock });
const artifacts = new FilesystemArtifactStore(join(stateRoot, "artifacts"));
const coordinator: TrustedActor = {
  actorId: "demo-coordinator",
  capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.coordinate],
};
const worker: TrustedActor = {
  actorId: "demo-codex-worker",
  capabilities: [OBJECTIVE_CAPABILITIES.execute],
};

try {
  if (await store.get(durableObjectiveId) === undefined) {
    const definition: ObjectiveDefinition = {
      schemaVersion: 1,
      objectiveId: durableObjectiveId,
      objectiveKey: configuration.objectiveKey,
      purpose: configuration.purpose,
      parent: { type: "root" },
      dependencies: [],
      authority: { allowedActors: [coordinator.actorId, worker.actorId] },
      acceptance: configuration.acceptance,
      budget: {
        maxAttempts: 2,
        maxTransitions: 12,
        maxContextBytes: demoKind === "product_topology_ui" ? 400_000 : 200_000,
        maxPromptBytes: demoKind === "product_topology_ui" ? 400_000 : 200_000,
        maxAgentInputTokens: demoKind === "product_topology_ui" ? 400_000 : 200_000,
        maxAgentOutputTokens: 20_000,
      },
      context: configuration.context,
      metadata: { adapter: "codex", demonstration: demoKind },
    };
    const created = await store.execute(
      {
        type: "create",
        schemaVersion: 1,
        commandId: commandId(randomUUID()),
        objectiveId: durableObjectiveId,
        definition,
      },
      coordinator,
    );
    if (created.status !== "accepted") {
      throw new Error(`Demo objective creation failed: ${created.status}`);
    }
  }

  const ledger = await JsonlLedger.open(
    join(stateRoot, "codex-evidence.jsonl"),
    `demo-${durableObjectiveId}`,
  );
  const role: CodexRole = {
    identity: worker.actorId,
    ...configuration.role,
    thread: {
      workingDirectory: repository,
      sandboxMode: configuration.sandboxMode,
      approvalPolicy: "never",
      networkAccessEnabled: false,
      modelReasoningEffort: "low",
    },
  };
  const runner = new CodexObjectiveRunner<DemoResult>({
    clientFor: () => new CodexWorkflowClient(ledger),
    launchFor: async (context) => {
      const published = await publishTaskEnvelope(context, {
        root: repository,
        binding: configuration.binding,
        capability: configuration.capability,
        implementationContract: configuration.implementationContract,
        productPrecedentMaterialization: configuration.productPrecedentMaterialization,
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Task envelope publication failed: ${message}\n`);
        throw error;
      });
      return {
        executionDirectory: repository,
        envelope: published.envelope,
        envelopeArtifact: published.artifact,
        invocation: {
          role,
          delegation: {
            objectiveId: context.snapshot.definition.objectiveId,
            from: coordinator.actorId,
            to: worker.actorId,
            purpose: configuration.purpose,
            scope: [...role.scope],
            context: { revision, demoKind },
            constraints: [...configuration.constraints],
            grantedAuthority: [...role.authority],
            expectedEvidence: [...configuration.expectedEvidence],
            returnContract: configuration.returnContract,
          },
          repository: { branch, baseRevision: revision, headRevision: revision },
          authority: [...role.authority],
          input: configuration.taskInput,
          outputSchema: configuration.outputSchema,
          decode: configuration.decode,
        },
        async release() {},
      };
    },
    async outcomeFor(value) {
      const mismatch = await configuration.verify(value);
      if (mismatch !== null) {
        return {
          type: "failed",
          code: "deterministic_verification_mismatch",
          message: mismatch,
          retryable: false,
          evidence: [],
        };
      }
      const artifact = await artifacts.put({
        bytes: Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
        mediaType: "application/json",
        label: "verified Codex structured result",
      });
      return {
        type: "completed",
        summary: configuration.completionSummary,
        evidence: configuration.evidence(value, artifact, revision),
      };
    },
  });
  const scheduler = new ObjectiveScheduler({
    store,
    runner,
    clock,
    workerActor: worker,
    coordinatorActor: coordinator,
    workerId: worker.actorId,
    maxConcurrency: 1,
    leaseDurationMs: demoKind === "product_topology_ui" ? 600_000 : 60_000,
    artifactStore: artifacts,
  });
  const summary = await scheduler.runUntilIdle();
  const snapshot = await store.get(durableObjectiveId);
  process.stdout.write(`${JSON.stringify({ summary, snapshot })}\n`);
  if (snapshot?.state !== "terminal" || snapshot.outcome.type !== "completed") {
    process.exitCode = 1;
  }
} finally {
  await store.close();
}

async function readmeConfiguration(
  root: string,
  id: ReturnType<typeof objectiveId>,
  revision: string,
): Promise<DemoConfiguration> {
  const readme = await readFile(join(root, "README.md"));
  const expectedLineCount = countLines(readme);
  const expectedHash = sha256(readme);
  const purpose = "Inspect committed README.md and return deterministic structured facts.";
  return {
    objectiveKey: "restricted-real-codex-proof",
    purpose,
    acceptance: [
      { gateId: "git-revision", description: "Identify the exact Git revision.", evidenceTypes: ["git-revision"] },
      { gateId: "structured-result", description: "Verify the structured result.", evidenceTypes: ["structured-result"] },
    ],
    context: [{ type: "git", repository: root, revision, path: "README.md" }],
    role: {
      role: "restricted repository inspector",
      scope: ["README.md"],
      capabilities: ["read", "structured-output"],
      authority: ["read", "verify"],
    },
    sandboxMode: "read-only",
    constraints: [
      "Do not modify files.",
      "Do not use the network.",
      "Use only verified envelope context and repository source evidence.",
      "Return only schema-valid JSON.",
    ],
    expectedEvidence: ["README byte facts"],
    returnContract: "ReadmeResult",
    completionSummary: "Restricted README inspection passed deterministic verification.",
    capability: {
      objectiveId: id,
      objective: purpose,
      contractPath: "README.md",
      baselineRevision: revision,
      supersedes: [],
      writablePaths: [],
      readableReferences: [],
      verificationProfile: "workflow",
      repairBudget: 0,
    },
    implementationContract: null,
    productPrecedentMaterialization: null,
    binding: {
      requestPath: "objective-demo-request.json",
      requestHash: expectedHash,
      contractPath: "README.md",
      contractHash: expectedHash,
      implementationContract: null,
      productPrecedentMaterialization: null,
      baselineRevision: revision,
    },
    taskInput: {
      request: "Inspect README.md. Count lines using exact bytes and compute SHA-256.",
      file: "README.md",
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "lineCount", "sha256"],
      properties: {
        kind: { type: "string", enum: ["readme"] },
        summary: { type: "string", minLength: 1 },
        lineCount: { type: "integer", minimum: 0 },
        sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      },
    },
    decode: decodeReadmeResult,
    verify(value) {
      return value.kind !== "readme" ||
        value.lineCount !== expectedLineCount ||
        value.sha256 !== expectedHash
        ? "README result did not match direct byte verification."
        : null;
    },
    evidence(value, artifact, inspectedRevision) {
      if (value.kind !== "readme") return [];
      return [
        { evidenceType: "git-revision", summary: `Inspected committed revision ${inspectedRevision}.` },
        { evidenceType: "structured-result", summary: `README.md has ${value.lineCount} lines and SHA-256 ${value.sha256}.`, artifact },
      ];
    },
  };
}

async function productPrecedentConfiguration(
  root: string,
  id: ReturnType<typeof objectiveId>,
): Promise<DemoConfiguration> {
  const requestPath = requiredEnvironment("OBJECTIVE_DEMO_REQUEST");
  const requestBytes = await readFile(join(root, requestPath));
  const requestInput: unknown = JSON.parse(requestBytes.toString("utf8"));
  const capability = decodeCapabilityRequest(requestInput);
  if (capability.objectiveId !== id) {
    throw new Error("Product precedent capability objective does not match OBJECTIVE_DEMO_ID.");
  }
  if (capability.verificationProfile !== "product-topology") {
    throw new Error("Product precedent demo requires a product-topology capability.");
  }
  const implementationPath = capability.implementationContractPath;
  const implementationBytes = await readFile(join(root, implementationPath));
  const implementationInput: unknown = JSON.parse(implementationBytes.toString("utf8"));
  const implementation = decodeImplementationContract(implementationInput);
  const precedent = implementation.productPrecedent;
  if (precedent === null) {
    throw new Error("Product precedent demo requires a product precedent.");
  }
  const materializationBytes = await readFile(join(root, precedent.materializationPath));
  const materializationInput: unknown = JSON.parse(materializationBytes.toString("utf8"));
  const productPrecedentMaterialization = decodeProductPrecedentMaterialization(
    materializationInput,
  );
  const contractBytes = await readFile(join(root, capability.contractPath));
  const evidencePaths = [
    "client/src/Project/index.jsx",
    "client/src/Project/Board/index.jsx",
    "client/src/shared/constants/issues.js",
    "client/cypress/integration/issuesDragDrop.spec.js",
    "client/cypress/integration/issueFilters.spec.js",
  ];
  const expectedStatuses = ["Backlog", "Selected for development", "In progress", "Done"];
  const purpose = capability.objective;
  return {
    objectiveKey: "pinned-product-precedent-proof",
    purpose,
    acceptance: [
      { gateId: "precedent-topology", description: "Return source-backed product topology.", evidenceTypes: ["product-precedent"] },
      { gateId: "objective-delta", description: "Keep only the objective-specific deviation.", evidenceTypes: ["product-delta"] },
    ],
    context: [
      { type: "git", repository: root, revision: git(root, ["rev-parse", "HEAD"]) },
      { type: "external", provider: "git", reference: precedent.source.repository, revision: precedent.source.revision },
    ],
    role: {
      role: "product precedent source inspector",
      scope: ["README.md", "client/src/Project", "client/src/shared/constants", "client/cypress/integration"],
      capabilities: ["read", "structured-output", "source-verification"],
      authority: ["read", "verify"],
    },
    sandboxMode: "read-only",
    constraints: [
      "Do not modify files.",
      "Do not use the network.",
      "Use only verified envelope context and repository source evidence.",
      "Return only schema-valid JSON.",
    ],
    expectedEvidence: ["pinned source facts", "repository paths"],
    returnContract: "ProductPrecedentResult",
    completionSummary: "Pinned product source facts passed deterministic verification.",
    capability,
    implementationContract: implementation,
    productPrecedentMaterialization,
    binding: {
      requestPath,
      requestHash: sha256(requestBytes),
      contractPath: capability.contractPath,
      contractHash: sha256(contractBytes),
      implementationContract: { path: implementationPath, hash: sha256(implementationBytes) },
      productPrecedentMaterialization: {
        path: precedent.materializationPath,
        hash: sha256(materializationBytes),
      },
      baselineRevision: capability.baselineRevision,
    },
    taskInput: {
      request: "Inspect the pinned Jira clone source. Return the exact adopted contract patterns, board statuses, and source paths.",
      sourceRevision: precedent.source.revision,
      sourcePaths: evidencePaths,
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "kind", "summary", "product", "sourceRevision", "license",
        "adoptedPatterns", "boardStatuses", "evidencePaths",
      ],
      properties: {
        kind: { type: "string", enum: ["product_precedent"] },
        summary: { type: "string", minLength: 1 },
        product: { type: "string", minLength: 1 },
        sourceRevision: { type: "string", pattern: "^[a-f0-9]{40}$" },
        license: { type: "string", minLength: 1 },
        adoptedPatterns: { type: "array", items: { type: "string" }, minItems: 1 },
        boardStatuses: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
        evidencePaths: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
      },
    },
    decode: decodeProductPrecedentResult,
    verify(value) {
      if (value.kind !== "product_precedent") return "Product precedent result kind is invalid.";
      if (
        value.product !== precedent.product ||
        value.sourceRevision !== precedent.source.revision ||
        value.license !== precedent.source.license ||
        !sameStrings(value.adoptedPatterns, precedent.adopt) ||
        !sameStrings(value.boardStatuses, expectedStatuses) ||
        !sameStrings(value.evidencePaths, evidencePaths)
      ) {
        return "Product precedent result did not match pinned contract and source facts.";
      }
      return null;
    },
    evidence(value, artifact) {
      if (value.kind !== "product_precedent") return [];
      return [
        { evidenceType: "product-precedent", summary: `${value.product} ${value.sourceRevision} (${value.license}) supplied the source-backed topology facts.`, artifact },
        { evidenceType: "product-delta", summary: "The structured result reproduced only the pinned contract and inspected source facts." },
      ];
    },
  };
}

async function productTopologyUiConfiguration(
  root: string,
  id: ReturnType<typeof objectiveId>,
): Promise<DemoConfiguration> {
  const base = await productPrecedentConfiguration(root, id);
  const precedent = base.implementationContract?.productPrecedent;
  if (precedent === null || precedent === undefined || precedent.implementation.kind !== "reuse") {
    throw new Error("Product topology UI demo requires reusable pinned source files.");
  }
  const reuse = precedent.implementation;
  const expectedFiles = [
    ...reuse.files.map((file) => file.targetPath),
    reuse.licenseNoticePath,
  ];
  const materialization = base.productPrecedentMaterialization;
  if (materialization === null) throw new Error("Product topology UI materialization is missing.");
  return {
    ...base,
    objectiveKey: "pinned-product-topology-ui-proof",
    purpose: base.capability.objective,
    acceptance: [
      { gateId: "ui-topology", description: "Prove the retained Jira topology uses pinned upstream source bytes.", evidenceTypes: ["source-adoption"] },
      { gateId: "ui-states", description: "Retain the upstream interaction tests with the implementation.", evidenceTypes: ["source-adoption"] },
    ],
    role: {
      role: "pinned product source adoption verifier",
      scope: expectedFiles,
      capabilities: ["read", "structured-output", "source-verification"],
      authority: ["read", "verify"],
    },
    sandboxMode: "read-only",
    constraints: [
      "Do not modify files.",
      "Do not use the network.",
      "Verify the materialized Jira source files supplied in the envelope.",
      "Do not generate replacement HTML, CSS, content, or controls.",
      "Return schema-valid JSON only after verifying the retained files.",
    ],
    expectedEvidence: ["pinned source hashes", "retained MIT notice", "upstream interaction tests"],
    returnContract: "ProductTopologyUiResult",
    completionSummary: "Pinned Jira product-topology source and license passed direct byte verification.",
    taskInput: {
      request: "Verify that every retained Jira project-board file is copied from the pinned upstream commit and that the upstream interaction tests are present. Do not rewrite the interface.",
      outputFiles: expectedFiles,
      sourceRevision: precedent.source.revision,
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "files"],
      properties: {
        kind: { type: "string", enum: ["product_topology_ui"] },
        summary: { type: "string", minLength: 1 },
        files: {
          type: "array",
          items: { type: "string", enum: expectedFiles },
          minItems: expectedFiles.length,
          maxItems: expectedFiles.length,
        },
      },
    },
    decode: decodeProductTopologyUiResult,
    async verify(value) {
      if (value.kind !== "product_topology_ui" || !sameStrings(value.files, expectedFiles)) {
        return "Product topology UI result did not name the exact authorized outputs.";
      }
      for (const source of materialization.sourceFiles) {
        const target = await readFile(join(root, source.targetPath)).catch(() => null);
        if (target === null || sha256(target) !== source.sha256) {
          return `Materialized Jira source differs from pinned bytes: ${source.targetPath}.`;
        }
      }
      const license = await readFile(join(root, reuse.licenseNoticePath))
        .catch(() => null);
      if (license === null || sha256(license) !== materialization.license.sha256) {
        return "Retained Jira license notice differs from pinned bytes.";
      }
      return null;
    },
    evidence(value, artifact) {
      if (value.kind !== "product_topology_ui") return [];
      return [{
        evidenceType: "source-adoption",
        summary: `Verified ${materialization.sourceFiles.length} Jira source files and the MIT notice against pinned Git bytes.`,
        artifact,
      }];
    },
  };
}

function decodeReadmeResult(input: unknown): ReadmeResult {
  const value = strictRecord(input, ["kind", "summary", "lineCount", "sha256"], "Readme result");
  if (
    value.kind !== "readme" ||
    typeof value.summary !== "string" || value.summary.length < 1 ||
    typeof value.lineCount !== "number" || !Number.isSafeInteger(value.lineCount) || value.lineCount < 0 ||
    typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    throw new TypeError("Readme result is invalid.");
  }
  return { kind: "readme", summary: value.summary, lineCount: value.lineCount, sha256: value.sha256 };
}

function decodeProductPrecedentResult(input: unknown): ProductPrecedentResult {
  const value = strictRecord(input, [
    "kind", "summary", "product", "sourceRevision", "license", "adoptedPatterns",
    "boardStatuses", "evidencePaths",
  ], "Product precedent result");
  if (
    value.kind !== "product_precedent" ||
    typeof value.summary !== "string" || value.summary.length < 1 ||
    typeof value.product !== "string" || value.product.length === 0 ||
    typeof value.sourceRevision !== "string" || !/^[a-f0-9]{40}$/u.test(value.sourceRevision) ||
    typeof value.license !== "string" || value.license.length === 0
  ) {
    throw new TypeError("Product precedent result is invalid.");
  }
  return {
    kind: "product_precedent",
    summary: value.summary,
    product: value.product,
    sourceRevision: value.sourceRevision,
    license: value.license,
    adoptedPatterns: stringArray(value.adoptedPatterns, "adoptedPatterns"),
    boardStatuses: stringArray(value.boardStatuses, "boardStatuses"),
    evidencePaths: stringArray(value.evidencePaths, "evidencePaths"),
  };
}

function decodeProductTopologyUiResult(input: unknown): ProductTopologyUiResult {
  const value = strictRecord(input, ["kind", "summary", "files"], "Product topology UI result");
  if (
    value.kind !== "product_topology_ui" ||
    typeof value.summary !== "string" || value.summary.length < 1
  ) {
    throw new TypeError("Product topology UI result is invalid.");
  }
  return {
    kind: "product_topology_ui",
    summary: value.summary,
    files: stringArray(value.files, "files"),
  };
}

function strictRecord(
  input: unknown,
  allowedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new TypeError(`${label} must be an object.`);
  }
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    throw new TypeError(`${label} contains unknown fields.`);
  }
  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function stringArray(input: unknown, label: string): readonly string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
  return input;
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function countLines(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  return lines + (bytes.at(-1) === 0x0a ? 0 : 1);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
