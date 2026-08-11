import {
  Codex,
  type CodexOptions,
  type Thread,
  type TurnOptions,
} from "@openai/codex-sdk";

import type {
  CodexRole,
  Delegation,
  EvidenceLedger,
  JsonValue,
} from "./contracts.js";
import { toJson } from "./contracts.js";

export interface StructuredInvocation<T> {
  readonly role: CodexRole;
  readonly delegation: Delegation;
  readonly input: JsonValue;
  readonly outputSchema: JsonValue;
  readonly decode: (value: unknown) => T;
  readonly freshThread?: boolean;
  readonly signal?: AbortSignal;
}

export interface StructuredInvocationResult<T> {
  readonly value: T;
  readonly threadId: string;
}

export class CodexWorkflowClient {
  readonly #codex: Codex;
  readonly #threads = new Map<string, Thread>();

  public constructor(
    private readonly ledger: EvidenceLedger,
    options?: CodexOptions,
  ) {
    this.#codex = new Codex(options);
  }

  public async invoke<T>(
    invocation: StructuredInvocation<T>,
  ): Promise<StructuredInvocationResult<T>> {
    this.assertDelegation(invocation.role, invocation.delegation);

    const thread = this.resolveThread(invocation.role, invocation.freshThread);

    await this.ledger.append({
      type: "codex.started",
      loop: "codex-invocation",
      actor: invocation.role.identity,
      state: {
        delegation: toJson(invocation.delegation),
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
        this.renderPrompt(invocation),
        turnOptions,
      );
      const threadId = thread.id;
      if (threadId === null) {
        throw new Error("Codex completed without assigning a thread ID");
      }

      const parsed = JSON.parse(turn.finalResponse) as unknown;
      const value = invocation.decode(parsed);

      await this.ledger.append({
        type: "codex.completed",
        loop: "codex-invocation",
        actor: invocation.role.identity,
        threadId,
        state: {
          output: toJson(value),
        },
        evidence: [],
        ...(turn.usage === null ? {} : { usage: turn.usage }),
      });

      return { value, threadId };
    } catch (error) {
      await this.ledger.append({
        type: "codex.failed",
        loop: "codex-invocation",
        actor: invocation.role.identity,
        ...(thread.id === null ? {} : { threadId: thread.id }),
        state: {
          error: error instanceof Error ? error.message : String(error),
        },
        evidence: [],
      });
      throw error;
    }
  }

  private resolveThread(role: CodexRole, freshThread = false): Thread {
    if (!freshThread) {
      const existing = this.#threads.get(role.identity);
      if (existing !== undefined) {
        return existing;
      }
    }

    const thread =
      !freshThread && role.resumeThreadId !== undefined
        ? this.#codex.resumeThread(role.resumeThreadId, role.thread)
        : this.#codex.startThread(role.thread);

    if (!freshThread) {
      this.#threads.set(role.identity, thread);
    }
    return thread;
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

  private renderPrompt<T>(invocation: StructuredInvocation<T>): string {
    return [
      `You are the ${invocation.role.role} role (${invocation.role.identity}).`,
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
