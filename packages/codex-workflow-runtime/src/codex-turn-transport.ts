import {
  Codex,
  type CodexOptions,
  type ThreadOptions,
  type TurnOptions,
  type Usage,
} from "@openai/codex-sdk";

import { assertPositiveSafeInteger } from "./contracts.js";

export const MAX_TURN_TIMEOUT_MS = 2_147_483_647;

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

export interface CodexTurnRunOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface CodexTurnResult {
  readonly finalResponse: string;
  readonly threadId: string;
  readonly usage: Usage | null;
}

export function validateCodexTurnRunOptions(
  options: CodexTurnRunOptions,
): void {
  if (options.timeoutMs === undefined) {
    return;
  }
  assertPositiveSafeInteger(options.timeoutMs, "Codex turn timeoutMs");
  if (options.timeoutMs > MAX_TURN_TIMEOUT_MS) {
    throw new Error(
      `Codex turn timeoutMs must not exceed ${MAX_TURN_TIMEOUT_MS}`,
    );
  }
}

export class CodexTurnTransport {
  readonly #codex: WorkflowCodex;

  public constructor(options?: CodexOptions, codex?: WorkflowCodex) {
    this.#codex = codex ?? new Codex({
      ...options,
      env: isolatedCodexEnvironment(process.env, options?.env),
    });
  }

  public startThread(options: ThreadOptions): WorkflowThread {
    return this.#codex.startThread(options);
  }

  public resumeThread(
    threadId: string,
    options: ThreadOptions,
  ): WorkflowThread {
    if (threadId.trim().length === 0) {
      throw new Error("Resume thread ID cannot be empty");
    }
    return this.#codex.resumeThread(threadId, options);
  }

  public async run(
    thread: WorkflowThread,
    input: string,
    outputSchema: unknown,
    options: CodexTurnRunOptions = {},
  ): Promise<CodexTurnResult> {
    const signal = turnSignal(options);
    const turn = await thread.run(input, {
      outputSchema,
      ...(signal === undefined ? {} : { signal }),
    });
    const threadId = thread.id;
    if (threadId === null || threadId.trim().length === 0) {
      throw new Error("Codex completed without assigning a non-empty thread ID");
    }
    return {
      finalResponse: turn.finalResponse,
      threadId,
      usage: turn.usage,
    };
  }
}

const desktopContextVariables = new Set([
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
  "CODEX_PERMISSION_PROFILE",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
]);

export function isolatedCodexEnvironment(
  inheritedEnvironment: Readonly<Record<string, string | undefined>>,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(inheritedEnvironment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const env = { ...inherited, ...overrides };
  for (const name of desktopContextVariables) delete env[name];
  return env;
}

function turnSignal(options: CodexTurnRunOptions): AbortSignal | undefined {
  validateCodexTurnRunOptions(options);
  if (options.timeoutMs === undefined) {
    return options.signal;
  }
  const timeout = AbortSignal.timeout(options.timeoutMs);
  return options.signal === undefined
    ? timeout
    : AbortSignal.any([timeout, options.signal]);
}
