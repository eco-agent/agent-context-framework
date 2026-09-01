# Windows transaction promotion

## Intended outcome

Make a context transaction tolerate the short Windows destination-file lock
that stopped final acceptance, without hiding persistent permission failures,
target drift, or symbolic-link changes.

## Baseline

- Framework revision: `c609eef0cc81ceeab2d8573f2b84e2fae96a5c54`
- Branch: `codex/windows-transaction-promotion`
- Repository policy is configured and declares no project contracts.
- The installed work-record template is missing, so this record uses the
  required repository headings directly.

## Current state

Three independent test runs have failed at the staged-write rename with Windows
`EPERM`, then passed unchanged on another run. A small local probe reproduced
the same `EPERM` by holding the destination file open during `rename`.

The transaction publishes its journal before target promotion. A failed target
rename therefore leaves the staged bytes and journal available for recovery.
The code currently propagates the first rename error even when the staged and
target hashes still match the recorded pending state.

## Competing causes

| Rank | Cause | Prediction | Evidence |
| --- | --- | --- | --- |
| 1 | A short Windows handle lock blocks replacement of an existing target. | Holding the destination open produces `EPERM`; releasing it lets the same rename succeed. | The local probe reproduced the acceptance error code and syscall. |
| 2 | The transaction keeps its own file handle open. | Source inspection would find an unclosed handle on the target or staged file. | The path uses awaited `readFile`, `lstat`, and `realpath` calls. No retained handle exists. |
| 3 | Target or staged content drifts during promotion. | Hash or path revalidation changes before retry. | Existing checks fail closed on drift and symbolic links. The acceptance failures occurred in fresh temporary fixtures. |
| 4 | The rename completed despite returning an error. | The target has the after hash and the staged file is gone. | The retry boundary must inspect this state and treat it as success instead of issuing another rename. |

## Boundary decision

| Decision | Answer | Owner |
| --- | --- | --- |
| Eligible failure | Retry only Windows `EPERM` from the staged-write rename. Other errors propagate unchanged. | Context transaction |
| Safety check | Before every retry, require the staged after hash and target before hash. If the target has the after hash and staging is gone, treat the promotion as complete. Any other state fails closed. | Context transaction |
| Retry schedule | Use three retries with Node's established 100 ms linear delay, for waits of 100, 200, and 300 ms. The 600 ms per-target ceiling contains a persistent lock while giving a short external handle time to close. | Context transaction |
| Recovery | Exhaustion preserves the published journal and staged bytes. Doctor and transaction recovery retain ownership of later repair. | Context transaction |
| Reporting | The final thrown error names the target and the exhausted Windows retry window, with the last `EPERM` as its cause. No intermediate layer logs the same failure. | Context transaction |

## Topology

1. Add a focused Windows integration test that holds an existing target open
   through the first rename and releases it inside the bounded retry window.
2. Add the retry at the staged-write promotion owner, with state and path
   revalidation before every attempt.
3. Exercise transient recovery, persistent failure, target drift, symbolic-link
   rejection, and interrupted transaction recovery.
4. Run dev-tooling typecheck and the full serial suite.
5. Commit a clean framework revision, confirm the durable fixture is still
   clean, then run final acceptance once from those revisions.

## Smallest complete slice

The slice is complete when a real Windows-held destination recovers after the
handle closes, a lock held beyond the retry window fails with recoverable
transaction state, existing security checks still pass, and final acceptance
passes once from clean committed revisions.

## Replacements

The staged-write rename remains the only promotion mechanism. This change adds
bounded recovery to that owner. It does not add a second transaction path.

## Non-goals

- Retrying journal publication, deletion, cleanup, or unrelated filesystem
  operations without evidence.
- Hiding persistent access-control failures.
- Changing transaction journal or lock schemas.
- Fleet management.

## Propagation paths

- Staged-write rename to transaction recovery state.
- Retry exhaustion to installer and acceptance failure reporting.
- Transaction behavior to generated fixtures and downstream capsule launch.

## Preservation map

| Classification | Behavior |
| --- | --- |
| Retained | The journal publishes before target promotion, staging has one exclusive owner, every promotion revalidates path and content hashes, drift fails closed, and interrupted work remains recoverable. |
| Changed | A staged write no longer fails on the first Windows rename `EPERM` when its journaled state is still pending. It gets the bounded retry window recorded above. |
| Added | Real-handle tests observe transient recovery and persistent-lock exhaustion. The generated plain-Node bootstrap carries the same behavior into migrated capsules. |
| Removed | None. The component graph, schemas, security checks, reporting owner, and recovery command stay unchanged. |

The canonical owner is `tools/dev-tooling/src/context-transaction.ts`. The
bootstrap bundle is its generated runtime projection. Registry revision
`0.14.2`, its decision record, and registry data observe the changed bytes. A
persistent lock follows the existing grace path: keep the published journal and
staging, report one terminal error, then let doctor and recovery resume it after
the lock clears.

## Closure

Status: in progress.

Focused verification passed before the implementation checkpoint:

- The original real-handle test failed with Windows rename `EPERM` before the
  repair and passed after it.
- The transient and persistent lock cases passed with recovery state intact.
- The two formerly flaky integration files passed five consecutive iterations,
  for 45 passing tests.
- Dev-tooling typecheck passed.
- The combined transaction, capsule bootstrap, repository-context, and policy
  set passed all 19 tests in 181,192 ms.
- Bootstrap build, registry build, registry check, bundle reproducibility, and
  changed-file prose checks passed at registry revision `0.14.2`.

The implementation checkpoint is
`421510892b721b67570fffaeeabc7bc630f32adc`. The full serial dev-tooling suite
passed all 148 tests, with no failures or skips, in 501,786 ms.

The marked durable fixture was regenerated from that checkpoint and committed
at `3ad8a24c676745c0ebb57a7437e2168fd998da24`. It selects `codex-runtime` and
`repository-policy`, has no expanded `.agent-context/runtime/package.json`, and
remains clean after the installed Codex runtime verifier and repository-policy
full profile pass directly.

Final acceptance has not run for this workstream yet. It remains gated on
committing this evidence and confirming both repositories are clean.
