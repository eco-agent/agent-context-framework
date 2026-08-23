import type { ThreadOptions, Usage } from "@openai/codex-sdk";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type Authority =
  | "read"
  | "propose"
  | "write"
  | "verify"
  | "release";

export interface Evidence {
  readonly kind: string;
  readonly summary: string;
  readonly references: readonly string[];
  readonly data?: JsonValue;
}

export interface Holon {
  readonly identity: string;
  readonly role: string;
  readonly scope: readonly string[];
  readonly capabilities: readonly string[];
  readonly authority: readonly Authority[];
  readonly supraHolon?: string;
}

export interface CodexRole extends Holon {
  readonly thread: ThreadOptions;
}

export interface Delegation {
  readonly from: string;
  readonly to: string;
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly context: JsonValue;
  readonly constraints: readonly string[];
  readonly grantedAuthority: readonly Authority[];
  readonly expectedEvidence: readonly string[];
  readonly returnContract: string;
}

export type Decision<T> =
  | {
      readonly kind: "accept";
      readonly artifact: T;
      readonly confidence: number;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "repair";
      readonly artifact: T;
      readonly feedback: readonly string[];
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly kind: "escalate";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export type LoopResult<T> =
  | {
      readonly status: "completed";
      readonly artifact: T;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly status: "escalated";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    }
  | {
      readonly status: "budget_exhausted";
      readonly issue: string;
      readonly evidence: readonly Evidence[];
    };

export type WorkflowEventType =
  | "loop.started"
  | "loop.transition"
  | "loop.completed"
  | "loop.escalated"
  | "loop.budget_exhausted"
  | "codex.started"
  | "codex.thread_bound"
  | "codex.completed"
  | "codex.failed"
  | "task.accepted"
  | "environment.intent"
  | "environment.applied"
  | "environment.failed";

export type LoopEventType = Extract<
  WorkflowEventType,
  `loop.${string}` | `environment.${string}`
>;

export interface WorkflowEvent {
  readonly sequence: number;
  readonly runId: string;
  readonly at: string;
  readonly type: WorkflowEventType;
  readonly loop: string;
  readonly actor?: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly attempt?: number;
  readonly state: JsonValue;
  readonly evidence: readonly Evidence[];
  readonly usage?: Usage;
}

export type NewWorkflowEvent = Omit<
  WorkflowEvent,
  "at" | "runId" | "sequence"
>;

export type NewLoopEvent = Omit<
  NewWorkflowEvent,
  "attempt" | "taskId" | "threadId" | "type" | "usage"
> & {
  readonly type: LoopEventType;
};

export interface LoopEventRecorder {
  readonly runId: string;
  append(event: NewLoopEvent): Promise<unknown>;
}

export interface EvidenceLedger extends LoopEventRecorder {
  readonly runId: string;
  append(event: NewWorkflowEvent): Promise<WorkflowEvent>;
  list(): Promise<readonly WorkflowEvent[]>;
}

export interface LoopContext {
  readonly ledger: LoopEventRecorder;
}

export function assertConfidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Confidence must be between 0 and 1; received ${value}`);
  }
  return value;
}

export function assertPositiveSafeInteger(
  value: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer; received ${value}`);
  }
  return value;
}

export function assertNonNegativeSafeInteger(
  value: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer; received ${value}`);
  }
  return value;
}

export function toJson(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Value is not JSON serializable");
  }
  return decodeJsonValue(JSON.parse(serialized) as unknown);
}

export function decodeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeJsonValue(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeJsonValue(item)]),
    );
  }
  throw new Error("Value is not valid JSON");
}
