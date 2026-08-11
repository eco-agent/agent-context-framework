import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  JsonlLedger,
  MAX_TURN_TIMEOUT_MS,
  MemoryLedger,
  CodexWorkflowClient,
  assertConfidence,
  runAuthorityLadder,
  runAutonomousEnvironment,
  runRelayChain,
  runReviewerRepair,
  runSharedArtifactConvergence,
  runSubsidiarityEscalation,
  validateTaskAcceptanceEvaluation,
  validateWorkflowPlan,
  type Decision,
  type CodexRole,
  type Delegation,
  type Evidence,
  type EvidenceLedger,
  type WorkflowCodex,
  type WorkflowPlan,
} from "../src/index.js";

const evidence: readonly Evidence[] = [
  { kind: "test", summary: "Observed by test", references: ["test"] },
];

test("JSONL ledger continues sequence from file-backed audit evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-test-"));
  const file = join(root, "run.jsonl");
  try {
    const first = await JsonlLedger.open(file, "durable-test");
    await first.append({
      type: "loop.started",
      loop: "test",
      state: {},
      evidence,
    });

    const resumed = await JsonlLedger.open(file, "durable-test");
    const second = await resumed.append({
      type: "loop.completed",
      loop: "test",
      state: {},
      evidence,
    });

    assert.equal(second.sequence, 2);
    assert.equal((await resumed.list()).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONL ledger rejects malformed and discontinuous audit history", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-invalid-test-"));
  try {
    const malformed = join(root, "malformed.jsonl");
    await writeFile(malformed, "{not-json}\n", "utf8");
    await assert.rejects(
      JsonlLedger.open(malformed, "invalid-test"),
      /not valid JSON/u,
    );

    const discontinuous = join(root, "discontinuous.jsonl");
    await writeFile(
      discontinuous,
      `${JSON.stringify({
        sequence: 2,
        runId: "invalid-test",
        at: new Date().toISOString(),
        type: "loop.started",
        loop: "test",
        state: {},
        evidence,
      })}\n`,
      "utf8",
    );
    await assert.rejects(
      JsonlLedger.open(discontinuous, "invalid-test"),
      /non-contiguous sequence/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONL ledger rejects event metadata that does not match its event type", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-metadata-test-"));
  const runId = "metadata-test";
  const base = {
    sequence: 1,
    runId,
    at: new Date().toISOString(),
    loop: "test",
    state: {},
    evidence: [],
  };
  try {
    const taskEvents = [
      { type: "codex.started" },
      { type: "codex.thread_bound", threadId: "thread" },
      { type: "codex.completed", threadId: "thread" },
      { type: "codex.failed" },
      { type: "task.accepted" },
    ] as const;
    for (const event of taskEvents) {
      const file = join(root, `${event.type.replace(".", "-")}-metadata.jsonl`);
      await writeFile(
        file,
        `${JSON.stringify({
          ...base,
          ...event,
          taskId: "task",
          attempt: 1,
        })}\n`,
        "utf8",
      );
      await assert.rejects(
        JsonlLedger.open(file, runId),
        /requires actor, taskId, and attempt/u,
      );
    }

    for (const type of ["codex.thread_bound", "codex.completed"] as const) {
      const file = join(root, `${type.replace(".", "-")}-thread.jsonl`);
      await writeFile(
        file,
        `${JSON.stringify({
          ...base,
          type,
          actor: "worker",
          taskId: "task",
          attempt: 1,
        })}\n`,
        "utf8",
      );
      await assert.rejects(
        JsonlLedger.open(file, runId),
        /requires threadId/u,
      );
    }

    const loopTask = join(root, "loop-task-metadata.jsonl");
    await writeFile(
      loopTask,
      `${JSON.stringify({
        ...base,
        type: "loop.started",
        taskId: "task",
        attempt: 1,
      })}\n`,
      "utf8",
    );
    await assert.rejects(
      JsonlLedger.open(loopTask, runId),
      /cannot contain task metadata/u,
    );

    const startedThread = join(root, "started-thread-metadata.jsonl");
    await writeFile(
      startedThread,
      `${JSON.stringify({
        ...base,
        type: "codex.started",
        actor: "worker",
        threadId: "premature-thread",
        taskId: "task",
        attempt: 1,
      })}\n`,
      "utf8",
    );
    await assert.rejects(
      JsonlLedger.open(startedThread, runId),
      /cannot contain threadId/u,
    );

    const failedWithoutThread = join(root, "failed-without-thread.jsonl");
    await writeFile(
      failedWithoutThread,
      `${JSON.stringify({
        ...base,
        type: "codex.failed",
        actor: "worker",
        taskId: "task",
        attempt: 1,
      })}\n`,
      "utf8",
    );
    const reopened = await JsonlLedger.open(failedWithoutThread, runId);
    assert.equal((await reopened.list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONL ledger exposes an event only after its backing append succeeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-ledger-write-test-"));
  try {
    const ledger = await JsonlLedger.open(
      join(root, "run.jsonl"),
      "write-test",
      async () => {
        throw new Error("simulated append failure");
      },
    );
    await assert.rejects(
      ledger.append({
        type: "loop.started",
        loop: "test",
        state: {},
        evidence,
      }),
      /simulated append failure/u,
    );
    assert.deepEqual(await ledger.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relay sends repair to the previous stage", async () => {
  const ledger = new MemoryLedger("relay-test");
  const calls: string[] = [];
  let verificationAttempts = 0;

  const result = await runRelayChain(
    "draft",
    [
      {
        id: "implement",
        async run(artifact, context): Promise<Decision<string>> {
          calls.push(`implement:${context.feedback.join("|")}`);
          return {
            kind: "accept",
            artifact: context.feedback.length === 0 ? artifact : "repaired",
            confidence: 1,
            evidence,
          };
        },
      },
      {
        id: "verify",
        async run(artifact): Promise<Decision<string>> {
          calls.push(`verify:${artifact}`);
          verificationAttempts += 1;
          return verificationAttempts === 1
            ? {
                kind: "repair",
                artifact,
                feedback: ["fix the invariant"],
                evidence,
              }
            : { kind: "accept", artifact, confidence: 1, evidence };
        },
      },
    ],
    { maxTransitions: 5, maxRepairs: 1 },
    { ledger },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [
    "implement:",
    "verify:draft",
    "implement:fix the invariant",
    "verify:repaired",
  ]);
});

test("static plan rejects recursive task cycles", () => {
  assert.throws(
    () =>
      validateWorkflowPlan({
        objective: "Implement and verify",
        acceptanceCriteria: ["tests pass"],
        primaryRoleId: "primary",
        loop: "relay-chain",
        roles: [
          {
            identity: "primary",
            role: "implementer",
            scope: ["repository"],
            capabilities: ["write"],
            authority: ["read", "write"],
            thread: {
              model: "gpt-5.3-codex",
              modelReasoningEffort: "high",
              sandboxMode: "workspace-write",
              approvalPolicy: "never",
              networkAccessEnabled: false,
              workingDirectory: process.cwd(),
            },
          },
        ],
        tasks: [
          {
            id: "implement",
            roleId: "primary",
            purpose: "implement",
            scope: ["repository"],
            requiredCapabilities: ["write"],
            grantedAuthority: ["write"],
            dependencies: ["verify"],
            acceptanceCriteria: ["change exists"],
            expectedEvidence: ["diff"],
            maxAttempts: 1,
          },
          {
            id: "verify",
            roleId: "primary",
            purpose: "verify",
            scope: ["repository"],
            requiredCapabilities: ["write"],
            grantedAuthority: ["read"],
            dependencies: ["implement"],
            acceptanceCriteria: ["tests pass"],
            expectedEvidence: ["test output"],
            maxAttempts: 1,
          },
        ],
      }),
    /contains a cycle/u,
  );
});

test("static plan rejects scope, capability, and authority expansion", () => {
  const plan = validPlan();
  const task = plan.tasks[0];
  if (task === undefined) throw new Error("Expected a planned task");

  assert.throws(
    () => validateWorkflowPlan({ ...plan, tasks: [{ ...task, scope: ["outside"] }] }),
    /exceeds primary scope/u,
  );
  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        tasks: [{ ...task, requiredCapabilities: ["network"] }],
      }),
    /exceeds primary capabilities/u,
  );
  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        tasks: [{ ...task, grantedAuthority: ["release"] }],
      }),
    /exceeds primary authority/u,
  );
});

test("static plan rejects ambient thread defaults and excessive sandbox authority", () => {
  const plan = validPlan();
  const role = plan.roles[0];
  if (role === undefined) throw new Error("Expected a planned role");

  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        roles: [{ ...role, thread: { sandboxMode: "read-only" } }],
      }),
    /explicit thread model/u,
  );
  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        roles: [
          {
            ...role,
            thread: { ...role.thread, sandboxMode: "danger-full-access" },
          },
        ],
      }),
    /danger-full-access/u,
  );
});

test("static plan rejects recursive role hierarchy and duplicate dependencies", () => {
  const plan = validPlan();
  const primary = plan.roles[0];
  const task = plan.tasks[0];
  if (primary === undefined || task === undefined) {
    throw new Error("Expected a valid plan fixture");
  }
  const reviewer: CodexRole = {
    ...primary,
    identity: "reviewer",
    role: "reviewer",
    supraHolon: "primary",
  };

  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        roles: [{ ...primary, supraHolon: "reviewer" }, reviewer],
      }),
    /hierarchy contains a cycle/u,
  );
  assert.throws(
    () =>
      validateWorkflowPlan({
        ...plan,
        tasks: [{ ...task, dependencies: ["missing", "missing"] }],
      }),
    /dependencies must not contain duplicates/u,
  );
});

test("validated plans snapshot and freeze role, task, and thread inputs", () => {
  const roleScope = ["repository"];
  const additionalDirectories = [process.cwd()];
  const taskScope = ["repository"];
  const source = validPlan();
  const role = source.roles[0];
  const task = source.tasks[0];
  if (role === undefined || task === undefined) {
    throw new Error("Expected a valid plan fixture");
  }
  const validated = validateWorkflowPlan({
    ...source,
    roles: [
      {
        ...role,
        scope: roleScope,
        thread: { ...role.thread, additionalDirectories },
      },
    ],
    tasks: [{ ...task, scope: taskScope }],
  });

  roleScope.push("outside");
  additionalDirectories.push("outside");
  taskScope.push("outside");

  assert.deepEqual(validated.roles[0]?.scope, ["repository"]);
  assert.deepEqual(validated.roles[0]?.thread.additionalDirectories, [process.cwd()]);
  assert.deepEqual(validated.tasks[0]?.scope, ["repository"]);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.roles), true);
  assert.equal(Object.isFrozen(validated.roles[0]), true);
  assert.equal(Object.isFrozen(validated.roles[0]?.thread), true);
  assert.equal(Object.isFrozen(validated.tasks[0]), true);
});

test("Codex client rejects invocations outside its fixed task contract", async () => {
  const plan = validateWorkflowPlan(validPlan());
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return mockThread("unused");
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    new MemoryLedger("fixed-registry-test"),
    plan,
    undefined,
    codex,
  );
  assert.throws(
    () => Reflect.construct(
      CodexWorkflowClient,
      [new MemoryLedger("raw-plan-test"), validPlan(), undefined, codex],
    ),
    /requires a validated workflow plan/u,
  );
  await assert.rejects(
    client.invoke({ ...invocationFor(), taskId: "outsider" }),
    /is not in the validated workflow plan/u,
  );
  await assert.rejects(
    client.invoke({
      ...invocationFor(),
      delegation: { ...invocationFor().delegation, to: "outsider" },
    }),
    /does not match role primary/u,
  );
  await assert.rejects(
    client.invoke({
      ...invocationFor(),
      delegation: { ...invocationFor().delegation, from: "outsider" },
    }),
    /source outsider is not a registered workflow role/u,
  );
  assert.equal(starts, 0);
});

test("task acceptance, dependencies, and attempts are enforced from the plan", async () => {
  const primary = validRole();
  const verifier: CodexRole = {
    identity: "verifier",
    role: "verifier",
    scope: ["repository"],
    capabilities: ["verify"],
    authority: ["read", "verify"],
    thread: {
      model: "gpt-5.3-codex",
      modelReasoningEffort: "medium",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      workingDirectory: process.cwd(),
    },
  };
  const plan = validateWorkflowPlan({
    objective: "Implement then verify",
    acceptanceCriteria: ["both tasks accepted"],
    primaryRoleId: "primary",
    loop: "relay-chain",
    roles: [primary, verifier],
    tasks: [
      {
        id: "implement",
        roleId: "primary",
        purpose: "implement",
        scope: ["repository"],
        requiredCapabilities: ["write"],
        grantedAuthority: ["write"],
        dependencies: [],
        acceptanceCriteria: [
          "implementation accepted",
          "integration accepted",
        ],
        expectedEvidence: ["implementation"],
        maxAttempts: 2,
      },
      {
        id: "verify",
        roleId: "verifier",
        purpose: "verify",
        scope: ["repository"],
        requiredCapabilities: ["verify"],
        grantedAuthority: ["verify"],
        dependencies: ["implement"],
        acceptanceCriteria: ["verification accepted"],
        expectedEvidence: ["verification"],
        maxAttempts: 1,
      },
    ],
  });
  const ledger = new MemoryLedger("task-state-test");
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return mockThread(`task-thread-${starts}`);
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(ledger, plan, undefined, codex);
  const implementationEvidence: readonly Evidence[] = [
    { kind: "implementation", summary: "implemented", references: ["diff"] },
  ];
  const verificationEvidence: readonly Evidence[] = [
    { kind: "verification", summary: "verified", references: ["test"] },
  ];
  const verifyInvocation = {
    taskId: "verify",
    delegation: {
      from: "primary",
      to: "verifier",
      purpose: "verify",
      scope: ["repository"],
      requiredCapabilities: ["verify"],
      context: {},
      constraints: ["verify only"],
      grantedAuthority: ["verify"] as const,
      expectedEvidence: ["verification"],
      returnContract: "Return verification evidence",
    },
    input: {},
    outputSchema: {},
    decode: decodeAnswer,
    extractEvidence: () => verificationEvidence,
    timeoutMs: 1_000,
  };
  const acceptedImplementation = acceptanceEvaluation("implement", [
    ["implementation accepted", true],
    ["integration accepted", true],
  ]);
  const acceptedVerification = acceptanceEvaluation("verify", [
    ["verification accepted", true],
  ]);

  await assert.rejects(client.invoke(verifyInvocation), /incomplete dependencies/u);
  const rejectedImplementation = await client.invoke({
    ...invocationFor(),
    delegation: {
      ...invocationFor().delegation,
      expectedEvidence: ["implementation"],
    },
  });
  assert.equal(rejectedImplementation.attempt, 1);
  await assert.rejects(client.invoke(verifyInvocation), /incomplete dependencies/u);
  await assert.rejects(
    client.acceptTask("implement", acceptedImplementation),
    /missing expected evidence kinds: implementation/u,
  );
  await assert.rejects(client.invoke(verifyInvocation), /incomplete dependencies/u);
  const implementation = await client.invoke({
    ...invocationFor(),
    extractEvidence: () => implementationEvidence,
    delegation: {
      ...invocationFor().delegation,
      expectedEvidence: ["implementation"],
    },
  });
  assert.equal(implementation.attempt, 2);
  await assert.rejects(
    Reflect.apply(client.acceptTask, client, [
      "implement",
      {
        taskId: "implement",
        criteria: [
          { criterion: "implementation accepted", satisfied: true },
          { criterion: "integration accepted", satisfied: true },
        ],
      },
    ]),
    /validated controller evaluation/u,
  );
  await assert.rejects(
    client.acceptTask(
      "implement",
      acceptanceEvaluation("implement", [
        ["implementation accepted", true],
      ]),
    ),
    /missing: integration accepted/u,
  );
  await assert.rejects(
    client.acceptTask(
      "implement",
      acceptanceEvaluation("implement", [
        ["implementation accepted", true],
        ["integration accepted", true],
        ["invented criterion", true],
      ]),
    ),
    /extra: invented criterion/u,
  );
  await assert.rejects(
    client.acceptTask(
      "implement",
      acceptanceEvaluation("implement", [
        ["implementation accepted", true],
        ["integration accepted", false],
      ]),
    ),
    /unsatisfied acceptance criteria: integration accepted/u,
  );
  await client.acceptTask("implement", acceptedImplementation);
  const verification = await client.invoke(verifyInvocation);
  assert.equal(verification.attempt, 1);
  await client.acceptTask("verify", acceptedVerification);
  assert.deepEqual(
    (await ledger.list())
      .filter((event) => event.type === "task.accepted")
      .map((event) => [event.taskId, event.attempt]),
    [["implement", 2], ["verify", 1]],
  );
  await assert.rejects(client.invoke(verifyInvocation), /already accepted/u);
});

test("task acceptance is a single evidence-backed transition", async () => {
  const stored = new MemoryLedger("task-acceptance-single-flight-test");
  let enteredResolve: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  let releaseResolve: (() => void) | undefined;
  const release = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  const ledger: EvidenceLedger = {
    runId: stored.runId,
    async append(event) {
      if (event.type === "task.accepted") {
        enteredResolve?.();
        await release;
      }
      return stored.append(event);
    },
    list: () => stored.list(),
  };
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return mockThread("acceptance-single-flight");
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    ledger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  );
  await client.invoke(invocationFor());

  const evaluation = acceptanceEvaluation("implement", [
    ["change exists", true],
  ]);
  const first = client.acceptTask("implement", evaluation);
  await entered;
  await assert.rejects(
    client.acceptTask("implement", evaluation),
    /acceptance transition in progress/u,
  );
  await assert.rejects(
    client.invoke(invocationFor()),
    /acceptance transition in progress/u,
  );
  assert.equal(starts, 1);
  releaseResolve?.();
  await first;

  const accepted = (await ledger.list()).filter(
    (event) => event.type === "task.accepted",
  );
  assert.equal(accepted.length, 1);
  assert.deepEqual(accepted[0]?.evidence, evidence);
});

test("task attempt budgets remain fail-closed in current process", async () => {
  const source = validPlan();
  const task = source.tasks[0];
  if (task === undefined) throw new Error("Expected a task fixture");
  const plan = validateWorkflowPlan({
    ...source,
    tasks: [{ ...task, maxAttempts: 1 }],
  });
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return {
        id: "attempt-budget",
        async run() {
          throw new Error("attempt failed");
        },
      };
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    new MemoryLedger("attempt-budget-test"),
    plan,
    undefined,
    codex,
  );
  await assert.rejects(client.invoke(invocationFor()), /attempt failed/u);
  await assert.rejects(client.invoke(invocationFor()), /exhausted its 1 attempt budget/u);
  assert.equal(starts, 1);
});

test("loop boundaries reject non-finite and fractional budgets", async () => {
  const ledger = new MemoryLedger("budget-test");
  await assert.rejects(
    runRelayChain("draft", [], { maxTransitions: Infinity, maxRepairs: 1 }, { ledger }),
    /positive safe integer/u,
  );
  await assert.rejects(
    runRelayChain("draft", [], { maxTransitions: 1.5, maxRepairs: 1 }, { ledger }),
    /positive safe integer/u,
  );
  assert.deepEqual(await ledger.list(), []);
});

test("confidence decoding accepts only finite values in the closed unit interval", () => {
  assert.equal(assertConfidence(0), 0);
  assert.equal(assertConfidence(1), 1);
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
    assert.throws(() => assertConfidence(invalid), /between 0 and 1/u);
  }
});

test("autonomous loop escalates after measured stagnation", async () => {
  const ledger = new MemoryLedger("environment-test");
  let state = 0;

  const result = await runAutonomousEnvironment(
    "change state",
    {
      id: "worker",
      authority: ["write"],
      async decide() {
        return {
          kind: "act" as const,
          action: "noop",
          requiredAuthority: ["write"] as const,
          evidence,
        };
      },
    },
    {
      async observe() {
        return state;
      },
      async execute(_action, { idempotencyKey }) {
        assert.match(idempotencyKey, /^environment-test:autonomous-environment:worker:/u);
        const events = await ledger.list();
        assert.equal(events.at(-1)?.type, "environment.intent");
        state += 0;
        return undefined;
      },
      async measure(previous, next) {
        return next - previous;
      },
      madeProgress(change) {
        return typeof change === "number" && change !== 0;
      },
    },
    {
      maxSteps: 5,
      maxConsecutiveStagnantSteps: 2,
      retainedHistory: 2,
    },
    { ledger },
  );

  assert.equal(result.status, "escalated");
  if (result.status === "escalated") {
    assert.match(result.issue, /No measured progress/u);
  }
});

test("autonomous loop records terminal evidence when an environment effect fails", async () => {
  const ledger = new MemoryLedger("environment-failure-test");

  await assert.rejects(
    runAutonomousEnvironment(
      "apply an effect",
      {
        id: "worker",
        authority: ["write"],
        async decide() {
          return {
            kind: "act" as const,
            action: "fail",
            requiredAuthority: ["write"] as const,
            evidence,
          };
        },
      },
      {
        async observe() {
          return 0;
        },
        async execute() {
          assert.equal((await ledger.list()).at(-1)?.type, "environment.intent");
          throw new Error("environment unavailable");
        },
        async measure() {
          return 0;
        },
        madeProgress() {
          return false;
        },
      },
      { maxSteps: 1, maxConsecutiveStagnantSteps: 1, retainedHistory: 1 },
      { ledger },
    ),
    /environment unavailable/u,
  );

  assert.deepEqual(
    (await ledger.list()).map((event) => event.type),
    ["loop.started", "environment.intent", "environment.failed"],
  );
});

test("Codex thread continuation requires an exact ledger-bound role envelope", async () => {
  const calls: string[] = [];
  const codex: WorkflowCodex = {
    startThread() {
      calls.push("start");
      return mockThread("thread-bound");
    },
    resumeThread(id) {
      calls.push(`resume:${id}`);
      return mockThread(id);
    },
  };
  const ledger = new MemoryLedger("codex-binding-test");
  const role = validRole();
  const plan = validateWorkflowPlan(validPlan());
  const invocation = {
    taskId: "implement",
    delegation: delegationFor(role),
    input: { request: "test" },
    outputSchema: { type: "object" },
    decode: decodeAnswer,
    extractEvidence: () => evidence,
    timeoutMs: 1_000,
  } as const;

  const client = new CodexWorkflowClient(ledger, plan, undefined, codex);
  await client.invoke(invocation);
  await client.invoke(invocation);
  await new CodexWorkflowClient(ledger, plan, undefined, codex).invoke({
    ...invocation,
    resumeThreadId: "thread-bound",
  });
  assert.deepEqual(calls, ["start", "resume:thread-bound"]);

  const mismatchedRole: CodexRole = {
    ...role,
    thread: { ...role.thread, modelReasoningEffort: "low" },
  };
  const mismatchedPlan = validateWorkflowPlan({
    ...validPlan(),
    roles: [mismatchedRole],
  });
  await assert.rejects(
    new CodexWorkflowClient(ledger, mismatchedPlan, undefined, codex).invoke({
      ...invocation,
      delegation: delegationFor(mismatchedRole),
      resumeThreadId: "thread-bound",
    }),
    /already bound to a different role envelope/u,
  );
  assert.deepEqual(calls, ["start", "resume:thread-bound"]);

  const unboundLedger = new MemoryLedger("codex-unbound-test");
  await assert.rejects(
    new CodexWorkflowClient(unboundLedger, plan, undefined, codex).invoke({
      ...invocation,
      resumeThreadId: "unknown-thread",
    }),
    /not bound to the exact envelope/u,
  );
  assert.deepEqual(
    (await unboundLedger.list()).map((event) => event.type),
    ["codex.started", "codex.failed"],
  );
});

test("a returned Codex thread ID cannot collide with another same-run binding", async () => {
  const role = validRole();
  const exactEnvelope = {
    identity: role.identity,
    role: role.role,
    supraHolon: null,
    scope: [...role.scope],
    capabilities: [...role.capabilities],
    authority: [...role.authority],
    thread: { ...role.thread },
  };
  const scenarios = [
    { actor: "other-role", envelope: exactEnvelope },
    { actor: role.identity, envelope: { ...exactEnvelope, role: "other-role" } },
  ] as const;

  for (const [index, scenario] of scenarios.entries()) {
    const ledger = new MemoryLedger(`returned-thread-collision-${index}`);
    await ledger.append({
      type: "codex.thread_bound",
      loop: "codex-invocation",
      actor: scenario.actor,
      threadId: "colliding-thread",
      taskId: "prior-task",
      attempt: 1,
      state: {
        runId: ledger.runId,
        envelope: scenario.envelope,
      },
      evidence: [],
    });
    const codex: WorkflowCodex = {
      startThread() {
        return mockThread("colliding-thread");
      },
      resumeThread() {
        throw new Error("resume must not be called");
      },
    };
    const client = new CodexWorkflowClient(
      ledger,
      validateWorkflowPlan(validPlan()),
      undefined,
      codex,
    );

    await assert.rejects(
      client.invoke(invocationFor()),
      /already bound to a different role envelope/u,
    );
    assert.equal(
      (await ledger.list()).filter(
        (event) => event.type === "codex.thread_bound",
      ).length,
      1,
    );
  }
});

test("a failed first Codex turn cannot become an unbound cached continuation", async () => {
  const ledger = new MemoryLedger("codex-failed-cache-test");
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return {
        id: `failed-${starts}`,
        async run() {
          throw new Error("turn failed");
        },
      };
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const role = validRole();
  const invocation = {
    taskId: "implement",
    delegation: delegationFor(role),
    input: {},
    outputSchema: {},
    decode: decodeAnswer,
    extractEvidence: () => evidence,
    timeoutMs: 1_000,
  };
  const client = new CodexWorkflowClient(
    ledger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  );

  await assert.rejects(client.invoke(invocation), /turn failed/u);
  await assert.rejects(client.invoke(invocation), /turn failed/u);
  assert.equal(starts, 2);
  assert.equal(
    (await ledger.list()).some((event) => event.type === "codex.thread_bound"),
    false,
  );
});

test("Codex turns enforce the Node timer bound and combine timeout with external cancellation", async () => {
  const ledger = new MemoryLedger("codex-timeout-test");
  const role = validRole();
  let starts = 0;
  const codex: WorkflowCodex = {
    startThread() {
      starts += 1;
      return {
        id: `timeout-${starts}`,
        async run(_input, options) {
          const signal = options.signal;
          if (signal === undefined) throw new Error("Expected a turn signal");
          if (signal.aborted) throw signal.reason;
          return await new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        },
      };
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    ledger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  );

  await assert.rejects(
    client.invoke({ ...invocationFor(), timeoutMs: 0 }),
    /positive safe integer/u,
  );
  await assert.rejects(
    client.invoke({
      ...invocationFor(),
      timeoutMs: MAX_TURN_TIMEOUT_MS + 1,
    }),
    /must not exceed/u,
  );
  await assert.rejects(
    client.invoke({ ...invocationFor(), timeoutMs: 10 }),
    /timeout|timed out/u,
  );

  const external = new AbortController();
  external.abort(new Error("external cancellation"));
  await assert.rejects(
    client.invoke({
      ...invocationFor(),
      signal: external.signal,
    }),
    /external cancellation/u,
  );
  assert.equal(starts, 2);
});

test("Codex client fails concurrent same-role invocations closed", async () => {
  const ledger = new MemoryLedger("codex-single-flight-test");
  const role = validRole();
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
          return { finalResponse: '{"answer":"ok"}', usage: null };
        },
      };
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    ledger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  );
  const first = client.invoke(invocationFor());
  await entered;
  await assert.rejects(
    client.invoke(invocationFor()),
    /already has an active Codex turn/u,
  );
  releaseResolve?.();
  await first;
  assert.equal(
    (await ledger.list()).filter((event) => event.type === "codex.started").length,
    1,
  );
});

test("Codex completion requires and records decoded output evidence", async () => {
  const ledger = new MemoryLedger("codex-output-evidence-test");
  const role = validRole();
  const codex: WorkflowCodex = {
    startThread() {
      return mockThread("evidence-thread");
    },
    resumeThread() {
      throw new Error("resume must not be called");
    },
  };
  const client = new CodexWorkflowClient(
    ledger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  );
  await client.invoke(invocationFor());
  const completedEvent = (await ledger.list()).find(
    (event) => event.type === "codex.completed",
  );
  assert.deepEqual(completedEvent?.evidence, evidence);

  await assert.rejects(
    client.invoke({
      ...invocationFor(),
      delegation: {
        ...delegationFor(role),
        expectedEvidence: [],
      },
    }),
    /expected evidence requires unique, non-empty values/u,
  );

  await assert.rejects(
    client.invoke({ ...invocationFor(), extractEvidence: () => [] }),
    /non-empty decoded evidence/u,
  );
  assert.equal(
    (await ledger.list()).filter((event) => event.type === "codex.completed").length,
    1,
  );
});

test("Codex thread binding rejects evidence from a different ledger run", async () => {
  const role = validRole();
  const codex: WorkflowCodex = {
    startThread() {
      return mockThread("cross-run-thread");
    },
    resumeThread(id) {
      return mockThread(id);
    },
  };
  const sourceLedger = new MemoryLedger("source-run");
  await new CodexWorkflowClient(
    sourceLedger,
    validateWorkflowPlan(validPlan()),
    undefined,
    codex,
  ).invoke(invocationFor());

  const targetLedger = new MemoryLedger("target-run");
  const crossRunLedger: EvidenceLedger = {
    runId: targetLedger.runId,
    append: (event) => targetLedger.append(event),
    list: () => sourceLedger.list(),
  };
  await assert.rejects(
    new CodexWorkflowClient(
      crossRunLedger,
      validateWorkflowPlan(validPlan()),
      undefined,
      codex,
    ).invoke({
      ...invocationFor(),
      resumeThreadId: "cross-run-thread",
    }),
    /not bound to the exact envelope/u,
  );
});

test("reviewer repair records initial and revision evidence before reuse", async () => {
  const ledger = new MemoryLedger("review-evidence-test");
  let inspections = 0;
  const initialEvidence: readonly Evidence[] = [
    { kind: "initial", summary: "initial implementation", references: ["mock"] },
  ];
  const revisionEvidence: readonly Evidence[] = [
    { kind: "revision", summary: "revision applied", references: ["mock"] },
  ];

  const result = await runReviewerRepair(
    "request",
    {
      id: "implementer",
      async implement() {
        return { artifact: "draft", evidence: initialEvidence };
      },
      async revise() {
        return { artifact: "revised", evidence: revisionEvidence };
      },
    },
    {
      id: "reviewer",
      async inspect(_request, artifact) {
        inspections += 1;
        if (inspections === 2) {
          assert.equal(artifact, "revised");
          assert.deepEqual((await ledger.list()).at(-1)?.state, {
            pass: 1,
            phase: "revision",
            repairOwner: "implementer",
          });
          return { kind: "accept" as const, evidence };
        }
        return {
          kind: "repair" as const,
          repairOwner: "implementer" as const,
          findings: [{ id: "finding", summary: "repair", evidence }],
          evidence,
        };
      },
      async repair(artifact) {
        return { artifact, evidence };
      },
    },
    2,
    { ledger },
  );

  assert.equal(result.status, "completed");
  const events = await ledger.list();
  assert.equal(events[1]?.evidence[0]?.summary, "initial implementation");
  assert.equal(events[3]?.evidence[0]?.summary, "revision applied");
});

test("shared artifact records all round evidence before publishing the next artifact", async () => {
  const ledger = new MemoryLedger("shared-evidence-test");
  let acceptanceChecks = 0;
  const contributionEvidence: readonly Evidence[] = [
    { kind: "contribution", summary: "gap filled", references: ["mock"] },
  ];
  const integrationEvidence: readonly Evidence[] = [
    { kind: "integration", summary: "artifact integrated", references: ["mock"] },
  ];

  const result = await runSharedArtifactConvergence(
    "draft",
    {
      async acceptanceMet(artifact) {
        acceptanceChecks += 1;
        if (artifact === "integrated") {
          assert.equal((await ledger.list()).at(-1)?.type, "loop.transition");
          return true;
        }
        return false;
      },
      async openGaps() {
        return [{ id: "gap", purpose: "fill", scope: ["artifact"], expectedEvidence: ["mock"] }];
      },
      async relevantSlice(artifact) {
        return artifact;
      },
      async append(_artifact, { contribution }) {
        return contribution;
      },
      async integrate() {
        return { artifact: "integrated", evidence: integrationEvidence };
      },
    },
    {
      async assign(gaps) {
        const gap = gaps[0];
        if (gap === undefined) throw new Error("Expected a gap");
        return [{
          gap,
          ownerId: "worker",
          async contribute() {
            return { contribution: "filled", evidence: contributionEvidence };
          },
        }];
      },
    },
    { maxRounds: 1, concurrency: 1 },
    { ledger },
  );

  assert.equal(result.status, "completed");
  assert.equal(acceptanceChecks, 2);
  const transition = (await ledger.list()).find(
    (event) => event.type === "loop.transition",
  );
  assert.deepEqual(
    transition?.evidence.map((item) => item.summary),
    ["gap filled", "artifact integrated"],
  );
});

test("subsidiarity records partial evidence before handing changed state upward", async () => {
  const ledger = new MemoryLedger("subsidiarity-order-test");
  const partialEvidence: readonly Evidence[] = [
    { kind: "partial", summary: "local attempt", references: ["child"] },
  ];
  const nodes = new Map<string, {
    readonly id: string;
    readonly parentId?: string;
    assess(problem: string): Promise<{
      capable: boolean;
      withinScope: boolean;
      withinAuthority: boolean;
      requiredScope: readonly string[];
      requiredAuthority: readonly ("read" | "write")[];
    }>;
    solve(problem: string): Promise<{
      kind: "partial";
      unresolved: string;
      evidence: readonly Evidence[];
    }>;
    resolveEscalation(input: {
      unresolved: string;
      attemptedEvidence: readonly Evidence[];
    }): Promise<{
      kind: "handle";
      result: string;
      evidence: readonly Evidence[];
    }>;
  }>();
  nodes.set("child", {
    id: "child",
    parentId: "parent",
    async assess() {
      return {
        capable: true,
        withinScope: true,
        withinAuthority: true,
        requiredScope: ["repository"],
        requiredAuthority: ["read"],
      };
    },
    async solve() {
      return { kind: "partial", unresolved: "remaining", evidence: partialEvidence };
    },
    async resolveEscalation() {
      throw new Error("child does not resolve escalations");
    },
  });
  nodes.set("parent", {
    id: "parent",
    async assess() {
      throw new Error("parent assessment is not needed");
    },
    async solve() {
      throw new Error("parent solve is not needed");
    },
    async resolveEscalation(input) {
      assert.equal(input.unresolved, "remaining");
      assert.deepEqual(input.attemptedEvidence, partialEvidence);
      assert.deepEqual((await ledger.list()).at(-1)?.state, {
        ascent: 0,
        node: "child",
        solution: "partial",
      });
      return { kind: "handle", result: "handled", evidence };
    },
  });

  const result = await runSubsidiarityEscalation(
    "problem",
    "child",
    { get: (id) => {
      const node = nodes.get(id);
      if (node === undefined) throw new Error(`Unknown node ${id}`);
      return node;
    } },
    1,
    { ledger },
  );
  assert.equal(result.status, "completed");
  assert.deepEqual(result.evidence, [...partialEvidence, ...evidence]);
});

test("subsidiarity never performs an ascent beyond maxAscents", async () => {
  const ledger = new MemoryLedger("subsidiarity-budget-test");
  let grandparentAssessments = 0;
  let resolveCalls = 0;
  const ascentEvidence = (summary: string): readonly Evidence[] => [
    { kind: "ascent", summary, references: [summary] },
  ];
  const makeNode = (
    id: string,
    parentId: string | undefined,
    nextEvidence: readonly Evidence[],
  ) => ({
    id,
    ...(parentId === undefined ? {} : { parentId }),
    async assess() {
      if (id === "grandparent") grandparentAssessments += 1;
      return {
        capable: false,
        withinScope: false,
        withinAuthority: false,
        requiredScope: ["repository"],
        requiredAuthority: ["read"] as const,
      };
    },
    async solve() {
      throw new Error("incapable nodes must not solve");
    },
    async resolveEscalation() {
      resolveCalls += 1;
      return { kind: "ascend" as const, evidence: nextEvidence };
    },
  });
  const nodes = new Map([
    ["child", makeNode("child", "parent", [])],
    ["parent", makeNode("parent", "grandparent", ascentEvidence("first ascent"))],
    ["grandparent", makeNode("grandparent", "root", ascentEvidence("blocked ascent"))],
    ["root", makeNode("root", undefined, [])],
  ]);

  const result = await runSubsidiarityEscalation(
    "problem",
    "child",
    { get: (id) => {
      const node = nodes.get(id);
      if (node === undefined) throw new Error(`Unknown node ${id}`);
      return node;
    } },
    1,
    { ledger },
  );
  assert.equal(result.status, "budget_exhausted");
  assert.equal(grandparentAssessments, 0);
  assert.equal(resolveCalls, 1);
  assert.deepEqual(
    (await ledger.list()).map((event) => event.type),
    ["loop.started", "loop.transition", "loop.budget_exhausted"],
  );
  assert.deepEqual(result.evidence.map((item) => item.summary), ["first ascent"]);
});

test("authority ladder permits only backward returns", async () => {
  const ledger = new MemoryLedger("ladder-test");
  let qualityAttempts = 0;

  const result = await runAuthorityLadder(
    "ship",
    0,
    [
      {
        id: "implementation",
        roleId: "primary",
        async run({ workspace, feedback }) {
          return {
            kind: "accept" as const,
            workspace: workspace + (feedback.length > 0 ? 2 : 1),
            evidence,
          };
        },
      },
      {
        id: "quality",
        roleId: "reviewer",
        async run({ workspace }) {
          qualityAttempts += 1;
          return qualityAttempts === 1
            ? {
                kind: "return" as const,
                targetStageId: "implementation",
                workspace,
                feedback: ["repair"],
                evidence,
              }
            : {
                kind: "accept" as const,
                workspace,
                evidence,
              };
        },
      },
    ],
    5,
    { ledger },
  );

  assert.deepEqual(result, {
    status: "completed",
    artifact: 3,
    evidence: [...evidence, ...evidence, ...evidence, ...evidence],
  });
});

function validRole(): CodexRole {
  return {
    identity: "primary",
    role: "implementer",
    scope: ["repository"],
    capabilities: ["write"],
    authority: ["read", "write"],
    thread: {
      model: "gpt-5.3-codex",
      modelReasoningEffort: "high",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      workingDirectory: process.cwd(),
    },
  };
}

function validPlan(): WorkflowPlan {
  return {
    objective: "Implement and verify",
    acceptanceCriteria: ["tests pass"],
    primaryRoleId: "primary",
    loop: "relay-chain",
    roles: [validRole()],
    tasks: [
      {
        id: "implement",
        roleId: "primary",
        purpose: "implement",
        scope: ["repository"],
        requiredCapabilities: ["write"],
        grantedAuthority: ["write"],
        dependencies: [],
        acceptanceCriteria: ["change exists"],
        expectedEvidence: ["test"],
        maxAttempts: 3,
      },
    ],
  };
}

function delegationFor(role: CodexRole): Delegation {
  return {
    from: "primary",
    to: role.identity,
    purpose: "implement",
    scope: ["repository"],
    requiredCapabilities: ["write"],
    context: {},
    constraints: ["Stay within the plan"],
    grantedAuthority: ["write"],
    expectedEvidence: ["test"],
    returnContract: "Return a decoded answer",
  };
}

function acceptanceEvaluation(
  taskId: string,
  criteria: readonly (readonly [criterion: string, satisfied: boolean])[],
) {
  return validateTaskAcceptanceEvaluation({
    taskId,
    criteria: criteria.map(([criterion, satisfied]) => ({
      criterion,
      satisfied,
    })),
  });
}

function invocationFor() {
  const role = validRole();
  return {
    taskId: "implement",
    delegation: delegationFor(role),
    input: { request: "test" },
    outputSchema: { type: "object" },
    decode: decodeAnswer,
    extractEvidence: () => evidence,
    timeoutMs: 1_000,
  };
}

function mockThread(id: string) {
  return {
    id,
    async run() {
      return { finalResponse: '{"answer":"ok"}', usage: null };
    },
  };
}

function decodeAnswer(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("answer" in value) ||
    typeof value.answer !== "string"
  ) {
    throw new Error("Expected a string answer");
  }
  return value.answer;
}
