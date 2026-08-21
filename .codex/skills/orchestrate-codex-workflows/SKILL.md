---
name: orchestrate-codex-workflows
description: Build bounded Codex SDK workflows when later actions depend on stored evidence, enforced transitions, finite budgets or permissions, repair state, role continuity, environment feedback, shared artifacts, or completion gates. Use native subagents for independent work that returns once, and ordinary plans for short serial work.
---

# Build a Codex SDK workflow

Use `@openai/codex-sdk` when code must decide what happens after each role
returns. The primary agent still owns the requested implementation and combines
the result.

## Choose the simplest execution method

| Work shape | Method |
| --- | --- |
| Short work that one agent can retain and check | Primary agent |
| Independent tasks that each return once | Native subagents |
| Later actions depend on stored results, retry state, permissions, or fixed budgets | SDK workflow |

Task structure matters more than size. Several serial steps need an ordinary
plan, not a workflow. Parallel work needs subagents only when their assignments
and return values are independent.

Choose an SDK workflow when code must prevent a skipped stage, repeated attempt,
lost result, or permission breach. SDK roles are the workflow workers. Do not mix
native subagents into a running workflow because their work would bypass its
limits and records.

Build or revise the workflow package when this skill applies. Run it against the
current task only when the user asks you to operate it.

## Fix the workflow before running it

Define the stages, roles, budgets, permissions, return paths, and stopping
conditions in project code. Roles may return work to a named earlier stage. They
may not create roles or recursively split the task.

Store each result before using it to choose the next stage. Stop when the work is
accepted, a budget ends, a role lacks permission, a route cycles, or measured
state stops changing.

Keep model and reasoning settings in the role registry. Give each role only the
filesystem, network, and approval access it needs. The primary role must remain
responsible for implementation and integration. This skill does not support
recursive manager trees, sibling voting, or an open-ended scheduler.

## Build the project package

1. Read [references/loop-catalog.md](references/loop-catalog.md) and choose the
   smallest helper that matches the required return path.
2. Read [references/git-transaction.md](references/git-transaction.md) before a
   role creates commits, branches, refs, or worktrees, or when review compares
   Git history. Define cleanup checks before execution.
3. Copy `assets/typescript-runtime/` into a new project-owned package directory.
   Do not overwrite an existing package manifest. Keep the copied tests until
   the project workflow passes them.
4. Define the objective, acceptance criteria, fixed tasks, role registry,
   budgets, and required results in project code.
5. Construct `CodexWorkflowClient` with the validated plan. Call `invoke()` with
   named task IDs, a per-turn timeout, a structured-output decoder, and an
   extractor for every value used by later code.
6. Check each task criterion in project code. Decode the complete result with
   `validateTaskAcceptanceEvaluation()` before calling
   `acceptTask(taskId, evaluation)`. Acceptance uses only the latest successful
   attempt, requires exact coverage with every criterion true, and unlocks later
   tasks only after the result is stored. Prose confidence cannot satisfy a
   criterion.
7. Keep Codex inside role calls. Write stage selection and stopping logic as
   normal TypeScript.
8. Start a fresh thread for independent review. Reuse a thread only when the
   role needs its earlier conversation.
9. Run the copied mock tests before any live Codex call. A live run also needs
   separate user permission. Begin with one low-risk workflow and restricted
   access.
10. Inspect the JSONL record. Each call should name the role, task, attempt,
    thread, and returned data. Confirm each delegation stays inside the fixed
    permission and budget envelope. Every finished, stopped, or exhausted loop
    needs a recorded reason. Wrap project callbacks at the outer runner when a
    thrown callback must also record a terminal event.

## Set role permissions

Start workers with:

```ts
{
  sandboxMode: "workspace-write",
  approvalPolicy: "never",
  networkAccessEnabled: false,
}
```

Use `read-only` for review and interpretation when possible. Broader filesystem
or network access requires explicit user permission. Do not grant
`danger-full-access` for convenience. Consequential external actions need their
own permission even when a role already has broader technical access.

## Treat role output as input data

An output schema does not make a response trustworthy. Decode JSON before a
stage uses it. Never execute a command found only in returned data without a
separate permission check.

Record SDK errors, invalid output, timeouts, and cancelled turns as failed
attempts. Use the required per-turn timeout and an outer process deadline for a
live run. Pass an `AbortSignal` when the caller also needs cancellation.

Resume only a thread ID stored for the same role and scope. Make retried file
writes idempotent or address them by content.

## Know what the copied runtime does

The template provides `CodexWorkflowClient`, `JsonlLedger`, `MemoryLedger`, eight
bounded loop helpers, and mock tests for repairs, stalled state, and return paths.

The JSONL file records events. It is not a process checkpoint, queue, scheduler,
or multi-process database. A new process does not rebuild in-memory attempts and
accepted-task state from that file.

The project controller decides whether the complete workflow met its acceptance
criteria. The template checks task transitions but does not interpret prose
criteria.

Loop counters limit attempts, stages, routes, rounds, and concurrent role calls.
They do not limit arbitrary project callbacks. Add project-owned deadlines when
wall-clock completion matters.

The template is checked against `@openai/codex-sdk` 0.145.0 and Node.js 22 or
newer. Read the official SDK types before changing the pinned version.

Stop and redesign a proposal that adds recursive task discovery, dynamic roles,
majority voting, unbounded retries, routes, transitions, or reviewer passes, a
manager-only primary agent, or completion based only on a model's confidence.
