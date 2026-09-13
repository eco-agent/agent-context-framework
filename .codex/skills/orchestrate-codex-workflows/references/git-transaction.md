# Git transaction

Use Git history as the durable record of a bounded workflow. `development` is
the human-owned integration branch. Each agent work stream uses one
`codex/<task>` branch and one checkout.

## Ownership

Record these values before mutation:

| Field | Required value |
| --- | --- |
| baseline | Full commit ID resolved from `development` |
| branch | One `codex/<task>` branch |
| checkout | Canonical absolute path used by the writer |
| writer | One Sol role with write authority |

A remote branch isolates Git history. It does not isolate files in a shared
checkout. Never assign two writers to the same checkout, even when they use
different branches. Read-only scouts may inspect the checkout while the writer
works.

Do not create linked worktrees. If another write stream needs to run at the same
time, it needs a separately provisioned checkout outside this workflow. Stop
when no separate checkout is available.

## Start

1. Fetch the remote when network access is available.
2. Resolve `development` or `origin/development` to a full commit ID.
3. Confirm the checkout has no unrelated state that the workflow would overwrite.
4. Create `codex/<task>` at that exact commit.
5. Record the branch, baseline, checkout, and writer in the workflow ledger.

Do not use `git stash`. Do not amend, reset, rebase, or force-push a branch while
another role may be reading it.

## Checkpoints and recovery

Commit task-owned changes at logical checkpoints. A commit is the normal resume
point. Do not create `.codex/work/<task>.md`.

If an interrupted filesystem transaction cannot resume from Git alone, write
the smallest recovery record that identifies the transaction and its verified
boundary below ignored `.codex/acf/state/`. Delete it after recovery. Do not put
analysis, progress narration, copied context, or durable decisions there.

Stop on any of these conditions:

- the recorded baseline no longer identifies the intended work;
- the checkout contains unrelated changes that overlap the task;
- another writer owns the checkout;
- a checkpoint cannot be created without including unrelated files;
- recovery evidence disagrees with Git or the filesystem.

## Delivery

1. Run the required verification on a committed, clean checkout.
2. Push only the current `codex/<task>` branch.
3. Open or update a pull request targeting `development`.
4. Report the exact task-branch tip, verification result, and pull-request URL.

Agents never merge the pull request and never commit directly to `development`.
Humans own review, integration, and merge. If push or pull-request access is
missing, preserve the local task branch and report the exact missing capability.
Do not substitute `main`, another base branch, a patch file, or a local merge.

## Cleanup

Remove only ignored recovery state created by the completed workflow. Keep the
task branch and pull request available for human review. Do not delete remote
branches, integration branches, or another workflow's state.
