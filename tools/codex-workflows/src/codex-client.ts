import {
  Codex,
  type CodexOptions,
  type ThreadOptions,
  type TurnOptions,
  type Usage,
} from "@openai/codex-sdk";
import {
  decodeObjectiveId,
  type ObjectiveId,
} from "@agent-context/repo-policy";

import type {
  Authority,
  CodexRole,
  Delegation,
  EvidenceLedger,
  JsonValue,
} from "./contracts.js";

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
  readonly delegation: Delegation;
  readonly input: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (value: unknown) => T;
  readonly initialContext?: string;
  readonly ledgerState?: (value: T) => JsonValue;
  readonly resumeThreadId?: string;
  readonly signal?: AbortSignal;
}

export interface StructuredInvocationResult<T> {
  readonly value: T;
  readonly threadId: string;
  readonly renderedPromptBytes: number;
  readonly usage: Usage | null;
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

export interface WorkflowThread {
  readonly id: string | null;
  run(
    input: string,
    options: TurnOptions,
  ): Promise<{
    readonly finalResponse: string;
    readonly usage: Usage | null;
  }>;
}

export interface WorkflowCodex {
  startThread(options: ThreadOptions): WorkflowThread;
  resumeThread(id: string, options: ThreadOptions): WorkflowThread;
}

export class CodexWorkflowClient {
  readonly #codex: WorkflowCodex;
  readonly #threads = new Map<string, WorkflowThread>();
  readonly #activeObjectiveByRole = new Map<string, string>();
  readonly #consumedResumeKeys = new Set<string>();

  public constructor(
    private readonly ledger: EvidenceLedger,
    options?: CodexOptions,
    codex?: WorkflowCodex,
  ) {
    this.#codex = codex ?? new Codex(options);
  }

  public async invoke<T>(
    invocation: StructuredInvocation<T>,
  ): Promise<StructuredInvocationResult<T>> {
    this.assertDelegation(invocation.role, invocation.delegation);
    this.assertObjective(invocation);
    const prompt = this.renderPrompt(invocation);

    const thread = this.resolveThread(
      invocation.role,
      invocation.objective,
      invocation.resumeThreadId,
    );

    await this.ledger.append({
      objectiveId: invocation.objective.objectiveId,
      type: "codex.started",
      loop: "codex-invocation",
      actor: invocation.role.identity,
      state: {
        objectiveId: invocation.objective.objectiveId,
        maxPromptBytes: invocation.objective.maxPromptBytes,
        renderedPromptBytes: Buffer.byteLength(prompt, "utf8"),
        initialContextBytes:
          invocation.initialContext === undefined
            ? 0
            : Buffer.byteLength(invocation.initialContext, "utf8"),
        threadPolicy: invocation.objective.threadPolicy,
        terminalAfterTurn: invocation.objective.terminalAfterTurn,
        delegation: {
          objectiveId: invocation.delegation.objectiveId,
          from: invocation.delegation.from,
          to: invocation.delegation.to,
          purpose: invocation.delegation.purpose,
          scope: invocation.delegation.scope,
          grantedAuthority: invocation.delegation.grantedAuthority,
          expectedEvidence: invocation.delegation.expectedEvidence,
          returnContract: invocation.delegation.returnContract,
        },
      },
      evidence: [],
    });

    try {
      const turnOptions: TurnOptions = {
        outputSchema: invocation.outputSchema,
        ...(invocation.signal === undefined
          ? {}
          : { signal: invocation.signal }),
      };
      const turn = await thread.run(
        prompt,
        turnOptions,
      );
      const threadId = thread.id;
      if (threadId === null) {
        throw new Error("Codex completed without assigning a thread ID");
      }

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
        renderedPromptBytes: Buffer.byteLength(prompt, "utf8"),
        usage: turn.usage,
      };
    } catch (error) {
      await this.ledger.append({
        objectiveId: invocation.objective.objectiveId,
        type: "codex.failed",
        loop: "codex-invocation",
        actor: invocation.role.identity,
        ...(thread.id === null ? {} : { threadId: thread.id }),
        state: {
          objectiveId: invocation.objective.objectiveId,
          errorType: error instanceof Error ? error.name : "UnknownFailure",
        },
        evidence: [],
      });
      throw error;
    }
  }

  private resolveThread(
    role: CodexRole,
    objective: WorkflowObjective,
    resumeThreadId?: string,
  ): WorkflowThread {
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
      if (resumeThreadId !== undefined) {
        throw new Error("A fresh thread policy cannot resume a durable thread.");
      }
      return this.#codex.startThread(role.thread);
    }

    this.#activeObjectiveByRole.set(role.identity, objective.objectiveId);

    const key = threadKey(role.identity, objective.objectiveId);
    const existing = this.#threads.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const durableResumeThreadId =
      resumeThreadId ??
      (role.resume?.objectiveId === objective.objectiveId
        ? role.resume.threadId
        : undefined);
    const thread =
      durableResumeThreadId !== undefined && !this.#consumedResumeKeys.has(key)
        ? this.resumeThreadId(role, key, durableResumeThreadId)
        : this.#codex.startThread(role.thread);

    this.#threads.set(key, thread);
    return thread;
  }

  private resumeThreadId(
    role: CodexRole,
    key: string,
    threadId: string,
  ): WorkflowThread {
    if (threadId.trim().length === 0) {
      throw new Error("Durable resume thread ID cannot be empty.");
    }
    this.#consumedResumeKeys.add(key);
    return this.#codex.resumeThread(threadId, role.thread);
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

  private assertDelegation(role: CodexRole, delegation: Delegation): void {
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
