import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OBJECTIVE_CAPABILITIES,
  commandId,
  objectiveId,
  utcTimestamp,
  type ObjectiveDefinition,
  type TrustedActor,
} from "@agent-context/objective-kernel";
import {
  FilesystemArtifactStore,
  ManualObjectiveClock,
  MemoryObjectiveStore,
  ObjectiveScheduler,
} from "@agent-context/objective-runtime";
import {
  CodexObjectiveRunner,
  decodeObjectiveThreadContinuation,
  ObjectiveCodexClient,
  ObjectiveMemoryLedger,
  type CodexRole,
  type WorkflowCodex,
  type WorkflowThread,
} from "@agent-context/codex-workflows";
import { loadActiveTask } from "../src/active-task.js";
import { prepareTaskLaunch } from "../src/task-launch.js";
import { runCommand } from "../src/workspace.js";

const coordinator: TrustedActor = {
  actorId: "launcher-coordinator",
  capabilities: [OBJECTIVE_CAPABILITIES.create, OBJECTIVE_CAPABILITIES.coordinate],
};
const worker: TrustedActor = {
  actorId: "launcher-worker",
  capabilities: [OBJECTIVE_CAPABILITIES.execute],
};

test("leased launcher uses authoritative artifacts and resumes after cache loss", async () => {
  const fixture = await createFixture("75000000-0000-4000-8000-000000000001");
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-launch-state-"));
  try {
    const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
    const store = new MemoryObjectiveStore(clock);
    const artifacts = new FilesystemArtifactStore(path.join(stateRoot, "artifacts"));
    await createObjective(store, fixture.definition);
    const fake = new FakeCodex();
    const ledger = new ObjectiveMemoryLedger("durable-launcher-test");
    const runner = new CodexObjectiveRunner<{ readonly result: string }>({
      clientFor: () => new ObjectiveCodexClient(ledger, undefined, fake),
      launchFor: async (context) => {
        const prepared = await prepareTaskLaunch(context, {
          executionDirectory: fixture.root,
          requestPath: fixture.requestPath,
        });
        if (prepared.cachePath !== null) {
          if (context.snapshot.lease.attempt === 1) {
            await writeFile(prepared.cachePath, "corrupt local cache", "utf8");
          } else {
            await rm(prepared.cachePath, { force: true });
          }
        }
        return {
          executionDirectory: prepared.executionDirectory,
          envelope: prepared.envelope,
          envelopeArtifact: prepared.envelopeArtifact,
          invocation: invocationFor(context.snapshot.definition.objectiveId, fixture.root),
          release: prepared.release,
        };
      },
      outcomeFor: (value, snapshot) =>
        snapshot.lease.attempt === 1
          ? { type: "retry", reason: "prove durable retry", retryAfterMs: 0 }
          : {
              type: "completed",
              summary: value.result,
              evidence: [{ evidenceType: "test", summary: "launcher retry passed" }],
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
      leaseDurationMs: 60_000,
      artifactStore: artifacts,
    });
    const summary = await scheduler.runUntilIdle();
    assert.equal(summary.acquired, 2);
    assert.equal(summary.retried, 1);
    assert.equal(summary.completed, 1);
    assert.equal(fake.starts, 1);
    assert.deepEqual(fake.resumed, ["opaque-session-1"]);
    assert.equal(fake.prompts.every((prompt) => prompt.includes("TaskEnvelopeV2 sha256:")), true);
    assert.equal(fake.prompts.every((prompt) => prompt.includes(fixture.definition.objectiveId)), true);
    assert.equal(await loadActiveTask(fixture.root), null);

    const snapshot = await store.get(fixture.definition.objectiveId);
    assert.equal(snapshot?.state, "terminal");
    const resumeToken = snapshot?.latestCheckpoint?.resumeToken;
    assert.ok(resumeToken);
    assert.equal(
      decodeObjectiveThreadContinuation(resumeToken).threadId,
      "opaque-session-1",
    );
    const envelopeReference = snapshot?.latestCheckpoint?.artifacts.find(
      (artifact) => artifact.mediaType.includes("task-envelope.v2"),
    );
    assert.notEqual(envelopeReference, undefined);
    if (envelopeReference !== undefined) {
      assert.equal(await artifacts.has(envelopeReference.hash), true);
      const stored = await artifacts.get(envelopeReference.hash);
      assert.match(Buffer.from(stored?.bytes ?? []).toString("utf8"), /"schemaVersion":2/u);
    }
    const events = await store.events(fixture.definition.objectiveId);
    assert.equal(events.filter((event) => event.eventType === "checkpoint").length, 4);
    assert.equal(
      snapshot?.state === "terminal" && snapshot.outcome.type === "completed"
        ? snapshot.outcome.evidence.some((item) => item.evidenceType === "task-envelope")
        : false,
      true,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("source drift after projection fails before a Codex thread starts", async () => {
  const fixture = await createFixture("75000000-0000-4000-8000-000000000002", 1);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-drift-state-"));
  try {
    const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
    const store = new MemoryObjectiveStore(clock);
    const artifacts = new FilesystemArtifactStore(path.join(stateRoot, "artifacts"));
    await createObjective(store, fixture.definition);
    const fake = new FakeCodex();
    const runner = new CodexObjectiveRunner<{ readonly result: string }>({
      clientFor: () => new ObjectiveCodexClient(new ObjectiveMemoryLedger("source-drift"), undefined, fake),
      launchFor: async (context) => {
        const prepared = await prepareTaskLaunch(context, {
          executionDirectory: fixture.root,
          requestPath: fixture.requestPath,
        });
        await writeFile(path.join(fixture.root, "owner.ts"), "export const owner = false;\n");
        return {
          executionDirectory: prepared.executionDirectory,
          envelope: prepared.envelope,
          envelopeArtifact: prepared.envelopeArtifact,
          invocation: invocationFor(context.snapshot.definition.objectiveId, fixture.root),
          release: prepared.release,
        };
      },
      outcomeFor: () => ({ type: "completed", summary: "unreachable", evidence: [] }),
    });
    const summary = await new ObjectiveScheduler({
      store,
      runner,
      clock,
      workerActor: worker,
      coordinatorActor: coordinator,
      workerId: worker.actorId,
      maxConcurrency: 1,
      leaseDurationMs: 60_000,
      artifactStore: artifacts,
    }).runUntilIdle();
    assert.equal(summary.retried, 1);
    assert.equal(summary.budgetExhausted, 1);
    assert.equal(fake.starts, 0);
    assert.equal(await loadActiveTask(fixture.root), null);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("concurrent leased objectives keep envelopes and active bindings isolated", async () => {
  const fixtures = await Promise.all([
    createFixture("75000000-0000-4000-8000-000000000011"),
    createFixture("75000000-0000-4000-8000-000000000012"),
  ]);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-concurrent-state-"));
  try {
    const clock = new ManualObjectiveClock(utcTimestamp("2026-01-01T00:00:00.000Z"));
    const store = new MemoryObjectiveStore(clock);
    const artifacts = new FilesystemArtifactStore(path.join(stateRoot, "artifacts"));
    for (const fixture of fixtures) await createObjective(store, fixture.definition);
    const byId = new Map(fixtures.map((fixture) => [fixture.definition.objectiveId, fixture]));
    const fake = new BarrierCodex(2);
    const runner = new CodexObjectiveRunner<{ readonly result: string }>({
      clientFor: () => new ObjectiveCodexClient(new ObjectiveMemoryLedger("concurrent-launch"), undefined, fake),
      launchFor: async (context) => {
        const fixture = byId.get(context.snapshot.definition.objectiveId);
        if (fixture === undefined) throw new Error("missing concurrent fixture");
        const prepared = await prepareTaskLaunch(context, {
          executionDirectory: fixture.root,
          requestPath: fixture.requestPath,
        });
        return {
          executionDirectory: prepared.executionDirectory,
          envelope: prepared.envelope,
          envelopeArtifact: prepared.envelopeArtifact,
          invocation: invocationFor(context.snapshot.definition.objectiveId, fixture.root),
          release: prepared.release,
        };
      },
      outcomeFor: (value) => ({
        type: "completed",
        summary: value.result,
        evidence: [{ evidenceType: "test", summary: "concurrent launch passed" }],
      }),
    });
    const summary = await new ObjectiveScheduler({
      store,
      runner,
      clock,
      workerActor: worker,
      coordinatorActor: coordinator,
      workerId: worker.actorId,
      maxConcurrency: 2,
      leaseDurationMs: 60_000,
      artifactStore: artifacts,
    }).runUntilIdle();
    assert.equal(summary.acquired, 2);
    assert.equal(summary.completed, 2);
    assert.equal(fake.peakActive, 2);
    const snapshots = await Promise.all(
      fixtures.map((fixture) => store.get(fixture.definition.objectiveId)),
    );
    assert.equal(snapshots.every((snapshot) => snapshot?.state === "terminal"), true);
    const envelopeHashes = snapshots.map(
      (snapshot) => snapshot?.latestCheckpoint?.artifacts[0]?.hash,
    );
    assert.equal(new Set(envelopeHashes).size, 2);
    assert.deepEqual(
      await Promise.all(fixtures.map((fixture) => loadActiveTask(fixture.root))),
      [null, null],
    );
  } finally {
    await Promise.all(fixtures.map((fixture) => rm(fixture.root, { recursive: true, force: true })));
    await rm(stateRoot, { recursive: true, force: true });
  }
});

function invocationFor(
  id: ReturnType<typeof objectiveId>,
  workingDirectory: string,
) {
  const role: CodexRole = {
    identity: worker.actorId,
    role: "bounded launcher test worker",
    scope: ["owner.ts"],
    capabilities: ["structured-output"],
    authority: ["read", "write", "verify"],
    thread: {
      workingDirectory,
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
    },
  };
  return {
    role,
    delegation: {
      objectiveId: id,
      from: coordinator.actorId,
      to: worker.actorId,
      purpose: "perform bounded fixture work",
      scope: ["owner.ts"],
      requiredCapabilities: ["structured-output"],
      context: null,
      constraints: ["stay in scope"],
      grantedAuthority: ["read", "write", "verify"] as const,
      expectedEvidence: ["test"],
      returnContract: "result",
    },
    repository: { branch: "main", baseRevision: "base", headRevision: "head" },
    authority: ["read", "write", "verify"] as const,
    input: { request: "perform fixture work" },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["result"],
      properties: { result: { type: "string" } },
    },
    decode(value: unknown) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("result" in value) ||
        typeof value.result !== "string"
      ) {
        throw new Error("invalid fixture result");
      }
      return { result: value.result };
    },
  };
}

async function createFixture(idValue: string, maxAttempts = 3): Promise<{
  readonly root: string;
  readonly requestPath: string;
  readonly definition: ObjectiveDefinition;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-launch-"));
  await mkdir(path.join(root, ".codex", "work"), { recursive: true });
  await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  await writeFile(path.join(root, ".codex", "work", "contract.md"), "# Outcome\nOne slice.\n");
  await writeFile(path.join(root, "owner.ts"), "export const owner = true;\n");
  await runCommand("git", ["init"], { cwd: root });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await runCommand("git", ["config", "user.name", "Test"], { cwd: root });
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-m", "fixture"], { cwd: root });
  const baselineRevision = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
  const id = objectiveId(idValue);
  const requestPath = ".codex/work/request.json";
  const purpose = "Implement one task";
  await writeFile(
    path.join(root, requestPath),
    JSON.stringify({
      objectiveId: id,
      objective: purpose,
      contractPath: ".codex/work/contract.md",
      baselineRevision,
      supersedes: [],
      writablePaths: ["owner.ts"],
      readableReferences: ["owner.ts"],
      verificationProfile: "workflow",
      repairBudget: 0,
    }),
  );
  return {
    root,
    requestPath,
    definition: {
      schemaVersion: 1,
      objectiveId: id,
      objectiveKey: "launcher-test",
      purpose,
      parent: { type: "root" },
      dependencies: [],
      authority: { allowedActors: [coordinator.actorId, worker.actorId] },
      acceptance: [{ gateId: "proof", description: "Fixture completes", evidenceTypes: ["test"] }],
      budget: {
        maxAttempts,
        maxTransitions: 20,
        maxContextBytes: 30_000,
        maxPromptBytes: 100_000,
        maxAgentInputTokens: 100_000,
        maxAgentOutputTokens: 20_000,
      },
      context: [{ type: "git", repository: root, revision: baselineRevision }],
      metadata: { adapter: "codex-task-launcher" },
    },
  };
}

async function createObjective(
  store: MemoryObjectiveStore,
  definition: ObjectiveDefinition,
): Promise<void> {
  const result = await store.execute(
    {
      type: "create",
      schemaVersion: 1,
      commandId: commandId(
        `75000000-0000-4000-8001-${definition.objectiveId.slice(-12)}`,
      ),
      objectiveId: definition.objectiveId,
      definition,
    },
    coordinator,
  );
  assert.equal(result.status, "accepted");
}

class FakeCodex implements WorkflowCodex {
  public starts = 0;
  public readonly resumed: string[] = [];
  public readonly prompts: string[] = [];

  public startThread(): WorkflowThread {
    this.starts += 1;
    return new FakeThread(`opaque-session-${this.starts}`, this);
  }

  public resumeThread(id: string): WorkflowThread {
    this.resumed.push(id);
    return new FakeThread(id, this);
  }
}

class FakeThread implements WorkflowThread {
  public constructor(public readonly id: string, private readonly owner: FakeCodex) {}

  public async run(input: string): Promise<{
    readonly finalResponse: string;
    readonly usage: null;
  }> {
    this.owner.prompts.push(input);
    return {
      finalResponse: JSON.stringify({ result: "fixture work complete" }),
      usage: null,
    };
  }
}

class BarrierCodex implements WorkflowCodex {
  public peakActive = 0;
  #active = 0;
  #arrived = 0;
  readonly #barrier: Promise<void>;
  readonly #release: () => void;

  public constructor(private readonly participants: number) {
    let release = () => {};
    this.#barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#release = release;
  }

  public startThread(): WorkflowThread {
    return new BarrierThread(`concurrent-session-${this.#arrived + 1}`, this);
  }

  public resumeThread(id: string): WorkflowThread {
    return new BarrierThread(id, this);
  }

  public async run(): Promise<void> {
    this.#active += 1;
    this.#arrived += 1;
    this.peakActive = Math.max(this.peakActive, this.#active);
    if (this.#arrived === this.participants) this.#release();
    await this.#barrier;
    this.#active -= 1;
  }
}

class BarrierThread implements WorkflowThread {
  public constructor(public readonly id: string, private readonly owner: BarrierCodex) {}

  public async run(): Promise<{
    readonly finalResponse: string;
    readonly usage: null;
  }> {
    await this.owner.run();
    return {
      finalResponse: JSON.stringify({ result: "concurrent fixture complete" }),
      usage: null,
    };
  }
}
