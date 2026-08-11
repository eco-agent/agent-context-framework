---
name: orchestrate-codex-workflows
description: Build or revise bounded, ledgered TypeScript orchestration around the OpenAI Codex SDK. Reach for this instead of native subagents when later actions need persisted evidence, deterministic transitions, enforced finite budgets or authority, measured repair loops, or role-bound thread continuity. Prefer native subagents for independent bounded work that the primary can integrate during one task, and use neither for short serial work. Use for long-horizon coding harnesses, explicit task decomposition, staged handoffs, environment feedback, scope escalation, shared artifacts, or progressive completion gates. Do not use for open-ended recursive agent spawning, adaptive hierarchies, quorum loops, or a complete durable scheduler.
---

# Orchestrate Codex Workflows

Build an external control plane around `@openai/codex-sdk`. Keep the primary agent responsible for implementation and integration. Use other Codex threads to add work or independent evidence, not to transfer task ownership.

## Select the execution mechanism

Choose before planning:

| Condition | Use |
| --- | --- |
| Work is short, serial, and reviewable in the current task | Primary agent only |
| Two or more independent, bounded slices can return once to the primary | Native subagents |
| Later actions depend on persisted evidence, enforced transitions, repair state, authority gates, or finite budgets | SDK workflow |

Use task structure, not task size, as the deciding signal.

- Do not create subagents only because a task is large. Use them when parallel work has independent scopes and explicit return contracts.
- Do not create a workflow only because a task has several steps. Use an ordinary plan when the primary can retain and verify the state directly.
- Choose a workflow when a missed transition, lost observation, repeated attempt, or authority breach must be prevented by code rather than remembered by the model.
- Keep native subagents outside workflow execution. SDK roles are the workflow workers; mixing unledgered subagents into the run bypasses its budgets and evidence contracts.
- Build or revise the harness when this skill triggers during a coding task. Do not run the harness as a hidden method for completing the current task unless the user asks to operate it.

If uncertain, start with the primary agent. Add native subagents for independent throughput. Move to a workflow only when transition or evidence enforcement becomes a requirement.

## Non-negotiable boundaries

- Exclude adaptive orchestrator holarchies and sibling quorum loops.
- Fix the workflow topology, role registry, budgets, and authority before execution.
- Permit bounded returns to earlier stages. Do not let agents invent new agents or recursively decompose work.
- Persist evidence before each state transition.
- Stop on acceptance, budget exhaustion, authority breach, cycle detection, or measured lack of progress.
- Keep model and reasoning choices in the role registry. Do not let a worker select its own model or effort.
- Give each role the least filesystem, network, and approval authority it needs.
- Keep the primary role active in implementation and integration.

## Build the workflow

1. Read [references/loop-catalog.md](references/loop-catalog.md) to select the smallest loop composition that fits the task.
2. Choose an explicit project-owned package directory. Copy `assets/typescript-runtime/` into that directory without overlaying an existing package manifest, and preserve its tests until the project-specific workflow passes.
3. Define the objective, acceptance criteria, static stages, role registry, budgets, and evidence contracts in project code.
4. Implement role calls with `CodexWorkflowClient.invoke()`. Use structured output and a runtime decoder for every control decision.
5. Compose loops around domain callbacks. Keep Codex prompts at the boundary; keep transition logic deterministic.
6. Use a fresh Codex thread for independent review. Reuse a thread only when conversational continuity is part of the role.
7. Run the mock tests before any live Codex execution. If the user separately authorizes a live run, start with one low-risk workflow under restricted authority.
8. Inspect the JSONL ledger. Verify role calls record their actor, thread, and evidence; delegations stay within the fixed envelope; and every loop has a terminal reason.

## Choose thread authority

Default workers to:

```ts
{
  sandboxMode: "workspace-write",
  approvalPolicy: "never",
  networkAccessEnabled: false,
}
```

Use `read-only` for interpretation and review when possible. Do not use `danger-full-access` as a convenience. Require explicit user authority for broader access or consequential external actions.

## Preserve control-plane integrity

- Treat structured output as untrusted input even when an output schema is supplied.
- Decode JSON before using it in a transition.
- Never execute a command supplied only as structured control data without a separate authority check.
- Record SDK errors, malformed output, timeouts, and aborted turns as failed attempts.
- Use an `AbortSignal` and an outer process deadline for live runs.
- Resume a thread only from a ledgered thread ID with the same role and scope.
- Make artifact writes idempotent or content-addressed before adding retry behavior.

## Use the bundled runtime

The template exports:

- `CodexWorkflowClient` for structured, role-bound SDK calls.
- `JsonlLedger` and `MemoryLedger` for single-process file-backed audit or test evidence.
- Eight bounded loops: relay chain, membrane routing, reviewer–repair, autonomous environment, static scope reconciliation, subsidiarity escalation, shared artifact convergence, and progressive authority ladder.
- Mock tests for repair, stagnation, and return-path behavior.

The JSONL ledger is an audit record, not a complete process checkpoint, queue, scheduler, multi-process database, or guarantee that an in-flight workflow can be restored after a crash.

The template is verified against `@openai/codex-sdk` 0.145.0. Review the official SDK types before changing the pinned SDK version.

## Reject accidental expansion

Stop and redesign if a proposal introduces:

- recursive task discovery;
- dynamic creation of roles;
- majority voting or consensus sampling;
- unbounded retries, routes, transitions, or reviewer passes;
- a manager-only primary agent;
- completion based on prose confidence without observable evidence.
