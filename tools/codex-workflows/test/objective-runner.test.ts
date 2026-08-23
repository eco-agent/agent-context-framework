import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Usage } from "@openai/codex-sdk";
import {
  OBJECTIVE_CAPABILITIES,
  artifactHash,
  commandId,
  objectiveId,
  utcTimestamp,
  type ArtifactHash,
  type ArtifactReference,
  type ObjectiveArtifactStore,
  type ObjectiveDefinition,
  type StoredArtifact,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import {
  ManualObjectiveClock,
  MemoryObjectiveStore,
  ObjectiveScheduler,
  type ObjectiveAttemptContext,
} from "@agent-context/objective-runtime";
import {
  CodexObjectiveRunner,
  type CodexObjectiveInvocation,
  type CodexObjectiveLaunch,
  ObjectiveCodexClient,
  ObjectiveMemoryLedger,
  publishTaskEnvelope,
  type CodexRole,
  type WorkflowCodex,
  type WorkflowThread,
} from "../src/index.js";

const coordinator: TrustedActor = {
  actorId: "codex-coordinator",
  capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.coordinate],
};
const worker: TrustedActor = {
  actorId: "codex-worker",
  capabilities: [OBJECTIVE_CAPABILITIES.execute],
};
const role: CodexRole = {
  identity: "codex-worker",
  role: "bounded implementer",
  scope: ["temporary repository"],
  capabilities: ["structured-output"],
  authority: ["read", "write", "verify"],
  thread: { sandboxMode: "workspace-write", workingDirectory: process.cwd() },
};

test("Codex objective runner persists a thread checkpoint and resumes it on retry", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = objectiveId("72000000-0000-4000-8000-000000000001");
  await createObjective(store, definition(id));
  const fake = new FakeCodex();
  const ledger = new ObjectiveMemoryLedger("codex-objective-runner");
  const runner = new CodexObjectiveRunner<{ readonly result: string }>({
    clientFor: () => new ObjectiveCodexClient(ledger, undefined, fake),
    launchFor: (context) => testLaunch(context, {
      role,
      delegation: {
        objectiveId: context.snapshot.definition.objectiveId,
        from: "codex-coordinator",
        to: "codex-worker",
        purpose: "produce bounded structured work",
        scope: ["temporary repository"],
        requiredCapabilities: ["structured-output"],
        context: null,
        constraints: ["return structured output"],
        grantedAuthority: ["read", "write", "verify"],
        expectedEvidence: ["test"],
        returnContract: "result object",
      },
      repository: { branch: "codex/test", baseRevision: "base", headRevision: "head" },
      authority: ["read", "write", "verify"],
      input: { request: "perform bounded work" },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["result"],
        properties: { result: { type: "string" } },
      },
      decode(value) {
        if (typeof value !== "object" || value === null || !("result" in value) || typeof value.result !== "string") {
          throw new Error("invalid Codex result");
        }
        return { result: value.result };
      },
    }),
    outcomeFor: (value, snapshot) =>
      snapshot.lease.attempt === 1
        ? { type: "retry", reason: "exercise durable resume", retryAfterMs: 0 }
        : {
            type: "completed",
            summary: value.result,
            evidence: [{ evidenceType: "test", summary: "Codex resume passed" }],
          },
  });
  const scheduler = schedulerFor(store, clock, runner);
  const result = await scheduler.runUntilIdle();
  assert.equal(result.acquired, 2);
  assert.equal(result.retried, 1);
  assert.equal(result.completed, 1);
  assert.deepEqual(fake.resumed, ["thread-1"]);
  const snapshot = await store.get(id);
  assert.equal(snapshot?.state, "terminal");
  assert.equal(snapshot?.latestCheckpoint?.resumeToken, "thread-1");
  assert.ok((snapshot?.usage.contextBytes ?? 0) > 68);
  assert.equal(snapshot?.latestCheckpoint?.artifacts.length, 1);
  assert.ok((snapshot?.usage.promptBytes ?? 0) > 0);
  const events = await ledger.list();
  assert.ok(events.length >= 4);
  assert.equal(events.every((event) => event.objectiveId === id), true);
  assert.equal(JSON.stringify(events).includes("structured work complete"), false);
});

test("rendered prompt overflow becomes durable budget exhaustion without retry churn", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = objectiveId("72000000-0000-4000-8000-000000000002");
  await createObjective(store, definition(id, 100));
  const fake = new FakeCodex();
  const runner = new CodexObjectiveRunner<{ readonly result: string }>({
    clientFor: () => new ObjectiveCodexClient(new ObjectiveMemoryLedger("prompt-exhaustion"), undefined, fake),
    launchFor: (context) => testLaunch(context, {
      role,
      delegation: {
        objectiveId: context.snapshot.definition.objectiveId,
        from: "codex-coordinator",
        to: "codex-worker",
        purpose: "prove prompt limit",
        scope: ["temporary repository"],
        requiredCapabilities: ["structured-output"],
        context: null,
        constraints: [],
        grantedAuthority: ["read"],
        expectedEvidence: ["test"],
        returnContract: "result object",
      },
      repository: { branch: "codex/test", baseRevision: "base", headRevision: "head" },
      authority: ["read"],
      input: { request: "will not fit" },
      outputSchema: { type: "object" },
      decode: () => ({ result: "unreachable" }),
    }),
    outcomeFor: () => ({
      type: "completed",
      summary: "unreachable",
      evidence: [{ evidenceType: "test", summary: "unreachable" }],
    }),
  });
  const summary = await schedulerFor(store, clock, runner).runUntilIdle();
  assert.equal(summary.budgetExhausted, 1);
  assert.equal(summary.retried, 0);
  assert.equal(fake.starts, 0);
  const snapshot = await store.get(id);
  assert.equal(snapshot?.state, "terminal");
  if (snapshot?.state === "terminal") assert.equal(snapshot.outcome.type, "budget_exhausted");
});

test("runner rejects a missing authoritative envelope before model execution", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = objectiveId("72000000-0000-4000-8000-000000000004");
  await createObjective(store, definition(id));
  const fake = new FakeCodex();
  const artifacts = new MemoryArtifactStore();
  const runner = new CodexObjectiveRunner<{ readonly result: string }>({
    clientFor: () => new ObjectiveCodexClient(new ObjectiveMemoryLedger("missing-envelope"), undefined, fake),
    launchFor: async (context) => {
      const launch = await testLaunch(context, {
        role,
        delegation: {
          objectiveId: context.snapshot.definition.objectiveId,
          from: "codex-coordinator",
          to: "codex-worker",
          purpose: "reject missing envelope",
          scope: ["temporary repository"],
          requiredCapabilities: ["structured-output"],
          context: null,
          constraints: [],
          grantedAuthority: ["read"],
          expectedEvidence: ["test"],
          returnContract: "result object",
        },
        repository: { branch: "codex/test", baseRevision: "base", headRevision: "head" },
        authority: ["read"],
        input: { request: "must not run" },
        outputSchema: { type: "object" },
        decode: () => ({ result: "unreachable" }),
      });
      artifacts.clear();
      return launch;
    },
    outcomeFor: () => ({
      type: "completed",
      summary: "unreachable",
      evidence: [],
    }),
  });
  const summary = await schedulerFor(store, clock, runner, artifacts).runOnce();
  assert.equal(summary.retried, 1);
  assert.equal(fake.starts, 0);
  assert.equal((await store.get(id))?.state, "ready");
});

test("reported agent tokens are durably metered and terminalize on overflow", async () => {
  const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
  const store = new MemoryObjectiveStore(clock);
  const id = objectiveId("72000000-0000-4000-8000-000000000003");
  await createObjective(store, definition(id, 100_000, 10, 10));
  const fake = new FakeCodex();
  fake.usage = {
    input_tokens: 11,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 2,
    reasoning_output_tokens: 1,
  };
  const runner = new CodexObjectiveRunner<{ readonly result: string }>({
    clientFor: () => new ObjectiveCodexClient(new ObjectiveMemoryLedger("token-exhaustion"), undefined, fake),
    launchFor: (context) => testLaunch(context, {
      role,
      delegation: {
        objectiveId: context.snapshot.definition.objectiveId,
        from: "codex-coordinator",
        to: "codex-worker",
        purpose: "prove token metering",
        scope: ["temporary repository"],
        requiredCapabilities: ["structured-output"],
        context: null,
        constraints: [],
        grantedAuthority: ["read"],
        expectedEvidence: ["test"],
        returnContract: "result object",
      },
      repository: { branch: "codex/test", baseRevision: "base", headRevision: "head" },
      authority: ["read"],
      input: { request: "meter this invocation" },
      outputSchema: { type: "object" },
      decode: () => ({ result: "metered" }),
    }),
    outcomeFor: () => ({
      type: "completed",
      summary: "would complete under budget",
      evidence: [{ evidenceType: "test", summary: "metered" }],
    }),
  });
  const summary = await schedulerFor(store, clock, runner).runUntilIdle();
  assert.equal(summary.budgetExhausted, 1);
  const snapshot = await store.get(id);
  assert.equal(snapshot?.usage.agentInputTokens, 11);
  assert.equal(snapshot?.usage.agentOutputTokens, 3);
  if (snapshot?.state === "terminal" && snapshot.outcome.type === "budget_exhausted") {
    assert.equal(snapshot.outcome.dimension, "maxAgentInputTokens");
  } else {
    assert.fail("token budget did not terminalize the objective");
  }
});

async function testLaunch<T>(
  context: ObjectiveAttemptContext,
  invocation: CodexObjectiveInvocation<T>,
): Promise<CodexObjectiveLaunch<T>> {
  const contractPath = "AGENTS.md";
  const contractBytes = await readFile(contractPath);
  const binding = {
    requestPath: ".codex/work/test-request.json",
    requestHash: "a".repeat(64),
    contractPath,
    contractHash: createHash("sha256").update(contractBytes).digest("hex"),
    implementationContract: null,
    productPrecedentMaterialization: null,
    baselineRevision: "test-baseline",
  };
  const capability = {
    objectiveId: context.snapshot.definition.objectiveId,
    objective: context.snapshot.definition.purpose,
    contractPath,
    baselineRevision: binding.baselineRevision,
    supersedes: [],
    writablePaths: ["temporary repository"],
    readableReferences: [],
    verificationProfile: "workflow" as const,
    repairBudget: 0 as const,
  };
  const published = await publishTaskEnvelope(context, {
    root: process.cwd(),
    binding,
    capability,
    implementationContract: null,
    productPrecedentMaterialization: null,
  });
  return {
    executionDirectory: process.cwd(),
    envelope: published.envelope,
    envelopeArtifact: published.artifact,
    invocation,
    async release() {},
  };
}

function schedulerFor(
  store: MemoryObjectiveStore,
  clock: ManualObjectiveClock,
  runner: CodexObjectiveRunner<{ readonly result: string }>,
  artifactStore: ObjectiveArtifactStore = new MemoryArtifactStore(),
): ObjectiveScheduler {
  return new ObjectiveScheduler({
    store,
    clock,
    runner,
    workerActor: worker,
    coordinatorActor: coordinator,
    workerId: "codex-worker",
    maxConcurrency: 1,
    leaseDurationMs: 60_000,
    artifactStore,
  });
}

class MemoryArtifactStore implements ObjectiveArtifactStore {
  readonly #artifacts = new Map<ArtifactHash, StoredArtifact>();

  public async put(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly label: string;
  }): Promise<ArtifactReference> {
    const bytes = new Uint8Array(input.bytes);
    const hash = artifactHash(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
    this.#artifacts.set(hash, { hash, mediaType: input.mediaType, bytes });
    return {
      hash,
      mediaType: input.mediaType,
      bytes: bytes.byteLength,
      label: input.label,
    };
  }

  public async get(hash: ArtifactHash): Promise<StoredArtifact | undefined> {
    return this.#artifacts.get(hash);
  }

  public async has(hash: ArtifactHash): Promise<boolean> {
    return this.#artifacts.has(hash);
  }

  public clear(): void {
    this.#artifacts.clear();
  }
}

function definition(
  id: ReturnType<typeof objectiveId>,
  maxPromptBytes = 100_000,
  maxAgentInputTokens = 200_000,
  maxAgentOutputTokens = 20_000,
): ObjectiveDefinition {
  return {
    schemaVersion: 1,
    objectiveId: id,
    objectiveKey: `codex-${id}`,
    purpose: "Run one bounded Codex objective.",
    parent: { type: "root" },
    dependencies: [],
    authority: { allowedActors: ["codex-worker", "codex-coordinator"] },
    acceptance: [{ gateId: "proof", description: "Codex result is tested", evidenceTypes: ["test"] }],
    budget: { maxAttempts: 3, maxTransitions: 20, maxContextBytes: 10_000, maxPromptBytes, maxAgentInputTokens, maxAgentOutputTokens },
    context: [{ type: "git", repository: "temporary", revision: "head" }],
    metadata: {},
  };
}

async function createObjective(store: MemoryObjectiveStore, value: ObjectiveDefinition): Promise<void> {
  const result = await store.execute(
    {
      type: "create",
      schemaVersion: 1,
      commandId: commandId(
        value.objectiveId.endsWith("1")
          ? "72000000-0000-4000-8000-000000000011"
          : "72000000-0000-4000-8000-000000000012",
      ),
      objectiveId: value.objectiveId,
      definition: value,
    },
    coordinator,
  );
  assert.equal(result.status, "accepted");
}

class FakeCodex implements WorkflowCodex {
  public starts = 0;
  public readonly resumed: string[] = [];
  public usage: Usage | null = null;

  public startThread(): WorkflowThread {
    this.starts += 1;
    return new FakeThread(`thread-${this.starts}`, this);
  }

  public resumeThread(id: string): WorkflowThread {
    this.resumed.push(id);
    return new FakeThread(id, this);
  }
}

class FakeThread implements WorkflowThread {
  public constructor(public readonly id: string, private readonly owner: FakeCodex) {}

  public async run(): Promise<{ readonly finalResponse: string; readonly usage: Usage | null }> {
    return { finalResponse: JSON.stringify({ result: "structured work complete" }), usage: this.owner.usage };
  }
}
