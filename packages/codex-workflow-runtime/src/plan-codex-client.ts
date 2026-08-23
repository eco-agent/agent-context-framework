import {
  type CodexOptions,
} from "@openai/codex-sdk";

import type {
  CodexRole,
  Delegation,
  Evidence,
  EvidenceLedger,
  JsonValue,
  WorkflowEvent,
} from "./contracts.js";
import { toJson } from "./contracts.js";
import {
  CodexTurnTransport,
  validateCodexTurnRunOptions,
  type WorkflowCodex,
  type WorkflowThread,
} from "./codex-turn-transport.js";
import {
  assertValidatedWorkflowPlan,
  validateWorkflowPlan,
  type PlannedTask,
  type ValidatedWorkflowPlan,
} from "./plan.js";

export interface StructuredInvocation<T> {
  readonly taskId: string;
  readonly delegation: Delegation;
  readonly input: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (value: unknown) => T;
  readonly extractEvidence: (value: T) => readonly Evidence[];
  readonly timeoutMs: number;
  readonly freshThread?: boolean;
  readonly resumeThreadId?: string;
  readonly signal?: AbortSignal;
}

export interface StructuredInvocationResult<T> {
  readonly value: T;
  readonly threadId: string;
  readonly taskId: string;
  readonly attempt: number;
}

export interface TaskCriterionEvaluation {
  readonly criterion: string;
  readonly satisfied: boolean;
}

export interface TaskAcceptanceEvaluation {
  readonly taskId: string;
  readonly criteria: readonly TaskCriterionEvaluation[];
}

const validatedTaskAcceptanceEvaluationBrand: unique symbol = Symbol(
  "ValidatedTaskAcceptanceEvaluation",
);

export interface ValidatedTaskAcceptanceEvaluation
  extends TaskAcceptanceEvaluation {
  readonly [validatedTaskAcceptanceEvaluationBrand]: true;
}

export function validateTaskAcceptanceEvaluation(
  input: unknown,
): ValidatedTaskAcceptanceEvaluation {
  const value = decodeAcceptanceObject(input, "Task acceptance evaluation");
  assertOnlyKeys(value, ["taskId", "criteria"], "Task acceptance evaluation");
  const taskId = decodeAcceptanceString(
    value.taskId,
    "Task acceptance evaluation taskId",
  );
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) {
    throw new Error("Task acceptance evaluation criteria must be a non-empty array");
  }
  const criteria = value.criteria.map((inputCriterion, index) => {
    const criterion = decodeAcceptanceObject(
      inputCriterion,
      `Task acceptance criterion ${index}`,
    );
    assertOnlyKeys(
      criterion,
      ["criterion", "satisfied"],
      `Task acceptance criterion ${index}`,
    );
    const name = decodeAcceptanceString(
      criterion.criterion,
      `Task acceptance criterion ${index} name`,
    );
    if (typeof criterion.satisfied !== "boolean") {
      throw new Error(
        `Task acceptance criterion ${index} satisfied must be a boolean`,
      );
    }
    return Object.freeze({
      criterion: name,
      satisfied: criterion.satisfied,
    });
  });
  if (new Set(criteria.map((criterion) => criterion.criterion)).size !== criteria.length) {
    throw new Error("Task acceptance evaluation criteria must be unique");
  }
  Object.freeze(criteria);
  const validated: ValidatedTaskAcceptanceEvaluation = {
    [validatedTaskAcceptanceEvaluationBrand]: true,
    taskId,
    criteria,
  };
  return Object.freeze(validated);
}

interface CachedThread {
  readonly envelope: JsonValue;
  readonly thread: WorkflowThread;
}

export class PlanCodexClient {
  readonly #transport: CodexTurnTransport;
  readonly #plan: ValidatedWorkflowPlan;
  readonly #roles: ReadonlyMap<string, CodexRole>;
  readonly #tasks: ReadonlyMap<string, PlannedTask>;
  readonly #threads = new Map<string, CachedThread>();
  readonly #activeRoles = new Set<string>();
  // Current-process control state only. The JSONL ledger is audit evidence,
  // not a task-state restoration mechanism.
  readonly #attempts = new Map<string, number>();
  readonly #successfulAttempts = new Map<
    string,
    { readonly attempt: number; readonly evidence: readonly Evidence[] }
  >();
  readonly #acceptedTasks = new Set<string>();
  readonly #acceptingTasks = new Set<string>();

  public constructor(
    private readonly ledger: EvidenceLedger,
    plan: ValidatedWorkflowPlan,
    options?: CodexOptions,
    codex?: WorkflowCodex,
  ) {
    assertValidatedWorkflowPlan(plan);
    this.#plan = validateWorkflowPlan(plan);
    this.#roles = new Map(
      this.#plan.roles.map((role) => [role.identity, role]),
    );
    this.#tasks = new Map(
      this.#plan.tasks.map((task) => [task.id, task]),
    );
    this.#transport = new CodexTurnTransport(options, codex);
  }

  public async invoke<T>(
    invocation: StructuredInvocation<T>,
  ): Promise<StructuredInvocationResult<T>> {
    const { role, task } = this.assertInvocation(invocation);
    if (this.#activeRoles.has(role.identity)) {
      throw new Error(`Role ${role.identity} already has an active Codex turn`);
    }
    const priorAttempts = this.#attempts.get(task.id) ?? 0;
    if (priorAttempts >= task.maxAttempts) {
      throw new Error(
        `Task ${task.id} exhausted its ${task.maxAttempts} attempt budget`,
      );
    }
    const attempt = priorAttempts + 1;
    this.#attempts.set(task.id, attempt);
    this.#successfulAttempts.delete(task.id);
    this.#activeRoles.add(role.identity);
    try {
      return await this.invokeExclusive(invocation, role, task, attempt);
    } finally {
      this.#activeRoles.delete(role.identity);
    }
  }

  public async acceptTask(
    taskId: string,
    evaluation: ValidatedTaskAcceptanceEvaluation,
  ): Promise<void> {
    const task = this.#tasks.get(taskId);
    if (task === undefined) {
      throw new Error(`Task ${taskId} is not in the validated workflow plan`);
    }
    if (this.#acceptedTasks.has(taskId)) {
      throw new Error(`Task ${taskId} is already accepted`);
    }
    if (this.#acceptingTasks.has(taskId)) {
      throw new Error(`Task ${taskId} already has an acceptance transition in progress`);
    }
    assertValidatedTaskAcceptanceEvaluation(evaluation);
    this.#acceptingTasks.add(taskId);
    try {
      this.assertAcceptanceCriteria(task, taskId, evaluation);
      const successfulAttempt = this.#successfulAttempts.get(taskId);
      if (successfulAttempt === undefined) {
        throw new Error(`Task ${taskId} has no successful Codex attempt to accept`);
      }
      const { attempt, evidence: acceptanceEvidence } = successfulAttempt;
      const evidenceKinds = new Set(
        acceptanceEvidence.map((item) => item.kind),
      );
      const missingEvidence = task.expectedEvidence.filter(
        (expected) => !evidenceKinds.has(expected),
      );
      if (missingEvidence.length > 0) {
        throw new Error(
          `Task ${taskId} acceptance is missing expected evidence kinds: ${missingEvidence.join(", ")}`,
        );
      }
      await this.ledger.append({
        type: "task.accepted",
        loop: "task-state",
        actor: this.#plan.primaryRoleId,
        taskId,
        attempt,
        state: {
          criteria: evaluation.criteria.map((criterion) => ({
            criterion: criterion.criterion,
            satisfied: criterion.satisfied,
          })),
          expectedEvidence: [...task.expectedEvidence],
        },
        evidence: acceptanceEvidence,
      });
      this.#acceptedTasks.add(taskId);
    } finally {
      this.#acceptingTasks.delete(taskId);
    }
  }

  private async invokeExclusive<T>(
    invocation: StructuredInvocation<T>,
    role: CodexRole,
    task: PlannedTask,
    attempt: number,
  ): Promise<StructuredInvocationResult<T>> {
    await this.ledger.append({
      type: "codex.started",
      loop: "codex-invocation",
      actor: role.identity,
      taskId: task.id,
      attempt,
      state: {
        taskId: task.id,
        attempt,
        delegation: toJson(invocation.delegation),
        timeoutMs: invocation.timeoutMs,
      },
      evidence: [],
    });

    let thread: WorkflowThread | undefined;
    try {
      thread = await this.resolveThread(
        role,
        invocation.freshThread,
        invocation.resumeThreadId,
      );
      const turn = await this.#transport.run(
        thread,
        this.renderPrompt(invocation, role),
        invocation.outputSchema,
        {
          timeoutMs: invocation.timeoutMs,
          ...(invocation.signal === undefined
            ? {}
            : { signal: invocation.signal }),
        },
      );
      const threadId = turn.threadId;

      const envelope = roleEnvelope(role);
      await this.assertThreadIdAvailable(threadId, role, envelope);
      await this.ledger.append({
        type: "codex.thread_bound",
        loop: "codex-invocation",
        actor: role.identity,
        threadId,
        taskId: task.id,
        attempt,
        state: {
          runId: this.ledger.runId,
          taskId: task.id,
          attempt,
          envelope,
        },
        evidence: [],
      });

      const parsed = JSON.parse(turn.finalResponse) as unknown;
      const value = invocation.decode(parsed);
      const completionEvidence = snapshotCompletionEvidence(
        invocation.extractEvidence(value),
      );

      await this.ledger.append({
        type: "codex.completed",
        loop: "codex-invocation",
        actor: role.identity,
        threadId,
        taskId: task.id,
        attempt,
        state: {
          taskId: task.id,
          attempt,
          output: toJson(value),
        },
        evidence: completionEvidence,
        ...(turn.usage === null ? {} : { usage: turn.usage }),
      });

      this.#successfulAttempts.set(task.id, {
        attempt,
        evidence: completionEvidence,
      });
      return { value, threadId, taskId: task.id, attempt };
    } catch (error) {
      this.#threads.delete(role.identity);
      await this.ledger.append({
        type: "codex.failed",
        loop: "codex-invocation",
        actor: role.identity,
        taskId: task.id,
        attempt,
        ...(thread?.id === null || thread?.id === undefined
          ? {}
          : { threadId: thread.id }),
        state: {
          taskId: task.id,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        },
        evidence: [],
      });
      throw error;
    }
  }

  private async resolveThread(
    role: CodexRole,
    freshThread = false,
    resumeThreadId?: string,
  ): Promise<WorkflowThread> {
    const envelope = roleEnvelope(role);
    if (freshThread) {
      this.#threads.delete(role.identity);
    }
    if (!freshThread) {
      const existing = this.#threads.get(role.identity);
      if (existing !== undefined) {
        if (!jsonEqual(existing.envelope, envelope)) {
          throw new Error(
            `Cached thread envelope no longer matches role ${role.identity}`,
          );
        }
        if (existing.thread.id === null) {
          throw new Error(
            `Cached thread for role ${role.identity} has no ledger-bound ID`,
          );
        }
        if (
          resumeThreadId !== undefined &&
          resumeThreadId !== existing.thread.id
        ) {
          throw new Error(
            `Requested thread ${resumeThreadId} differs from the cached thread for role ${role.identity}`,
          );
        }
        await this.assertThreadBinding(
          existing.thread.id,
          role,
          envelope,
        );
        return existing.thread;
      }
    }

    if (!freshThread && resumeThreadId !== undefined) {
      await this.assertThreadBinding(resumeThreadId, role, envelope);
    }
    const thread =
      !freshThread && resumeThreadId !== undefined
        ? this.#transport.resumeThread(resumeThreadId, role.thread)
        : this.#transport.startThread(role.thread);

    if (!freshThread) {
      this.#threads.set(role.identity, { envelope, thread });
    }
    return thread;
  }

  private async assertThreadBinding(
    threadId: string,
    role: CodexRole,
    envelope: JsonValue,
  ): Promise<void> {
    if (threadId.trim().length === 0) {
      throw new Error("Resume thread ID cannot be empty");
    }
    const events = await this.ledger.list();
    this.assertNoConflictingBinding(events, threadId, role, envelope);
    const bound = events.some((event) => {
      const bindingEnvelope = envelopeFromBinding(event.state);
      return (
        event.type === "codex.thread_bound" &&
        event.runId === this.ledger.runId &&
        event.threadId === threadId &&
        event.actor === role.identity &&
        bindingEnvelope !== undefined &&
        jsonEqual(bindingEnvelope, envelope)
      );
    });
    if (!bound) {
      throw new Error(
        `Thread ${threadId} is not bound to the exact envelope for role ${role.identity}`,
      );
    }
  }

  private async assertThreadIdAvailable(
    threadId: string,
    role: CodexRole,
    envelope: JsonValue,
  ): Promise<void> {
    const events = await this.ledger.list();
    this.assertNoConflictingBinding(events, threadId, role, envelope);
  }

  private assertNoConflictingBinding(
    events: readonly WorkflowEvent[],
    threadId: string,
    role: CodexRole,
    envelope: JsonValue,
  ): void {
    const conflicting = events.some((event) => {
      if (
        event.type !== "codex.thread_bound" ||
        event.runId !== this.ledger.runId ||
        event.threadId !== threadId
      ) {
        return false;
      }
      const bindingEnvelope = envelopeFromBinding(event.state);
      return (
        event.actor !== role.identity ||
        bindingEnvelope === undefined ||
        !jsonEqual(bindingEnvelope, envelope)
      );
    });
    if (conflicting) {
      throw new Error(
        `Thread ${threadId} is already bound to a different role envelope in run ${this.ledger.runId}`,
      );
    }
  }

  private assertInvocation<T>(
    invocation: StructuredInvocation<T>,
  ): { readonly role: CodexRole; readonly task: PlannedTask } {
    const task = this.#tasks.get(invocation.taskId);
    if (task === undefined) {
      throw new Error(`Task ${invocation.taskId} is not in the validated workflow plan`);
    }
    if (this.#acceptedTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already accepted`);
    }
    if (this.#acceptingTasks.has(task.id)) {
      throw new Error(`Task ${task.id} has an acceptance transition in progress`);
    }
    const incompleteDependencies = task.dependencies.filter(
      (dependency) => !this.#acceptedTasks.has(dependency),
    );
    if (incompleteDependencies.length > 0) {
      throw new Error(
        `Task ${task.id} has incomplete dependencies: ${incompleteDependencies.join(", ")}`,
      );
    }
    const registered = this.#roles.get(task.roleId);
    if (registered === undefined) {
      throw new Error(`Task ${task.id} references an unavailable role`);
    }
    this.assertDelegation(registered, task, invocation.delegation);
    validateCodexTurnRunOptions({
      timeoutMs: invocation.timeoutMs,
      ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
    });
    if (typeof invocation.extractEvidence !== "function") {
      throw new Error("Codex invocation requires output evidence extraction");
    }
    if (invocation.freshThread && invocation.resumeThreadId !== undefined) {
      throw new Error("A fresh Codex thread cannot also resume a thread ID");
    }
    return { role: registered, task };
  }

  private assertAcceptanceCriteria(
    task: PlannedTask,
    taskId: string,
    evaluation: ValidatedTaskAcceptanceEvaluation,
  ): void {
    if (evaluation.taskId !== taskId) {
      throw new Error(
        `Task acceptance evaluation for ${evaluation.taskId} cannot accept ${taskId}`,
      );
    }
    const expected = new Set(task.acceptanceCriteria);
    const declared = new Set(
      evaluation.criteria.map((criterion) => criterion.criterion),
    );
    const missing = task.acceptanceCriteria.filter(
      (criterion) => !declared.has(criterion),
    );
    const extra = evaluation.criteria
      .map((criterion) => criterion.criterion)
      .filter((criterion) => !expected.has(criterion));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `Task ${taskId} acceptance criteria coverage differs from the validated plan` +
        `${missing.length === 0 ? "" : `; missing: ${missing.join(", ")}`}` +
        `${extra.length === 0 ? "" : `; extra: ${extra.join(", ")}`}`,
      );
    }
    const unsatisfied = evaluation.criteria
      .filter((criterion) => !criterion.satisfied)
      .map((criterion) => criterion.criterion);
    if (unsatisfied.length > 0) {
      throw new Error(
        `Task ${taskId} has unsatisfied acceptance criteria: ${unsatisfied.join(", ")}`,
      );
    }
  }

  private assertDelegation(
    role: CodexRole,
    task: PlannedTask,
    delegation: Delegation,
  ): void {
    assertNonEmptyString(delegation.from, "Delegation source");
    assertNonEmptyString(delegation.purpose, "Delegation purpose");
    assertNonEmptyStrings(delegation.scope, "Delegation scope");
    assertNonEmptyStrings(
      delegation.requiredCapabilities,
      "Delegation required capabilities",
    );
    assertNonEmptyStrings(
      delegation.expectedEvidence,
      "Delegation expected evidence",
    );
    assertNonEmptyString(delegation.returnContract, "Delegation return contract");
    if (!this.#roles.has(delegation.from)) {
      throw new Error(
        `Delegation source ${delegation.from} is not a registered workflow role`,
      );
    }
    if (delegation.to !== role.identity) {
      throw new Error(
        `Delegation target ${delegation.to} does not match role ${role.identity}`,
      );
    }
    if (delegation.purpose !== task.purpose) {
      throw new Error(`Delegation purpose differs from task ${task.id}`);
    }
    assertSameValues(delegation.scope, task.scope, `Task ${task.id} scope`);
    assertSameValues(
      delegation.requiredCapabilities,
      task.requiredCapabilities,
      `Task ${task.id} required capabilities`,
    );
    assertSameValues(
      delegation.grantedAuthority,
      task.grantedAuthority,
      `Task ${task.id} granted authority`,
    );
    assertSameValues(
      delegation.expectedEvidence,
      task.expectedEvidence,
      `Task ${task.id} expected evidence`,
    );

    const roleAuthority = new Set(role.authority);
    const excessAuthority = delegation.grantedAuthority.filter(
      (authority) => !roleAuthority.has(authority),
    );
    if (excessAuthority.length > 0) {
      throw new Error(
        `Delegation exceeds ${role.identity} authority: ${excessAuthority.join(", ")}`,
      );
    }
    const roleScope = new Set(role.scope);
    const excessScope = delegation.scope.filter((scope) => !roleScope.has(scope));
    if (excessScope.length > 0) {
      throw new Error(
        `Delegation exceeds ${role.identity} scope: ${excessScope.join(", ")}`,
      );
    }
    const roleCapabilities = new Set(role.capabilities);
    const excessCapabilities = delegation.requiredCapabilities.filter(
      (capability) => !roleCapabilities.has(capability),
    );
    if (excessCapabilities.length > 0) {
      throw new Error(
        `Delegation exceeds ${role.identity} capabilities: ${excessCapabilities.join(", ")}`,
      );
    }
  }

  private renderPrompt<T>(
    invocation: StructuredInvocation<T>,
    role: CodexRole,
  ): string {
    return [
      `You are the ${role.role} role (${role.identity}).`,
      "Complete the delegated work. Stay within the supplied scope and authority.",
      "Treat the return schema as a control-plane contract. Return only JSON that matches it.",
      "",
      "Delegation:",
      JSON.stringify(invocation.delegation, null, 2),
      "",
      "Input:",
      JSON.stringify(invocation.input, null, 2),
    ].join("\n");
  }
}

function roleEnvelope(role: CodexRole): JsonValue {
  return {
    identity: role.identity,
    role: role.role,
    supraHolon: role.supraHolon ?? null,
    scope: [...role.scope],
    capabilities: [...role.capabilities],
    authority: [...role.authority],
    thread: toJson(role.thread),
  };
}

function envelopeFromBinding(state: JsonValue): JsonValue | undefined {
  if (!isJsonObject(state)) {
    return undefined;
  }
  return state.envelope;
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error("Canonical JSON cannot encode an undefined value");
  }
  return encoded;
}

function isJsonObject(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function assertNonEmptyStrings(values: readonly string[], label: string): void {
  if (
    values.length === 0 ||
    values.some((value) => value.trim().length === 0) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(`${label} requires unique, non-empty values`);
  }
}

function assertSameValues<T extends string>(
  actual: readonly T[],
  expected: readonly T[],
  label: string,
): void {
  const expectedValues = new Set(expected);
  if (
    actual.length !== expected.length ||
    actual.some((value) => !expectedValues.has(value))
  ) {
    throw new Error(`${label} differs from the validated workflow plan`);
  }
}

function assertValidatedTaskAcceptanceEvaluation(
  value: unknown,
): asserts value is ValidatedTaskAcceptanceEvaluation {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Record<PropertyKey, unknown>)[
      validatedTaskAcceptanceEvaluationBrand
    ] !== true ||
    !Object.isFrozen(value)
  ) {
    throw new Error(
      "Task acceptance requires a validated controller evaluation",
    );
  }
}

function decodeAcceptanceObject(
  input: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  // type-invariant: the runtime object/array/null guard proves string-keyed
  // property access is safe; every consumed property is decoded below.
  return input as Record<string, unknown>;
}

function decodeAcceptanceString(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return input;
}

function assertOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}`);
  }
}

function snapshotCompletionEvidence(input: unknown): readonly Evidence[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Codex output must provide non-empty decoded evidence");
  }
  const evidence = input.map((item, index): Evidence => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Codex output evidence ${index} must be an object`);
    }
    const value = item as Record<string, unknown>;
    const kind = value.kind;
    const summary = value.summary;
    const references = value.references;
    if (typeof kind !== "string" || kind.trim().length === 0) {
      throw new Error(`Codex output evidence ${index} requires a kind`);
    }
    if (typeof summary !== "string" || summary.trim().length === 0) {
      throw new Error(`Codex output evidence ${index} requires a summary`);
    }
    if (
      !Array.isArray(references) ||
      references.length === 0 ||
      references.some(
        (reference) =>
          typeof reference !== "string" || reference.trim().length === 0,
      ) ||
      new Set(references).size !== references.length
    ) {
      throw new Error(
        `Codex output evidence ${index} requires unique, non-empty references`,
      );
    }
    const referenceSnapshot = references.map((reference) => {
      if (typeof reference !== "string") {
        throw new Error(`Codex output evidence ${index} has an invalid reference`);
      }
      return reference;
    });
    Object.freeze(referenceSnapshot);
    const snapshot: Evidence = {
      kind,
      summary,
      references: referenceSnapshot,
      ...(value.data === undefined ? {} : { data: toJson(value.data) }),
    };
    return Object.freeze(snapshot);
  });
  return Object.freeze(evidence);
}
