# Work record: converge Codex workflow runtimes

## Outcome

Converge the bounded workflow behavior shared by `tools/codex-workflows` and
the distributable TypeScript runtime without importing Objective durability into
the skill component. One canonical package will own shared contracts, plan
validation, loops, and Codex thread transport. The internal tool and the
standalone asset will retain their distinct controllers and persistence
guarantees.

## Git transaction

| Field | Value |
| --- | --- |
| Run | `20260823-converge-codex-workflows` |
| Repository | `D:/dev/agent-context-framework` |
| Common Git directory | `D:/dev/agent-context-framework/.git` |
| Baseline | `6fc6cc335f32cd6afb5d917c3636a346e004302e` |
| Branch | `codex/converge-codex-workflows` |
| Worktree | Current checkout |
| Integration target | `6fc6cc335f32cd6afb5d917c3636a346e004302e` |

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Shared behavior | A new workspace package owns contracts with identical local-workflow meaning. | Shared runtime package |
| Durable behavior | Objective identity, leases, checkpoints, task envelopes, repository context, and durable budgets remain internal. | `tools/codex-workflows` |
| Portable behavior | The standalone plan controller and fail-closed audit ledger remain distributable. | Skill runtime asset |
| Projection | A deterministic repository operation copies canonical shared source into the standalone asset and a check rejects drift. | Registry governance and dev tooling |
| Codex controllers | Keep plan-bound and Objective-bound controllers separate. Share only thread start, resume, timeout, structured output, and usage transport. | Shared transport plus each controller |
| Persistence | Keep the portable audit ledger and internal Objective ledger separate because they promise different recovery and durability behavior. | Each runtime boundary |
| Reviewer limits | Preserve separate review-pass and repair limits while adopting the portable evidence ordering and boundary validation. | Shared reviewer-repair loop |

## Preservation map

| Behavior | Classification | Final owner | Observation | Grace path |
| --- | --- | --- | --- | --- |
| Fixed immutable local plan | Retained and moved | Shared runtime | Plan tests and projection check | Reject invalid plans before construction |
| Positive safe-integer loop budgets | Retained and moved | Shared runtime | Loop boundary tests | Reject the call without starting work |
| Evidence before transitions and effects | Retained and moved | Shared runtime | Loop ordering tests | Keep prior state and report failure |
| Separate review and repair budgets | Retained and strengthened | Shared runtime | Reviewer-repair budget tests | Return budget exhaustion before another repair |
| Plan attempts, dependencies, acceptance, and role binding | Retained | Portable controller | Portable controller tests | Reject the invocation or acceptance transition |
| Objective envelopes, budgets, checkpoints, and resume | Retained | Internal Objective controller | Internal runner and envelope tests | Stop before model execution or terminalize through the Objective store |
| Portable malformed-history rejection | Retained | Portable audit ledger | Portable ledger tests | Report corrupt audit history |
| Internal interrupted-tail recovery and synchronized writes | Retained | Internal ledger | Internal ledger tests | Recover only the incomplete final record or fail the write |
| Repository context and product precedent | Retained | Internal tool | Existing focused tests | Return the established bounded or verification failure |
| Hand-maintained duplicate shared files | Removed after replacement | None | Projection check and deleted duplicate imports | Regenerate the portable projection or import the canonical package |
| Deterministic standalone projection | Added | Dev tooling and registry governance | Drift test, governed hashes, generated registry check | Regenerate, review the diff, and rerun the check |
| Objective continuation authority | Retained and strengthened | Internal Objective controller | Versioned continuation tests and role-envelope mismatch tests | Reject stale or widened continuations before thread mutation |
| Post-turn budget accounting | Added | Internal Objective runner | Malformed structured-output retry test | Checkpoint prompt, context, token usage, and the returned thread before retry |
| Environment effect identity | Retained and strengthened | Objective loop adapter | Distinct Objective loop namespace test | Include Objective ID in the idempotency namespace |
| Projection path safety | Added | Dev tooling | Redirected ancestor and case-only overlap tests | Refuse projection before any outside file changes |

## Current state

- Repository policy is configured and declares no project contract paths.
- Both runtimes pin `@openai/codex-sdk` `0.145.0`.
- The portable runtime has the stricter generic plan, controller, ledger, and
  loop contracts.
- The internal tool has the Objective-specific execution, persistence, context,
  and product integration behavior.
- The internal plan validator has no production caller.
- Objective continuations now encode their schema, Objective ID, thread ID, and
  exact role and Objective envelope digest. The client rejects conflicting,
  stale, widened, and concurrent reuse.
- Post-turn parsing, decoding, ledger-state, and completion-write failures carry
  the returned thread and usage into a durable Objective checkpoint.
- Registry projection writes reject redirected ancestors and path overlap. The
  governance manifest requires every canonical projected file to have protected
  source and target coverage.

## Topology

```text
canonical shared runtime
  -> internal Objective-aware tool
  -> deterministic standalone source projection

internal Objective-aware tool
  -> objective kernel and runtime
  -> task envelope and repository context

standalone projection
  -> portable plan controller
  -> portable audit ledger
  -> copied mock tests and examples
```

## Smallest complete slice

1. Add and verify the canonical shared runtime package.
2. Replace duplicated internal plan and loop ownership with package imports.
3. Project the same source into the standalone asset and reject drift.
4. Separate the two controller names and share their SDK transport.
5. Update architectural, skill, registry, dependency, and governance owners.
6. Run the repository-declared workflow profile and final acceptance once from
   a clean committed revision.

## Replacements

- Replace internal copies of generic plan and loop modules with imports.
- Replace hand-maintained portable copies of shared modules with generated
  projections checked against the canonical package.
- Replace the ambiguous controller name with plan-bound and Objective-bound
  names.

## Non-goals

- No live Codex SDK workflow execution.
- No scheduler, queue, database, or Objective kernel enters the distributable
  component.
- No compatibility exports remain after callers move to the chosen names.
- No registry component becomes selected transitively.
- No deployment or push.

## Propagation paths

- Workspace package graph and TypeScript project references.
- Internal package imports, exports, tests, and examples.
- Skill runtime assets, instructions, type contract, tests, and license records.
- Registry component inventory, governed hashes, generated registry output, and
  installation tests.
- ADR package ownership and local-versus-global orchestration boundary.

## Closure

Status: implementation complete; final acceptance awaits the required explicit
downstream fixture path.

Focused verification passed:

- Canonical portable runtime, 33 tests.
- Internal Objective-aware runtime, 43 tests.
- Standalone copied runtime outside the workspace, 33 tests.
- Registry 0.10.0 build and read-only drift check.
- Direct agent-prose check for the changed orchestration skill instructions.
- Workflow verification profile.
- New projection safety tests passed in the full dev-tooling run. Two later
  failures exposed a stale continuation-token assertion and a host-runtime test
  race. Focused reruns for both repairs passed, 10 tests.

Final revision and verification evidence will be recorded after acceptance.
