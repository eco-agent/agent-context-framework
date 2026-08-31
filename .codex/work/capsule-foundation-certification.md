# Capsule foundation certification

## Intended outcome

Certify revision `3a55b70e4a53478ba5c20a1d3bb291bcfe8aed7c` as the
capsule foundation deliverable. Prove the declared final-acceptance contract
once from a clean isolated worktree and report the real downstream Git shape.

## Baseline and ownership

- Baseline revision: `3a55b70e4a53478ba5c20a1d3bb291bcfe8aed7c`
- Branch: `codex/acf-capsule-foundation`
- Worktree: `D:/dev/agent-context-framework-capsule-foundation`
- Writer: primary Sol agent
- Durable fixture: `D:/dev/acf-fixture-runtime-capsule`
- Project contracts: none declared in `.agent-context/policy.json`

## Preservation map

| Classification | Behaviour | Owner |
| --- | --- | --- |
| Retained | Capsule v1, lock v3, verified migration, ignored materialization, packaged runtime, lock-v2 launch compatibility, branch-switch reconciliation, and semantic restart classification remain unchanged. | Existing implementation and tests at the baseline revision |
| Added | One recorded acceptance result and one review of the downstream Git shape. | This certification workstream |
| Changed | Nothing in the capsule implementation or runtime behaviour. | Not applicable |
| Removed | Nothing. | Not applicable |

## Acceptance boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Repository policy | Run the declared final-acceptance command once from a clean committed revision. | Command result, tested revision, and post-run Git status | Stop on failure and report the failing stage without repairing foundation scope in this branch. |
| Fixture review | Report tracked capsule, lock, activation, removals, ignored materialization, and unrelated dirty-state preservation from exact Git evidence. | Fixture commits, status, attributes, ignored files, and generator assertions | Report missing proof as an acceptance gap. Do not infer it from documentation. |
| Scope owner | Keep updater, one-command v2 migration, fleet management, and host launchers outside this branch. | Diff from the baseline contains certification evidence only. | Preserve the updater research at `d44cd444056c91211164e06a43829a24e7c8860b` for a later branch. |

## Current state

The isolated branch contains the safe completed foundation revision and
acceptance-only tests. The reviews found no updater implementation at this
revision, which is the intended boundary. They also found two missing direct
proofs: migration over unrelated dirty project files and rejection of a
symbolic-link skills directory. Both tests now pass without changing runtime
code. No broad verification has run in this workstream yet.

## Review findings

The durable runtime fixture starts from the bare application baseline
`b9cee5f525206f39339452cf8c54945f277cc471` and ends at migrated revision
`89da6216a12769067a68bab53f266f193c2d96d7`. That diff adds 16 paths and modifies
`AGENTS.md`. It is an initial installation diff, not an ACF-to-ACF update diff.
The capsule is 203,453 bytes and Git treats it as binary. The lock has 15 tracked
activation records and 35 ignored materialization records. No skill or runtime
path is tracked after migration.

Compression removes the expanded skill and runtime trees, but the remaining
initial-install review is still substantial. It contains 911 inserted text
lines, including a 309-line lock, the expanded instruction section, licences,
source records, and project configuration. The unfinished updater therefore
remains necessary before the program can prove the intended small routine-update
diff.

The branch-switch test simulates a committed capsule and lock change before
running bootstrap. It does not execute `git switch`. The fixture tests create
fresh repositories, but they do not execute `git clone`. Certification reports
those mechanisms accurately instead of treating the simulations as literal Git
operations.

Focused acceptance tests now prove that unrelated modified and untracked project
files survive v2 migration. They also prove that a symbolic-link skills
directory blocks before the receipt or generated files are written.

## Topology

1. Read-only reviews establish the exact claims and available evidence.
2. The primary resolves contradictions and records any gap.
3. The primary commits this acceptance record.
4. A clean committed revision runs the repository final-acceptance command once.
5. Documentation-only closure records the result without repeating executable
   gates.

## Smallest complete slice

The slice ends when the repository acceptance gate has one result tied to an
exact clean revision and the downstream fixture diff has an evidence-backed
review. It does not include new runtime behaviour.

## Replacements

None. This workstream certifies the existing foundation.

## Non-goals

- Repairing or extending the experimental updater.
- One-command migration from an ordinary lock-v2 project.
- Fleet management or central multi-project configuration.
- An optional host launcher.

## Propagation paths

- Repository policy to the named final-acceptance command.
- Capsule implementation tests to the generated runtime fixture.
- Fixture commits and ignored materialization to the downstream Git review.
- The tested revision and command result to the final certification report.

## Closure

Status, tested revision, command result, downstream Git evidence, skipped checks,
and final revision will be recorded after the acceptance run.
