import assert from "node:assert/strict";
import test from "node:test";

import {
  CodexWorkflowClient,
  decodeObjectiveId,
  MemoryLedger,
  type CodexRole,
  type Delegation,
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
} satisfies Omit<Delegation, "objectiveId">;

const objectiveIds = new Map<string, ReturnType<typeof decodeObjectiveId>>();

test("reuses only the role and objective pair and evicts the prior objective", async () => {
  const fake = new FakeCodex();
  const client = new CodexWorkflowClient(
    new MemoryLedger("objective-cache"),
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
  const client = new CodexWorkflowClient(
    new MemoryLedger("fresh-review"),
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
  const client = new CodexWorkflowClient(
    new MemoryLedger("fresh-transition"),
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
  const client = new CodexWorkflowClient(
    new MemoryLedger("terminal-success"),
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
  const client = new CodexWorkflowClient(
    new MemoryLedger("terminal-transport"),
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

test("resume identifiers are bound to the same objective", async () => {
  const fake = new FakeCodex();
  const resumableRole: CodexRole = {
    ...role,
    resume: {
      threadId: "durable-thread",
      objectiveId: objective("objective-a").objectiveId,
    },
  };
  const client = new CodexWorkflowClient(
    new MemoryLedger("resume-objective"),
    undefined,
    fake,
  );

  await client.invoke(invocation(objective("objective-a"), resumableRole));
  assert.deepEqual(fake.resumed, ["durable-thread"]);

  await client.invoke(invocation(objective("objective-b"), resumableRole));
  assert.equal(fake.starts, 1);

  await client.invoke(invocation(objective("objective-a"), resumableRole));
  assert.equal(fake.starts, 2);
  assert.deepEqual(fake.resumed, ["durable-thread"]);
});

test("objective envelope is required and included in every invocation", async () => {
  const fake = new FakeCodex();
  const client = new CodexWorkflowClient(
    new MemoryLedger("objective-envelope"),
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

test("rejects an oversized rendered prompt before starting a thread", async () => {
  const fake = new FakeCodex();
  const client = new CodexWorkflowClient(
    new MemoryLedger("prompt-budget"),
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
    readonly usage: null;
  }> {
    this.owner.prompts.push(input);
    if (this.owner.failNext) {
      this.owner.failNext = false;
      throw new Error("stream disconnected");
    }
    return {
      finalResponse: JSON.stringify({ result: "ok" }),
      usage: null,
    };
  }
}
