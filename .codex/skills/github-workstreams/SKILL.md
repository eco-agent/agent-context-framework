---
name: github-workstreams
description: Manage non-trivial coding work through a GitHub connector without changing the user's local checkout.
---

# GitHub workstreams

Use GitHub as the agent's persistence and review layer. The user's local clone is
for local execution and stays under human control.

## Branch topology

- `main` is the deployment branch.
- `development` is the human-owned integration branch and normal local branch.
- One remote `codex/<task>` branch owns each agent work stream.
- Pull requests target `development`. Humans decide when `development` reaches
  `main`.

Use a branch to represent an incomplete feature or alternate product behavior.
Do not add a feature flag or environment variable only to make branch-specific
work visible. Secrets and real environment-specific addresses may still use
environment variables. Every branch should use the same documented run command.

## Protect the local checkout

While this skill is active, do not change local repository state. This includes
files, the index, refs, branches, worktrees, stashes, dependencies, build
outputs, processes, ports, and caches. Do not run local commands that can write
to the repository.

Read and write through the GitHub connector. If the connector lacks a required
read or write operation, report that missing capability. Do not fall back to
local mutation.

## Pin the work stream once

Before the first write, record:

```text
repository
development commit
work branch
known branch head
pull request number, once created
sole writer
```

Resolve `development` to a full commit ID. Create the work branch from that
commit. Retain the recorded identities after each successful operation. Search
again only after a conflict, an external update, a user request, or before an
operation whose stale input could discard work.

One writer owns the branch. Reviewers and evidence collectors remain read-only
or contribute through their own branches.

## Commit bounded slices with Git objects

For a multi-file slice:

1. Create one blob for each changed file.
2. Create a tree based on the known current tree. Preserve every untouched path
   and file mode.
3. Create one commit whose parent is the known branch head.
4. Move the branch ref with `force: false`.
5. Record the returned commit as the new known head.

Objects created before the ref update are harmless. The branch changes only at
the final step.

A non-fast-forward rejection means another actor changed the branch. Fetch the
new head and inspect the difference. Reconcile it in a new commit or ask the
branch owner to decide. Never force the ref through the conflict.

Use file-level create, update, or delete operations only for a genuinely
isolated one-file change.

## Open the draft pull request early

Open a draft pull request after the first coherent checkpoint. Keep one compact
contract in its body:

```text
Outcome
Baseline
Decisions
Bounded scope
Non-goals
Verification
Known limitations
```

Update the same branch and pull request as later slices land. Do not create
another pull request for the same work stream.

Use a stacked pull request only when a change truly depends on an unmerged
branch. Name that dependency in the child pull request. Otherwise branch from
the current `development` commit.

## Separate implementation from verification

Checkpoint each bounded conceptual change. Verification evidence applies only
to the exact commit it observed.

Use CI as independent terminal verification, not as an interactive development
loop. Inspect in this order:

```text
commit
workflow run
failed run
failed job
failed step or log
```

Do not poll a running workflow. Report its identity and continue independent
work, or stop with the running state recorded. After a run reaches a terminal
state, do not request it again unless a rerun or new commit creates a new run.

Classify a failure before changing code:

- caused by this change;
- pre-existing on `development`;
- caused by a stacked dependency;
- environment or infrastructure;
- unrelated repository failure;
- unknown.

A missing local runtime does not turn CI into a remote REPL. Report whether the
candidate was checked structurally, against existing tests or contracts, by CI,
or remains unexecuted.

## Review through the pull request

After the pull request exists, prefer its diff, changed files, review threads,
and exact head commit over another repository-wide search.

Never merge, deploy, force-push, delete a branch, close a pull request, or write
to `development` or `main`. Leave the branch and pull request available for
human review.

## Completion

Finish only when the pull request identifies its exact baseline and head,
contains the requested bounded change, reports verification against that head,
and names every known limitation. If a required connector operation or
authority is missing, leave the last safe remote state intact and report the
blocked operation.
