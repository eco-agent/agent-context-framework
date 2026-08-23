import { createHash } from "node:crypto";

import {
  type CodexOptions,
  type Usage,
} from "@openai/codex-sdk";
import {
  CodexTurnTransport,
  type Authority,
  type CodexTurnResult,
  type CodexRole,
  type JsonValue,
  type WorkflowCodex,
  type WorkflowThread,
  toJson,
} from "@agent-context/codex-workflow-runtime";
import {
  decodeObjectiveId,
  type ObjectiveId,
} from "@agent-context/repo-policy";

import type {
  ObjectiveDelegation,
  ObjectiveEvidenceLedger,
} from "./objective-contracts.js";

export interface WorkflowObjective {
  readonly objectiveId: ObjectiveId;
  readonly repository: {
    readonly branch: string;
    readonly baseRevision: string;
    readonly headRevision: string;
  };
  readonly authority: readonly Authority[];
  readonly acceptanceGates: readonly string[];
  readonly previousResult: JsonValue;
  readonly maxPromptBytes: number;
  readonly maxLedgerStateBytes: number;
  readonly threadPolicy: "reuse_within_objective" | "fresh";
  readonly terminalAfterTurn: boolean;
}

export interface StructuredInvocation<T> {
  readonly objective: WorkflowObjective;
  readonly role: CodexRole;
  readonly delegation: ObjectiveDelegation;
  readonly input: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (value: unknown) => T;
  readonly initialContext?: string;
  readonly ledgerState?: (value: T) => JsonValue;
  readonly continuation?: ObjectiveThreadContinuation;
  readonly signal?: AbortSignal;
}

export interface ObjectiveThreadContinuation {
  readonly objectiveId: ObjectiveId;
  readonly threadId: string;
  readonly envelopeSha256: string;
}

export interface StructuredInvocationResult<T> {
  readonly value: T;
  readonly threadId: string;
  readonly renderedPromptBytes: number;
  readonly usage: Usage | null;
  readonly continuation: ObjectiveThreadContinuation | null;
}

export class PromptBudgetExceededError extends Error {
  public constructor(
    public readonly renderedBytes: number,
    public readonly budgetBytes: number,
  ) {
    super(`Rendered prompt uses ${renderedBytes} UTF-8 bytes; objective budget is ${budgetBytes}.`);
    this.name = "PromptBudgetExceededError";
  }
}

export class ObjectiveCodexPostTurnError extends Error {
  public constructor(
    message: string,
    public readonly threadId: string,
    public readonly renderedPromptBytes: number,
    public readonly usage: Usage | null,
    public readonly continuation: ObjectiveThreadContinuation | null,
    options: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ObjectiveCodexPostTurnError";
  }
}

interface CachedObjectiveThread {
  readonly envelopeSha256: string;
  readonly thread: WorkflowThread;
}

export class ObjectiveCodexClient {
  readonly #transport: CodexTurnTransport;
  readonly #threads = new Map<string, CachedObjectiveThread>();
  readonly #activeObjectiveByRole = new Map<string, string>();
  readonly #activeRoles = new Set<string>();

  public constructor(
    private readonly ledger: ObjectiveEvidenceLedger,
    options?: CodexOptions,
    codex?: WorkflowCodex,
  ) {
    this.#transport = new CodexTurnTransport(options, codex);
  }

  public async invoke<T>(
    invocation: StructuredInvocation<T>,
  ): Promise<StructuredInvocationResult<T>> {
    this.assertDelegation(invocation.role, invocation.delegation);
    this.assertObjective(invocation);
    if (this.#activeRoles.has(invocation.role.identity)) {
      throw new Error(
        `Role ${invocation.role.identity} already has an active Codex turn`,
      );
    }
    this.#activeRoles.add(invocation.role.identity);
    try {
      return await this.invokeExclusive(invocation);
    } finally {
      this.#activeRoles.delete(invocation.role.identity);
    }
  }

  private async invokeExclusive<T>(
    invocation: StructuredInvocation<T>,
  ): Promise<StructuredInvocationResult<T>> {
    const prompt = this.renderPrompt(invocation);
    const renderedPromptBytes = Buffer.byteLength(prompt, "utf8");
    const envelopeSha256 = objectiveThreadEnvelopeSha256(
      invocation.role,
      invocation.objective,
    );

    await this.ledger.append({
      objectiveId: invocation.objective.objectiveId,
      type: "codex.started",
      loop: "codex-invocation",
      actor: invocation.role.identity,
      state: {
        objectiveId: invocation.objective.objectiveId,
        maxPromptBytes: invocation.objective.maxPromptBytes,
        renderedPromptBytes,
        initialContextBytes:
          invocation.initialContext === undefined
            ? 0
            : Buffer.byteLength(invocation.initialContext, "utf8"),
        threadPolicy: invocation.objective.threadPolicy,
        terminalAfterTurn: invocation.objective.terminalAfterTurn,
        envelopeSha256,
        delegation: {
          objectiveId: invocation.delegation.objectiveId,
          from: invocation.delegation.from,
          to: invocation.delegation.to,
          purpose: invocation.delegation.purpose,
          scope: invocation.delegation.scope,
          requiredCapabilities: invocation.delegation.requiredCapabilities,
          grantedAuthority: invocation.delegation.grantedAuthority,
          expectedEvidence: invocation.delegation.expectedEvidence,
          returnContract: invocation.delegation.returnContract,
        },
      },
      evidence: [],
    });

    let thread: WorkflowThread | undefined;
    let turn: CodexTurnResult | undefined;
    try {
      thread = this.resolveThread(
        invocation.role,
        invocation.objective,
        envelopeSha256,
        invocation.continuation,
      );
      turn = await this.#transport.run(
        thread,
        prompt,
        invocation.outputSchema,
        invocation.signal === undefined ? {} : { signal: invocation.signal },
      );
      const threadId = turn.threadId;
      const continuation =
        invocation.objective.threadPolicy === "fresh"
          ? null
          : createObjectiveThreadContinuation(
              invocation.objective.objectiveId,
              threadId,
              envelopeSha256,
            );

      const parsed = JSON.parse(turn.finalResponse) as unknown;
      const value = invocation.decode(parsed);
      const ledgerOutput = invocation.ledgerState?.(value) ?? { decoded: true };
      const ledgerOutputBytes = Buffer.byteLength(JSON.stringify(ledgerOutput), "utf8");
      if (ledgerOutputBytes > invocation.objective.maxLedgerStateBytes) {
        throw new Error(
          `Projected ledger state uses ${ledgerOutputBytes} UTF-8 bytes; objective budget is ${invocation.objective.maxLedgerStateBytes}.`,
        );
      }

      await this.ledger.append({
        objectiveId: invocation.objective.objectiveId,
        type: "codex.completed",
        loop: "codex-invocation",
        actor: invocation.role.identity,
        threadId,
        state: {
          objectiveId: invocation.objective.objectiveId,
          output: ledgerOutput,
          outputBytes: ledgerOutputBytes,
          envelopeSha256,
        },
        evidence: [],
        ...(turn.usage === null ? {} : { usage: turn.usage }),
      });

      if (invocation.objective.terminalAfterTurn) {
        this.releaseThread(invocation.role, invocation.objective);
      }
      return {
        value,
        threadId,
        renderedPromptBytes,
        usage: turn.usage,
        continuation,
      };
    } catch (error) {
      const failedAppendError = await this.appendFailureEvent(
        invocation,
        thread,
        turn,
        envelopeSha256,
        error,
      );
      const cause =
        failedAppendError === undefined
          ? error
          : new AggregateError(
              [error, failedAppendError],
              "Codex invocation and failure evidence append both failed",
            );
      if (turn !== undefined) {
        const continuation =
          invocation.objective.threadPolicy === "fresh"
            ? null
            : createObjectiveThreadContinuation(
                invocation.objective.objectiveId,
                turn.threadId,
                envelopeSha256,
              );
        throw new ObjectiveCodexPostTurnError(
          `Codex thread ${turn.threadId} returned output, but post-turn processing failed: ${errorMessage(error)}`,
          turn.threadId,
          renderedPromptBytes,
          turn.usage,
          continuation,
          { cause },
        );
      }
      if (failedAppendError !== undefined) {
        throw cause;
      }
      throw error;
    }
  }

  private async appendFailureEvent<T>(
    invocation: StructuredInvocation<T>,
    thread: WorkflowThread | undefined,
    turn: CodexTurnResult | undefined,
    envelopeSha256: string,
    error: unknown,
  ): Promise<unknown | undefined> {
    const threadId = turn?.threadId ?? thread?.id;
    try {
      await this.ledger.append({
        objectiveId: invocation.objective.objectiveId,
        type: "codex.failed",
        loop: "codex-invocation",
        actor: invocation.role.identity,
        ...(threadId === null ||
        threadId === undefined ||
        threadId.trim().length === 0
          ? {}
          : { threadId }),
        state: {
          objectiveId: invocation.objective.objectiveId,
          errorType: error instanceof Error ? error.name : "UnknownFailure",
          postTurn: turn !== undefined,
          ...(turn === undefined ? {} : { envelopeSha256 }),
        },
        evidence: [],
        ...(turn?.usage === null || turn?.usage === undefined
          ? {}
          : { usage: turn.usage }),
      });
      return undefined;
    } catch (appendError) {
      return appendError;
    }
  }

  private resolveThread(
    role: CodexRole,
    objective: WorkflowObjective,
    envelopeSha256: string,
    continuation?: ObjectiveThreadContinuation,
  ): WorkflowThread {
    const durable =
      continuation === undefined
        ? undefined
        : decodeObjectiveThreadContinuationValue(continuation);
    if (durable !== undefined && durable.objectiveId !== objective.objectiveId) {
      throw new Error("Durable continuation belongs to a different objective.");
    }
    if (
      durable !== undefined &&
      durable.envelopeSha256 !== envelopeSha256
    ) {
      throw new Error(
        "Durable continuation belongs to a different role or objective envelope.",
      );
    }
    if (objective.threadPolicy === "fresh" && durable !== undefined) {
      throw new Error("A fresh thread policy cannot resume a durable thread.");
    }

    const previousObjective = this.#activeObjectiveByRole.get(role.identity);
    if (
      previousObjective !== undefined &&
      (previousObjective !== objective.objectiveId ||
        objective.threadPolicy === "fresh")
    ) {
      this.#threads.delete(threadKey(role.identity, previousObjective));
      this.#activeObjectiveByRole.delete(role.identity);
    }

    if (objective.threadPolicy === "fresh") {
      this.#activeObjectiveByRole.delete(role.identity);
      return this.#transport.startThread(role.thread);
    }

    const key = threadKey(role.identity, objective.objectiveId);
    const existing = this.#threads.get(key);
    if (existing !== undefined) {
      if (existing.envelopeSha256 !== envelopeSha256) {
        this.#threads.delete(key);
      } else {
        const cachedThreadId = existing.thread.id;
        if (durable !== undefined) {
          if (cachedThreadId === null || cachedThreadId.trim().length === 0) {
            throw new Error(
              `Cached thread for role ${role.identity} has no stable ID to compare with the durable continuation.`,
            );
          }
          if (durable.threadId !== cachedThreadId) {
            throw new Error(
              `Durable continuation thread ${durable.threadId} differs from the cached thread for role ${role.identity}.`,
            );
          }
        }
        this.#activeObjectiveByRole.set(role.identity, objective.objectiveId);
        return existing.thread;
      }
    }

    const thread =
      durable !== undefined
        ? this.#transport.resumeThread(durable.threadId, role.thread)
        : this.#transport.startThread(role.thread);

    this.#threads.set(key, { envelopeSha256, thread });
    this.#activeObjectiveByRole.set(role.identity, objective.objectiveId);
    return thread;
  }

  private releaseThread(
    role: CodexRole,
    objective: WorkflowObjective,
  ): void {
    if (objective.threadPolicy === "fresh") {
      return;
    }
    this.#threads.delete(threadKey(role.identity, objective.objectiveId));
    if (
      this.#activeObjectiveByRole.get(role.identity) ===
      objective.objectiveId
    ) {
      this.#activeObjectiveByRole.delete(role.identity);
    }
  }

  private assertDelegation(
    role: CodexRole,
    delegation: ObjectiveDelegation,
  ): void {
    if (delegation.to !== role.identity) {
      throw new Error(
        `Delegation target ${delegation.to} does not match role ${role.identity}`,
      );
    }

    const roleAuthority = new Set(role.authority);
    const excess = delegation.grantedAuthority.filter(
      (authority) => !roleAuthority.has(authority),
    );
    if (excess.length > 0) {
      throw new Error(
        `Delegation exceeds ${role.identity} authority: ${excess.join(", ")}`,
      );
    }

    const roleScope = new Set(role.scope);
    const excessScope = delegation.scope.filter(
      (scope) => !roleScope.has(scope),
    );
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

  private assertObjective<T>(invocation: StructuredInvocation<T>): void {
    const objective = invocation.objective;
    decodeObjectiveId(objective.objectiveId);
    if (invocation.delegation.objectiveId !== objective.objectiveId) {
      throw new Error("Delegation belongs to a different objective.");
    }
    const requiredStrings = [
      objective.repository.branch,
      objective.repository.baseRevision,
      objective.repository.headRevision,
    ];
    if (requiredStrings.some((value) => value.trim().length === 0)) {
      throw new Error(
        "Branch, base revision, and head revision are required.",
      );
    }
    if (objective.acceptanceGates.length === 0) {
      throw new Error("Objective requires at least one acceptance gate.");
    }
    if (
      !Number.isSafeInteger(objective.maxPromptBytes) ||
      objective.maxPromptBytes <= 0
    ) {
      throw new Error("Objective maxPromptBytes must be a positive safe integer.");
    }
    if (
      !Number.isSafeInteger(objective.maxLedgerStateBytes) ||
      objective.maxLedgerStateBytes <= 0
    ) {
      throw new Error("Objective maxLedgerStateBytes must be a positive safe integer.");
    }

    const objectiveAuthority = new Set(objective.authority);
    const unauthorizedDelegation =
      invocation.delegation.grantedAuthority.filter(
        (authority) => !objectiveAuthority.has(authority),
      );
    if (unauthorizedDelegation.length > 0) {
      throw new Error(
        `Delegation exceeds objective authority: ${unauthorizedDelegation.join(
          ", ",
        )}`,
      );
    }
  }

  private renderPrompt<T>(invocation: StructuredInvocation<T>): string {
    const prompt = [
      `Your role is ${invocation.role.role} (${invocation.role.identity}).`,
      "Complete the assignment, including nearby changes needed to make it work.",
      "Make ordinary implementation decisions that stay within the task. Make sure the change works with the surrounding code and remains easy to maintain.",
      "When details are missing, follow the repository's checked-in rules and the existing product behavior. Choose the smallest change that still solves the task and is easy to undo.",
      "Do not stop after the named edit if a nearby missing change would leave the requested result broken or incomplete.",
      "Do not add unrelated features or make decisions outside the permissions below.",
      "Use direct execution, static checks, existing affected tests, and read-only review. Checking the work must not expand the implementation.",
      "Add test or verification code only when the acceptance requirements call for an automated check that must remain in the repository.",
      "Your response is consumed as data. Return only JSON that matches the supplied schema.",
      ...(invocation.initialContext === undefined
        ? []
        : ["", "Repository facts already checked:", invocation.initialContext]),
      "",
      "Objective:",
      JSON.stringify(invocation.objective, null, 2),
      "",
      "Your assignment:",
      JSON.stringify(invocation.delegation, null, 2),
      "",
      "Task input:",
      JSON.stringify(invocation.input, null, 2),
      "",
      "Follow the repository's communication rules when writing prose values. Use ordinary sentences and concrete nouns. Do not copy the clipped wording or list structure of these instructions. Keep JSON keys and other machine-readable syntax unchanged.",
    ].join("\n");
    const renderedBytes = Buffer.byteLength(prompt, "utf8");
    if (renderedBytes > invocation.objective.maxPromptBytes) {
      throw new PromptBudgetExceededError(
        renderedBytes,
        invocation.objective.maxPromptBytes,
      );
    }
    return prompt;
  }
}

function threadKey(roleIdentity: string, objectiveId: string): string {
  return `${roleIdentity}\u0000${objectiveId}`;
}

const objectiveThreadContinuationKeys = new Set([
  "objectiveId",
  "threadId",
  "envelopeSha256",
]);

export function encodeObjectiveThreadContinuation(
  continuation: ObjectiveThreadContinuation,
): string {
  const value = decodeObjectiveThreadContinuationValue(continuation);
  return JSON.stringify({
    schemaVersion: 1,
    objectiveId: value.objectiveId,
    threadId: value.threadId,
    envelopeSha256: value.envelopeSha256,
  });
}

export function decodeObjectiveThreadContinuation(
  token: string,
): ObjectiveThreadContinuation {
  if (token.trim().length === 0) {
    throw new Error("Objective thread continuation token cannot be empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(token) as unknown;
  } catch (error) {
    throw new Error("Objective thread continuation token is not valid JSON.", {
      cause: error,
    });
  }
  const value = decodeRecord(parsed, "Objective thread continuation token");
  assertExactKeys(
    value,
    ["schemaVersion", ...objectiveThreadContinuationKeys],
    "Objective thread continuation token",
  );
  if (value.schemaVersion !== 1) {
    throw new Error("Objective thread continuation schemaVersion must be 1.");
  }
  return decodeObjectiveThreadContinuationValue({
    objectiveId: value.objectiveId,
    threadId: value.threadId,
    envelopeSha256: value.envelopeSha256,
  });
}

function createObjectiveThreadContinuation(
  objectiveId: ObjectiveId,
  threadId: string,
  envelopeSha256: string,
): ObjectiveThreadContinuation {
  return Object.freeze({ objectiveId, threadId, envelopeSha256 });
}

function decodeObjectiveThreadContinuationValue(
  input: unknown,
): ObjectiveThreadContinuation {
  const value = decodeRecord(input, "Objective thread continuation");
  assertExactKeys(
    value,
    [...objectiveThreadContinuationKeys],
    "Objective thread continuation",
  );
  const objectiveId = decodeObjectiveId(value.objectiveId);
  const threadId = decodeRequiredString(
    value.threadId,
    "Objective thread continuation threadId",
  );
  const envelopeSha256 = decodeRequiredString(
    value.envelopeSha256,
    "Objective thread continuation envelopeSha256",
  );
  if (!/^[0-9a-f]{64}$/u.test(envelopeSha256)) {
    throw new Error(
      "Objective thread continuation envelopeSha256 must be a lowercase SHA-256 digest.",
    );
  }
  return createObjectiveThreadContinuation(
    objectiveId,
    threadId,
    envelopeSha256,
  );
}

function objectiveThreadEnvelopeSha256(
  role: CodexRole,
  objective: WorkflowObjective,
): string {
  const envelope: JsonValue = {
    schemaVersion: 1,
    role: {
      identity: role.identity,
      role: role.role,
      supraHolon: role.supraHolon ?? null,
      scope: [...role.scope],
      capabilities: [...role.capabilities],
      authority: [...role.authority],
      thread: toJson(role.thread),
    },
    objective: {
      objectiveId: objective.objectiveId,
      repository: {
        branch: objective.repository.branch,
        baseRevision: objective.repository.baseRevision,
        headRevision: objective.repository.headRevision,
      },
      authority: [...objective.authority],
      acceptanceGates: [...objective.acceptanceGates],
      threadPolicy: objective.threadPolicy,
      terminalAfterTurn: objective.terminalAfterTurn,
    },
  };
  return createHash("sha256").update(canonicalJson(envelope)).digest("hex");
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
    throw new Error("Canonical JSON cannot encode an undefined value.");
  }
  return encoded;
}

function isJsonObject(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }
  // type-invariant: the object, array, and null checks prove string-keyed
  // access. Every consumed field is decoded below.
  return input as Record<string, unknown>;
}

function decodeRequiredString(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return input;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: Iterable<string>,
  label: string,
): void {
  const expectedKeys = new Set(expected);
  const actualKeys = Object.keys(value);
  const missing = [...expectedKeys].filter((key) => !(key in value));
  const unknown = actualKeys.filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${label} fields differ from the contract` +
        `${missing.length === 0 ? "" : `; missing: ${missing.join(", ")}`}` +
        `${unknown.length === 0 ? "" : `; unknown: ${unknown.join(", ")}`}.`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
