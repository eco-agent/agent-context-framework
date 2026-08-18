import type { ThreadOptions, Usage } from "@openai/codex-sdk";
import type { ObjectiveId } from "@agent-context/repo-policy";

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
  readonly resume?: {
    readonly threadId: string;
    readonly objectiveId: ObjectiveId;
  };
}

export interface Delegation {
  readonly objectiveId: ObjectiveId;
  readonly from: string;
  readonly to: string;
  readonly purpose: string;
  readonly scope: readonly string[];
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
  | "codex.completed"
  | "codex.failed"
  | "context.completed"
  | "context.budget_exhausted";

export interface WorkflowEvent {
  readonly objectiveId: ObjectiveId;
  readonly sequence: number;
  readonly runId: string;
  readonly at: string;
  readonly type: WorkflowEventType;
  readonly loop: string;
  readonly actor?: string;
  readonly threadId?: string;
  readonly state: JsonValue;
  readonly evidence: readonly Evidence[];
  readonly usage?: Usage;
}

export type NewWorkflowEvent = Omit<
  WorkflowEvent,
  "at" | "runId" | "sequence"
>;

export interface EvidenceLedger {
  readonly runId: string;
  append(event: NewWorkflowEvent): Promise<WorkflowEvent>;
  list(): Promise<readonly WorkflowEvent[]>;
}

export interface LoopContext {
  readonly objectiveId: ObjectiveId;
  readonly ledger: EvidenceLedger;
}

export function assertConfidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Confidence must be between 0 and 1; received ${value}`);
  }
  return value;
}

export function toJson(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Value is not JSON serializable");
  }
  return JSON.parse(serialized) as JsonValue;
}
