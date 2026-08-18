import type { Authority, CodexRole } from "./contracts.js";
import { decodeObjectiveId, type ObjectiveId } from "@agent-context/repo-policy";

export type LoopKind =
  | "relay-chain"
  | "membrane-routing"
  | "reviewer-repair"
  | "autonomous-environment"
  | "scope-reconciliation"
  | "subsidiarity-escalation"
  | "shared-artifact-convergence"
  | "authority-ladder";

export interface PlannedTask {
  readonly objectiveId: ObjectiveId;
  readonly id: string;
  readonly roleId: string;
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly grantedAuthority: readonly Authority[];
  readonly dependencies: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly maxAttempts: number;
}

export interface WorkflowPlan {
  readonly objectiveId: ObjectiveId;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly primaryRoleId: string;
  readonly loop: LoopKind;
  readonly roles: readonly CodexRole[];
  readonly tasks: readonly PlannedTask[];
}

export interface ValidatedWorkflowPlan extends WorkflowPlan {
  readonly topologicalOrder: readonly string[];
}

export function validateWorkflowPlan(plan: WorkflowPlan): ValidatedWorkflowPlan {
  decodeObjectiveId(plan.objectiveId);
  if (plan.objective.trim().length === 0) {
    throw new Error("Workflow objective is required");
  }
  if (plan.acceptanceCriteria.length === 0) {
    throw new Error("Workflow acceptance criteria are required");
  }

  const roles = uniqueMap(plan.roles, (role) => role.identity, "role");
  const tasks = uniqueMap(plan.tasks, (task) => task.id, "task");
  if (!roles.has(plan.primaryRoleId)) {
    throw new Error(`Primary role ${plan.primaryRoleId} is not registered`);
  }
  if (!plan.tasks.some((task) => task.roleId === plan.primaryRoleId)) {
    throw new Error("The primary role must own at least one planned task");
  }

  for (const task of plan.tasks) {
    if (task.objectiveId !== plan.objectiveId) {
      throw new Error(`Task ${task.id} belongs to a different objective`);
    }
    const role = roles.get(task.roleId);
    if (role === undefined) {
      throw new Error(`Task ${task.id} uses unknown role ${task.roleId}`);
    }
    if (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1) {
      throw new Error(`Task ${task.id} must have a positive attempt budget`);
    }
    if (task.acceptanceCriteria.length === 0) {
      throw new Error(`Task ${task.id} has no acceptance criteria`);
    }
    if (task.expectedEvidence.length === 0) {
      throw new Error(`Task ${task.id} has no evidence contract`);
    }

    const heldAuthority = new Set(role.authority);
    const excess = task.grantedAuthority.filter(
      (authority) => !heldAuthority.has(authority),
    );
    if (excess.length > 0) {
      throw new Error(
        `Task ${task.id} exceeds ${role.identity} authority: ${excess.join(", ")}`,
      );
    }

    for (const dependency of task.dependencies) {
      if (!tasks.has(dependency)) {
        throw new Error(`Task ${task.id} has unknown dependency ${dependency}`);
      }
      if (dependency === task.id) {
        throw new Error(`Task ${task.id} depends on itself`);
      }
    }
  }

  const indegree = new Map(
    plan.tasks.map((task) => [task.id, task.dependencies.length]),
  );
  const dependents = new Map<string, string[]>();
  for (const task of plan.tasks) {
    for (const dependency of task.dependencies) {
      const existing = dependents.get(dependency) ?? [];
      existing.push(task.id);
      dependents.set(dependency, existing);
    }
  }

  const ready = plan.tasks
    .filter((task) => task.dependencies.length === 0)
    .map((task) => task.id)
    .sort();
  const topologicalOrder: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) {
      break;
    }
    topologicalOrder.push(current);

    for (const dependent of dependents.get(current) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  if (topologicalOrder.length !== plan.tasks.length) {
    throw new Error("Workflow task graph contains a cycle");
  }

  return { ...plan, topologicalOrder };
}

function uniqueMap<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) {
      throw new Error(`Duplicate ${label} ID: ${id}`);
    }
    result.set(id, value);
  }
  return result;
}
