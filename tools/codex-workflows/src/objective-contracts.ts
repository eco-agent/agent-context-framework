import type { Usage } from "@openai/codex-sdk";
import type {
  Delegation,
  Evidence,
  JsonValue,
  LoopContext,
  LoopEventType,
  NewLoopEvent,
} from "@agent-context/codex-workflow-runtime";
import type { ObjectiveId } from "@agent-context/repo-policy";

export interface ObjectiveDelegation extends Delegation {
  readonly objectiveId: ObjectiveId;
}

export type ObjectiveWorkflowEventType =
  | LoopEventType
  | "codex.started"
  | "codex.completed"
  | "codex.failed"
  | "context.completed"
  | "context.budget_exhausted";

export interface ObjectiveWorkflowEvent {
  readonly objectiveId: ObjectiveId;
  readonly sequence: number;
  readonly runId: string;
  readonly at: string;
  readonly type: ObjectiveWorkflowEventType;
  readonly loop: string;
  readonly actor?: string;
  readonly threadId?: string;
  readonly state: JsonValue;
  readonly evidence: readonly Evidence[];
  readonly usage?: Usage;
}

export type NewObjectiveWorkflowEvent = Omit<
  ObjectiveWorkflowEvent,
  "at" | "runId" | "sequence"
>;

export interface ObjectiveEvidenceLedger {
  readonly runId: string;
  append(event: NewObjectiveWorkflowEvent): Promise<ObjectiveWorkflowEvent>;
  list(): Promise<readonly ObjectiveWorkflowEvent[]>;
}

export function createObjectiveLoopContext(
  objectiveId: ObjectiveId,
  ledger: ObjectiveEvidenceLedger,
): LoopContext {
  return {
    ledger: {
      runId: ledger.runId,
      async append(event: NewLoopEvent): Promise<unknown> {
        return await ledger.append({ ...event, objectiveId });
      },
    },
  };
}
