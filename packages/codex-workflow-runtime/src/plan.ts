import type { Authority, CodexRole } from "./contracts.js";
import { assertPositiveSafeInteger } from "./contracts.js";

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
  readonly id: string;
  readonly roleId: string;
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly grantedAuthority: readonly Authority[];
  readonly dependencies: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly maxAttempts: number;
}

export interface WorkflowPlan {
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly primaryRoleId: string;
  readonly loop: LoopKind;
  readonly roles: readonly CodexRole[];
  readonly tasks: readonly PlannedTask[];
}

const validatedWorkflowPlanBrand: unique symbol = Symbol(
  "ValidatedWorkflowPlan",
);

export interface ValidatedWorkflowPlan extends WorkflowPlan {
  readonly topologicalOrder: readonly string[];
  readonly [validatedWorkflowPlanBrand]: true;
}

export function validateWorkflowPlan(plan: WorkflowPlan): ValidatedWorkflowPlan {
  if (plan.objective.trim().length === 0) {
    throw new Error("Workflow objective is required");
  }
  if (plan.acceptanceCriteria.length === 0) {
    throw new Error("Workflow acceptance criteria are required");
  }
  assertNonEmptyUniqueStrings(
    plan.acceptanceCriteria,
    "Workflow acceptance criteria",
  );

  const roleList = validateRoleRegistry(plan.roles);
  const roles = uniqueMap(roleList, (role) => role.identity, "role");
  const taskList = Object.freeze(plan.tasks.map((task) => snapshotTask(task)));
  const tasks = uniqueMap(taskList, (task) => task.id, "task");
  if (plan.primaryRoleId.trim().length === 0) {
    throw new Error("Primary role ID is required");
  }
  if (!roles.has(plan.primaryRoleId)) {
    throw new Error(`Primary role ${plan.primaryRoleId} is not registered`);
  }
  if (!taskList.some((task) => task.roleId === plan.primaryRoleId)) {
    throw new Error("The primary role must own at least one planned task");
  }

  for (const task of taskList) {
    const role = roles.get(task.roleId);
    if (role === undefined) {
      throw new Error(`Task ${task.id} uses unknown role ${task.roleId}`);
    }
    assertPositiveSafeInteger(task.maxAttempts, `Task ${task.id} maxAttempts`);
    if (task.purpose.trim().length === 0) {
      throw new Error(`Task ${task.id} requires a purpose`);
    }
    assertNonEmptyUniqueStrings(task.scope, `Task ${task.id} scope`);
    assertNonEmptyUniqueStrings(
      task.requiredCapabilities,
      `Task ${task.id} required capabilities`,
    );
    assertUniqueValues(
      task.grantedAuthority,
      `Task ${task.id} granted authority`,
    );
    assertUniqueValues(task.dependencies, `Task ${task.id} dependencies`);
    if (task.acceptanceCriteria.length === 0) {
      throw new Error(`Task ${task.id} has no acceptance criteria`);
    }
    assertNonEmptyUniqueStrings(
      task.acceptanceCriteria,
      `Task ${task.id} acceptance criteria`,
    );
    if (task.expectedEvidence.length === 0) {
      throw new Error(`Task ${task.id} has no evidence contract`);
    }
    assertNonEmptyUniqueStrings(
      task.expectedEvidence,
      `Task ${task.id} expected evidence`,
    );

    const heldAuthority = new Set(role.authority);
    const excessAuthority = task.grantedAuthority.filter(
      (authority) => !heldAuthority.has(authority),
    );
    if (excessAuthority.length > 0) {
      throw new Error(
        `Task ${task.id} exceeds ${role.identity} authority: ${excessAuthority.join(", ")}`,
      );
    }
    const heldScope = new Set(role.scope);
    const excessScope = task.scope.filter((scope) => !heldScope.has(scope));
    if (excessScope.length > 0) {
      throw new Error(
        `Task ${task.id} exceeds ${role.identity} scope: ${excessScope.join(", ")}`,
      );
    }
    const heldCapabilities = new Set(role.capabilities);
    const excessCapabilities = task.requiredCapabilities.filter(
      (capability) => !heldCapabilities.has(capability),
    );
    if (excessCapabilities.length > 0) {
      throw new Error(
        `Task ${task.id} exceeds ${role.identity} capabilities: ${excessCapabilities.join(", ")}`,
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
    taskList.map((task) => [task.id, task.dependencies.length]),
  );
  const dependents = new Map<string, string[]>();
  for (const task of taskList) {
    for (const dependency of task.dependencies) {
      const existing = dependents.get(dependency) ?? [];
      existing.push(task.id);
      dependents.set(dependency, existing);
    }
  }

  const ready = taskList
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

  if (topologicalOrder.length !== taskList.length) {
    throw new Error("Workflow task graph contains a cycle");
  }

  const validated: ValidatedWorkflowPlan = {
    [validatedWorkflowPlanBrand]: true,
    objective: plan.objective,
    acceptanceCriteria: Object.freeze([...plan.acceptanceCriteria]),
    primaryRoleId: plan.primaryRoleId,
    loop: plan.loop,
    roles: roleList,
    tasks: taskList,
    topologicalOrder: Object.freeze(topologicalOrder),
  };
  return Object.freeze(validated);
}

export function assertValidatedWorkflowPlan(
  value: unknown,
): asserts value is ValidatedWorkflowPlan {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Record<PropertyKey, unknown>)[validatedWorkflowPlanBrand] !== true ||
    !Object.isFrozen(value)
  ) {
    throw new Error("Codex workflow client requires a validated workflow plan");
  }
}

export function validateRoleRegistry(
  input: readonly CodexRole[],
): readonly CodexRole[] {
  const roleList = Object.freeze(input.map((role) => snapshotCodexRole(role)));
  const roles = uniqueMap(roleList, (role) => role.identity, "role");
  for (const role of roleList) {
    validateCodexRole(role);
    if (role.supraHolon !== undefined) {
      if (!roles.has(role.supraHolon)) {
        throw new Error(
          `Role ${role.identity} references unknown supra-holon ${role.supraHolon}`,
        );
      }
      if (role.supraHolon === role.identity) {
        throw new Error(`Role ${role.identity} cannot supervise itself`);
      }
    }
  }
  assertAcyclicRoleHierarchy(roleList, roles);
  return roleList;
}

export function validateCodexRole(role: CodexRole): CodexRole {
  if (role.identity.trim().length === 0) {
    throw new Error("Role identity is required");
  }
  if (role.role.trim().length === 0) {
    throw new Error(`Role ${role.identity} requires a role description`);
  }
  assertNonEmptyUniqueStrings(role.scope, `Role ${role.identity} scope`);
  assertNonEmptyUniqueStrings(
    role.capabilities,
    `Role ${role.identity} capabilities`,
  );
  assertUniqueValues(role.authority, `Role ${role.identity} authority`);
  if (!role.authority.includes("read")) {
    throw new Error(`Role ${role.identity} requires explicit read authority`);
  }

  const thread = role.thread;
  if (thread.model?.trim().length === 0 || thread.model === undefined) {
    throw new Error(`Role ${role.identity} requires an explicit thread model`);
  }
  if (thread.modelReasoningEffort === undefined) {
    throw new Error(
      `Role ${role.identity} requires an explicit model reasoning effort`,
    );
  }
  if (thread.sandboxMode === undefined) {
    throw new Error(`Role ${role.identity} requires an explicit sandbox mode`);
  }
  if (thread.approvalPolicy === undefined) {
    throw new Error(`Role ${role.identity} requires an explicit approval policy`);
  }
  if (thread.networkAccessEnabled === undefined) {
    throw new Error(`Role ${role.identity} requires an explicit network policy`);
  }
  if (
    thread.workingDirectory === undefined ||
    thread.workingDirectory.trim().length === 0
  ) {
    throw new Error(`Role ${role.identity} requires an explicit working directory`);
  }

  const authority = new Set(role.authority);
  if (thread.sandboxMode === "workspace-write" && !authority.has("write")) {
    throw new Error(
      `Role ${role.identity} needs write authority for workspace-write sandbox`,
    );
  }
  if (thread.sandboxMode === "danger-full-access") {
    throw new Error(
      `Role ${role.identity} cannot use danger-full-access without a consumer-owned authority contract`,
    );
  }
  const usesNetwork =
    thread.networkAccessEnabled ||
    thread.webSearchEnabled === true ||
    (thread.webSearchMode !== undefined && thread.webSearchMode !== "disabled");
  if (usesNetwork && !role.capabilities.includes("network")) {
    throw new Error(
      `Role ${role.identity} needs the network capability for network access`,
    );
  }
  return role;
}

function assertAcyclicRoleHierarchy(
  roleList: readonly CodexRole[],
  roles: ReadonlyMap<string, CodexRole>,
): void {
  for (const role of roleList) {
    const visited = new Set<string>();
    let current: CodexRole | undefined = role;
    while (current?.supraHolon !== undefined) {
      if (visited.has(current.identity)) {
        throw new Error(`Role hierarchy contains a cycle at ${current.identity}`);
      }
      visited.add(current.identity);
      current = roles.get(current.supraHolon);
    }
  }
}

function snapshotCodexRole(role: CodexRole): CodexRole {
  const additionalDirectories = role.thread.additionalDirectories === undefined
    ? undefined
    : [...role.thread.additionalDirectories];
  if (additionalDirectories !== undefined) {
    Object.freeze(additionalDirectories);
  }
  const thread = {
    ...role.thread,
    ...(additionalDirectories === undefined ? {} : { additionalDirectories }),
  };
  Object.freeze(thread);
  const snapshot: CodexRole = {
    identity: role.identity,
    role: role.role,
    scope: Object.freeze([...role.scope]),
    capabilities: Object.freeze([...role.capabilities]),
    authority: Object.freeze([...role.authority]),
    ...(role.supraHolon === undefined ? {} : { supraHolon: role.supraHolon }),
    thread,
  };
  return Object.freeze(snapshot);
}

function snapshotTask(task: PlannedTask): PlannedTask {
  return Object.freeze({
    id: task.id,
    roleId: task.roleId,
    purpose: task.purpose,
    scope: Object.freeze([...task.scope]),
    requiredCapabilities: Object.freeze([...task.requiredCapabilities]),
    grantedAuthority: Object.freeze([...task.grantedAuthority]),
    dependencies: Object.freeze([...task.dependencies]),
    acceptanceCriteria: Object.freeze([...task.acceptanceCriteria]),
    expectedEvidence: Object.freeze([...task.expectedEvidence]),
    maxAttempts: task.maxAttempts,
  });
}

function uniqueMap<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (id.trim().length === 0) {
      throw new Error(`${label[0]?.toUpperCase() ?? "I"}${label.slice(1)} ID is required`);
    }
    if (result.has(id)) {
      throw new Error(`Duplicate ${label} ID: ${id}`);
    }
    result.set(id, value);
  }
  return result;
}

function assertNonEmptyUniqueStrings(
  values: readonly string[],
  label: string,
): void {
  if (values.length === 0 || values.some((value) => value.trim().length === 0)) {
    throw new Error(`${label} requires non-empty values`);
  }
  assertUniqueValues(values, label);
}

function assertUniqueValues<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}
