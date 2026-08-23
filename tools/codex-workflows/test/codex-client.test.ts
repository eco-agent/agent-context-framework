import assert from "node:assert/strict";
import test from "node:test";
import type { Usage } from "@openai/codex-sdk";

import {
  decodeObjectiveThreadContinuation,
  encodeObjectiveThreadContinuation,
  ObjectiveCodexClient,
  ObjectiveCodexPostTurnError,
  decodeObjectiveId,
  ObjectiveMemoryLedger,
  type CodexRole,
  type ObjectiveDelegation,
  type StructuredInvocation,
  type WorkflowCodex,
  type WorkflowObjective,
  type WorkflowThread,
} from "../src/index.js";

const role: CodexRole = {
  identity: "primary",
  role: "implementer",
  scope: ["repository"],
  capabilities: ["write"],
  authority: ["read", "write"],
  thread: { sandboxMode: "workspace-write" },
};

const delegation = {
  from: "orchestrator",
  to: "primary",
  purpose: "implement",
  scope: ["repository"],
  context: {},
  constraints: [],
  grantedAuthority: ["read", "write"],
  expectedEvidence: ["tests"],
  returnContract: "structured result",
  requiredCapabilities: ["write"],
} satisfies Omit<ObjectiveDelegation, "objectiveId">;

const objectiveIds = new Map<string, ReturnType<typeof decodeObjectiveId>>();

test("reuses only the role and objective pair and evicts the prior objective", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("objective-cache"),
    undefined,
    fake,
  );

  await client.invoke(invocation(objective("objective-a")));
  await client.invoke(invocation(objective("objective-a")));
  assert.equal(fake.starts, 1);

  await client.invoke(invocation(objective("objective-b")));
  assert.equal(fake.starts, 2);

  await client.invoke(invocation(objective("objective-a")));
  assert.equal(fake.starts, 3);
});

test("fresh policy never reuses a reviewer thread", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("fresh-review"),
    undefined,
    fake,
  );
  const fresh = {
    ...objective("review-objective"),
    threadPolicy: "fresh",
  } as const;

  await client.invoke(invocation(fresh));
  await client.invoke(invocation(fresh));

  assert.equal(fake.starts, 2);
});

test("fresh policy also evicts a reusable thread held by the same role", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("fresh-transition"),
    undefined,
    fake,
  );

  await client.invoke(invocation(objective("objective-a")));
  await client.invoke(
    invocation({
      ...objective("objective-b"),
      threadPolicy: "fresh",
    }),
  );
  await client.invoke(invocation(objective("objective-a")));

  assert.equal(fake.starts, 3);
});

test("terminal success releases the objective thread", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("terminal-success"),
    undefined,
    fake,
  );
  const terminal = {
    ...objective("terminal-objective"),
    terminalAfterTurn: true,
  } as const;

  await client.invoke(invocation(terminal));
  await client.invoke(invocation(terminal));

  assert.equal(fake.starts, 2);
});

test("transport failure does not falsely terminalize an objective", async () => {
  const fake = new FakeCodex();
  fake.failNext = true;
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("terminal-transport"),
    undefined,
    fake,
  );
  const terminal = {
    ...objective("terminal-objective"),
    terminalAfterTurn: true,
  } as const;

  await assert.rejects(client.invoke(invocation(terminal)), /disconnected/u);
  await client.invoke(invocation(terminal));

  assert.equal(fake.starts, 1);
});

test("durable continuations remain usable after eviction and stay objective-bound", async () => {
  const fake = new FakeCodex();
  const firstObjective = objective("objective-a");
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("resume-objective"),
    undefined,
    fake,
  );

  const first = await client.invoke(invocation(firstObjective));
  assert.ok(first.continuation);
  assert.deepEqual(
    decodeObjectiveThreadContinuation(
      encodeObjectiveThreadContinuation(first.continuation),
    ),
    first.continuation,
  );

  const secondObjective = objective("objective-b");
  await assert.rejects(
    client.invoke({
      ...invocation(secondObjective),
      continuation: first.continuation,
    }),
    /different objective/u,
  );
  await client.invoke(invocation(secondObjective));
  assert.equal(fake.starts, 2);

  await client.invoke({
    ...invocation(firstObjective),
    continuation: first.continuation,
  });
  assert.equal(fake.starts, 2);
  assert.deepEqual(fake.resumed, [first.threadId]);
});

test("a durable continuation cannot conflict with a cached thread", async () => {
  const fake = new FakeCodex();
  const value = objective("cached-conflict");
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("cached-conflict"),
    undefined,
    fake,
  );
  const first = await client.invoke(invocation(value));
  assert.ok(first.continuation);

  await assert.rejects(
    client.invoke({
      ...invocation(value),
      continuation: {
        ...first.continuation,
        threadId: "different-thread",
      },
    }),
    /differs from the cached thread/u,
  );
  assert.equal(fake.starts, 1);
  assert.deepEqual(fake.resumed, []);
});

test("durable continuation tokens reject legacy and widened shapes", () => {
  assert.throws(
    () => decodeObjectiveThreadContinuation("thread-1"),
    /not valid JSON/u,
  );
  assert.throws(
    () => decodeObjectiveThreadContinuation(JSON.stringify({
      schemaVersion: 1,
      objectiveId: objective("token-shape").objectiveId,
      threadId: "thread-1",
      envelopeSha256: "a".repeat(64),
      extra: true,
    })),
    /unknown: extra/u,
  );
  assert.throws(
    () => decodeObjectiveThreadContinuation(JSON.stringify({
      schemaVersion: 1,
      objectiveId: objective("token-shape").objectiveId,
      threadId: "thread-1",
      envelopeSha256: "A".repeat(64),
    })),
    /lowercase SHA-256 digest/u,
  );
});

test("role envelope changes reject old continuations and start a new thread", async () => {
  const fake = new FakeCodex();
  const value = objective("role-envelope");
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("role-envelope"),
    undefined,
    fake,
  );
  const first = await client.invoke(invocation(value));
  assert.ok(first.continuation);
  const changedRole: CodexRole = {
    ...role,
    thread: {
      ...role.thread,
      workingDirectory: `${process.cwd()}-different`,
    },
  };

  await assert.rejects(
    client.invoke({
      ...invocation(value, changedRole),
      continuation: first.continuation,
    }),
    /different role or objective envelope/u,
  );
  await client.invoke(invocation(value, changedRole));
  assert.equal(fake.starts, 2);
  assert.deepEqual(fake.resumed, []);
});

test("post-turn failures retain usage and a bound continuation", async () => {
  const fake = new FakeCodex();
  fake.finalResponses.push("not-json");
  fake.usage = {
    input_tokens: 7,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 2,
    reasoning_output_tokens: 1,
  };
  const ledger = new ObjectiveMemoryLedger("post-turn-failure");
  const client = new ObjectiveCodexClient(ledger, undefined, fake);
  let failure: ObjectiveCodexPostTurnError | undefined;

  await assert.rejects(
    client.invoke(invocation(objective("post-turn-failure"))),
    (error: unknown) => {
      assert.ok(error instanceof ObjectiveCodexPostTurnError);
      failure = error;
      assert.equal(error.threadId, "thread-1");
      assert.deepEqual(error.usage, fake.usage);
      assert.ok(error.renderedPromptBytes > 0);
      assert.ok(error.continuation);
      return true;
    },
  );

  assert.ok(failure?.continuation);
  const failed = (await ledger.list()).find(
    (event) => event.type === "codex.failed",
  );
  assert.equal(failed?.threadId, "thread-1");
  assert.deepEqual(failed?.usage, fake.usage);
  assert.deepEqual(failed?.state, {
    objectiveId: objective("post-turn-failure").objectiveId,
    errorType: "SyntaxError",
    postTurn: true,
    envelopeSha256: failure.continuation.envelopeSha256,
  });
});

test("Objective Codex client fails concurrent same-role turns closed", async () => {
  let enteredResolve: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  let releaseResolve: (() => void) | undefined;
  const release = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  const codex: WorkflowCodex = {
    startThread() {
      return {
        id: "single-flight",
        async run() {
          enteredResolve?.();
          await release;
          return {
            finalResponse: JSON.stringify({ result: "ok" }),
            usage: null,
          };
        },
      };
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const ledger = new ObjectiveMemoryLedger("single-flight");
  const client = new ObjectiveCodexClient(ledger, undefined, codex);
  const first = client.invoke(invocation(objective("single-flight")));
  await entered;
  await assert.rejects(
    client.invoke(invocation(objective("other-objective"))),
    /already has an active Codex turn/u,
  );
  releaseResolve?.();
  await first;
  assert.equal(
    (await ledger.list()).filter((event) => event.type === "codex.started")
      .length,
    1,
  );
});

test("objective envelope is required and included in every invocation", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("objective-envelope"),
    undefined,
    fake,
  );

  await client.invoke({
    ...invocation(objective("objective-a")),
    initialContext: "The repository facts needed for this task.",
  });

  assert.match(fake.prompts[0] ?? "", /codex\/objective-a/u);
  assert.match(fake.prompts[0] ?? "", /base-objective-a/u);
  assert.match(fake.prompts[0] ?? "", /focused tests/u);
  assert.match(fake.prompts[0] ?? "", /Repository facts already checked:/u);
  assert.match(fake.prompts[0] ?? "", /Objective:/u);
  assert.match(fake.prompts[0] ?? "", /Your assignment:/u);
  assert.match(fake.prompts[0] ?? "", /Task input:/u);
  assert.match(
    fake.prompts[0] ?? "",
    /Follow the repository's communication rules when writing prose values\.[^]*machine-readable syntax unchanged\.$/u,
  );
});

test("delegation scope and capabilities are rejected before thread mutation", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("delegation-envelope"),
    undefined,
    fake,
  );
  const value = objective("objective-a");

  await assert.rejects(
    client.invoke({
      ...invocation(value),
      delegation: {
        ...delegation,
        objectiveId: value.objectiveId,
        scope: ["outside-repository"],
      },
    }),
    /exceeds primary scope/u,
  );
  await assert.rejects(
    client.invoke({
      ...invocation(value),
      delegation: {
        ...delegation,
        objectiveId: value.objectiveId,
        requiredCapabilities: ["network"],
      },
    }),
    /exceeds primary capabilities/u,
  );
  assert.equal(fake.starts, 0);
  assert.deepEqual(fake.resumed, []);
});

test("rejects an oversized rendered prompt before starting a thread", async () => {
  const fake = new FakeCodex();
  const client = new ObjectiveCodexClient(
    new ObjectiveMemoryLedger("prompt-budget"),
    undefined,
    fake,
  );
  const oversized = {
    ...invocation({
      ...objective("budgeted-objective"),
      maxPromptBytes: 100,
    }),
    input: { artifact: "é".repeat(100) },
  };

  await assert.rejects(
    client.invoke(oversized),
    /Rendered prompt uses \d+ UTF-8 bytes; objective budget is 100\./u,
  );
  assert.equal(fake.starts, 0);
});

function objective(objectiveId: string): WorkflowObjective {
  let stableId = objectiveIds.get(objectiveId);
  if (stableId === undefined) {
    stableId = decodeObjectiveId(
      `71000000-0000-4000-8000-${(objectiveIds.size + 1).toString(16).padStart(12, "0")}`,
    );
    objectiveIds.set(objectiveId, stableId);
  }
  return {
    objectiveId: stableId,
    repository: {
      branch: `codex/${objectiveId}`,
      baseRevision: `base-${objectiveId}`,
      headRevision: `head-${objectiveId}`,
    },
    authority: ["read", "write"],
    acceptanceGates: ["focused tests"],
    previousResult: null,
    maxPromptBytes: 10_000,
    maxLedgerStateBytes: 1_000,
    threadPolicy: "reuse_within_objective",
    terminalAfterTurn: false,
  };
}

function invocation(
  value: WorkflowObjective,
  invocationRole: CodexRole = role,
): StructuredInvocation<{ readonly result: string }> {
  return {
    objective: value,
    role: invocationRole,
    delegation: { ...delegation, objectiveId: value.objectiveId },
    input: {},
    outputSchema: {
      type: "object",
      required: ["result"],
      properties: { result: { type: "string" } },
    },
    decode(output) {
      if (
        typeof output !== "object" ||
        output === null ||
        !("result" in output) ||
        typeof output.result !== "string"
      ) {
        throw new Error("invalid result");
      }
      return { result: output.result };
    },
  };
}

class FakeCodex implements WorkflowCodex {
  public starts = 0;
  public readonly resumed: string[] = [];
  public readonly prompts: string[] = [];
  public readonly finalResponses: string[] = [];
  public usage: Usage | null = null;
  public failNext = false;

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
  public constructor(
    public readonly id: string,
    private readonly owner: FakeCodex,
  ) {}

  public async run(input: string): Promise<{
    readonly finalResponse: string;
    readonly usage: Usage | null;
  }> {
    this.owner.prompts.push(input);
    if (this.owner.failNext) {
      this.owner.failNext = false;
      throw new Error("stream disconnected");
    }
    return {
      finalResponse:
        this.owner.finalResponses.shift() ??
        JSON.stringify({ result: "ok" }),
      usage: this.owner.usage,
    };
  }
}
