# Work record: <task>

## Outcome

Describe the completed state this task must make true.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
|  |  |  |

## State

- Record the authoritative baseline, branch, relevant external state, and known gaps.

## Topology

Describe the owners and flow affected by the task.

## Slice

1. Name the smallest complete slice that proves the outcome.
2. For staged frontend work, name the current design stage and its promotion
   gate. The slice becomes cross-layer when the work reaches product assembly.

## Replacements

- Name representations or paths this work replaces directly.

## Non-goals

- Name adjacent work that remains out of scope.

## Propagation

- Record every entry point, client, adapter, contract, reverse action, fixture, and verification surface that must follow the decision.

## Verification evidence

- Record commands, outputs, skipped checks, residual risks, and final revisions.

## Closure

| Field | Value |
| --- | --- |
| Status | `active`, `complete`, or `stopped` |
| Final revision | Full commit ID, or `uncommitted` while active |
| Durable destination | Canonical decision, handoff, or `this record` |
| Retention reason | Policy requirement or evidence that exists nowhere else |
| Cleanup | Temporary files, processes, branches, refs, and worktrees removed or reported |
