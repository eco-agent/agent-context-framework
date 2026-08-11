# Type contract: optional orchestration authoring runtime

## Outcome

The distributable TypeScript template accepts only a fixed workflow topology
with finite budgets, least-authority delegation, ledger-bound Codex thread
continuation, and evidence recorded before a state transition or external
effect. The JSONL ledger is an audit record. It is not advertised as a complete
process checkpoint or a multi-process database.

## Owner

`.codex/skills/orchestrate-codex-workflows/assets/typescript-runtime`

## Domain concepts

- **Workflow plan**: the complete, immutable role and task graph selected before
  execution. Runtime code may traverse this graph but may not create roles.
- **Budget**: a positive safe integer bounding attempts, rounds, hops, retries,
  or concurrent work. `NaN`, infinities, fractions, zero, and negative values
  are invalid.
- **Delegation**: a task request whose scope, capabilities, and authority are
  subsets of the target role's declared envelope.
- **Task acceptance**: a project-controller evaluation that covers every
  planned criterion with a true result. The client persists that declaration
  with the exact evidence from the latest successful attempt before it unlocks
  dependent tasks. Generic runtime code does not interpret prose criteria.
- **Thread binding**: persisted evidence that a Codex thread ID was created for
  one run, role identity, model, reasoning setting, scope, capabilities, and
  authority envelope. Only an exact binding may be resumed.
- **Evidence ledger**: an ordered, decoded sequence of workflow events. An
  append becomes visible in memory only after the backing write succeeds.
- **Environment intent**: a persisted request for an external effect, followed
  by either an applied or failed outcome using the same idempotency key.

## Valid states

- A plan has a non-empty objective and acceptance contract, unique roles and
  tasks, a registered primary role, an acyclic task graph, and no authority or
  scope expansion.
- Every scalar budget is a positive safe integer and every confidence value is
  finite and within `[0, 1]`.
- Every loaded ledger entry decodes as a workflow event for the requested run
  and has the next contiguous sequence number.
- A Codex continuation uses a thread binding already present in the same run's
  ledger and exactly matching the selected role envelope.
- A planned task starts only after its dependencies are accepted, stays within
  its attempt budget, and cannot start while its acceptance append is pending.
- A task becomes accepted only after a successful attempt, exact controller
  criterion coverage, and the planned evidence kinds are present.
- An environment action has a recorded intent before execution and one
  terminal applied or failed event afterward.

## Invalid states

- Runtime-created or recursively spawned roles, adaptive hierarchy, sibling
  quorum, and unbounded convergence.
- Unknown fields trusted through a TypeScript cast without runtime decoding.
- Arbitrary or cross-run thread IDs supplied as resume targets.
- Delegated authority, scope, or capabilities outside the target role.
- Caller-invented acceptance evidence, missing or false criterion results, and
  dependency advancement before the acceptance event is stored.
- An external action that begins before its intent is persisted.
- Claims that a JSONL evidence log alone can restore arbitrary in-flight
  workflow state after process failure.

## Allowed transitions

```text
validated plan -> loop.started -> bounded loop.transition*
               -> loop.completed | loop.escalated | loop.budget_exhausted

codex.started -> codex.failed
codex.started -> codex.thread_bound -> codex.completed -> task.accepted
                                      -> codex.failed

task.accepted(dependency) -> dependent codex.started

environment.intent -> environment.applied | environment.failed
```

Each transition is appended before the next state becomes current. A failed
append leaves the prior state current and stops the operation.

## Boundary decoding and failures

- Validate plan input before constructing a runner.
- Validate all loop budgets at the public function boundary.
- Parse and decode every JSONL line. Reject malformed, wrong-run, duplicate, or
  non-contiguous entries and event-specific missing task, attempt, actor, or
  thread metadata instead of silently truncating them.
- Treat Codex SDK output and structured control data as untrusted until decoded.
- Record terminal Codex and environment failures, then rethrow or return the
  loop's explicit escalated/budget-exhausted result.
- Keep the template single-process. Cross-process coordination, fsync-backed
  durability, workflow checkpoint restoration, queues, databases, schedulers,
  and objective kernels remain outside this component.

## Verification

- Mock tests reject non-finite and fractional budgets.
- Plan tests reject scope, capability, and authority expansion.
- Ledger tests reject malformed or discontinuous history and preserve in-memory
  state when a backing append fails. They also reject event metadata that does
  not match the event type.
- Codex-client tests reject an unbound or mismatched resume thread, conflicting
  returned thread IDs, task-contract expansion, acceptance races, incomplete
  dependencies, exhausted attempts, and incomplete acceptance declarations.
- Autonomous-loop tests prove intent precedes the external action and failure is
  recorded.
