# Git transaction

Use Git history as the durable record of a bounded workflow. `main` is the
deployment branch. `development` is the human-owned integration branch and
the branch the user runs locally.

## GitHub connector path

When the GitHub connector can write to the repository, read and follow
[`github-workstreams`](../../github-workstreams/SKILL.md). That skill owns
branch creation, Git-object commits, draft pull requests, CI inspection, and the
rule that the user's local checkout remains untouched.

Record the repository, exact `development` commit, remote
`codex/<task>` branch, known head commit, pull request number, and sole writer
in the workflow ledger. Store each new head and pull request identity before the
next stage uses it.

A branch update must be a non-forced fast-forward from the recorded head. A
write conflict means the branch changed outside this workflow. Stop the write,
inspect the new head, and reconcile it before creating another commit.

## Missing connector

If the task requires remote delivery and the GitHub connector or its write
authority is unavailable, report the missing capability. Do not modify the
user's local checkout, create a local branch, or create a worktree as a
substitute.

A workflow may use a local checkout only when the user explicitly asks for
local execution. One Sol writer then owns that checkout, branch, and index.
Never assign two writers to it. Do not create linked worktrees or use
`git stash`.

## Completion

A remote workflow completes with a committed branch tip, the required evidence,
and an open pull request targeting `development`. Agents never merge, deploy,
force-push, delete branches, close pull requests, or write directly to
`development` or `main`.
