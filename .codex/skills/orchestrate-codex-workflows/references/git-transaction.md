# Git transaction

Use this reference when a durable workflow creates Git state or compares Git
history. A branch owns a logical work stream. A linked worktree is an optional,
disposable checkout used for concurrent writers or isolated checks.

## Transaction record

Create one run ID before touching Git. Persist these fields before the first role
starts:

| Field | Meaning |
| --- | --- |
| repository | Canonical absolute repository path and common Git directory |
| run | Stable run ID used in refs and ledger events |
| baseline | Full commit ID resolved once from the approved starting revision |
| target | Full integration-target commit ID observed for the current preflight |
| branch | One `codex/<task>` branch that owns the work stream |
| worktree | Absolute path or `null` when the current checkout is used |
| stage refs | Expected object ID for every private stage ref |
| sparse paths | Exact cone-mode directories or `null` |

Do not use a branch name as durable evidence after resolving it. Branches move.
Persist full object IDs in the ledger even when a private ref points to the same
commit.

## Capture and materialize

1. Refuse to start from an unapproved dirty checkout. Preserve unrelated user
   state and report it. Do not stash it.
2. Resolve the approved baseline with `git rev-parse --verify
   <revision>^{commit}`. Record the full object ID before another Git action.
   Fetch only when the workflow has explicit network authority.
3. Create the task branch from that object ID. Fail if the intended branch name
   already exists with a different tip.
4. Reuse the current checkout for serial work. For concurrent work, create one
   linked worktree for the task branch and record its canonical absolute path.
   Never use `--force` to bypass an existing checkout or worktree registration.
5. Give one mutable branch and index to one active writer at a time. A read-only
   reviewer may inspect commits without owning the task worktree. A reviewer with
   repair authority takes the inactive task checkout or creates a review branch
   from the implemented commit.

A worktree path is execution state, not a resume token. Resume from the ledgered
branch and commits. Recreate a missing checkout only after Git confirms the old
worktree registration and path state.

## Protect stage commits

Use this private namespace:

```text
refs/agent-context/runs/<run-id>/baseline
refs/agent-context/runs/<run-id>/implemented
refs/agent-context/runs/<run-id>/reviewed
refs/agent-context/runs/<run-id>/accepted
refs/agent-context/runs/<run-id>/pre-finalize
```

Refs under `refs/` are shared by linked worktrees. Create, advance, and delete
them with `git update-ref`, using the expected old object ID for every change.
Use an `update-ref --stdin` transaction when a transition changes more than one
ref. Add a reason and a reflog when the host keeps ref-level audit evidence.

Private refs keep commits reachable. They do not replace the ledger. A clone,
fresh checkout, or cleanup can omit them, while the ledger still records the
stage identities and transition evidence.

## Checkpoint implementation

- Stage only task-owned paths. Inspect the staged diff before each commit.
- Commit coherent progress and use an explicit checkpoint commit when dirty
  task-owned state must survive a pause. Never use `git stash`.
- Keep mechanical transformations separate from semantic changes. Add a
  mechanical commit to `.git-blame-ignore-revs` only through a repository-owned
  decision after that commit becomes permanent.
- Do not amend, rebase, reset, or autosquash a branch while another role can read
  or write it.
- After implementation checks pass, atomically create or advance the
  `implemented` ref to the recorded task tip and persist the same object ID.

## Review the series

Run independent review from the immutable baseline and implemented tip. Review
uses ordinary diffs and tests as canonical evidence.

When the reviewer has repair authority, record corrections as fixup commits with
`git commit --fixup=<original-commit>`. Keep them visible during review. Point the
`reviewed` ref at the repaired tip.

Use this human review view:

```text
git range-diff <baseline> <implemented> <reviewed>
```

`range-diff` pairs corresponding patches, but its output is human-readable and
not stable enough for a machine contract. Persist the three input object IDs.
Base acceptance on repository checks and explicit review findings.

An authorized finalizer may autosquash after acceptance when no other role uses
the branch. First point `pre-finalize` at the reviewed series. Record the new tip,
rerun required checks, compare the old and rewritten series, then point
`accepted` at the proven result. History rewriting is a finalization action, not
a reviewer side effect.

## Preflight integration

Resolve and record the current integration-target tip. Then run:

```text
git merge-tree --write-tree --quiet <target-tip> <accepted-tip>
```

Exit status `0` means the three-way merge is clean. Status `1` means it conflicts.
Any other status is an execution error. Do not parse human conflict messages as
a stable contract. If the target tip moves, the preflight result is stale. Resolve
the new tip and run the preflight and required integration checks again.

`merge-tree` proves only that Git can construct the merge tree. It does not prove
tests, product behavior, review acceptance, or authority to merge.

## Handle conflicts

Treat `rerere` and `zdiff3` as repository policy, not framework defaults. Do not
change global Git configuration. A project may enable `rerere` for repeated
conflicts and keep `rerere.autoupdate` disabled so a person or reviewing role
still stages the resolution. A reused resolution remains untrusted until its
diff and applicable checks pass.

If a conflict needs a new role, use a fixed conflict-repair stage with explicit
path and history authority. Record the target tip, accepted tip, conflict paths,
resolution commit, and checks. Do not let a conflict role rewrite unrelated
history or discover new work streams.

## Use sparse checkout cautiously

Sparse checkout is an optional materialization optimization for very large
repositories. Record the cone-mode directories in the transaction. It does not
limit Git object access, repository search, role authority, or task scope. Full
repository review and acceptance remain authoritative.

Enabling sparse checkout can upgrade the repository to worktree-specific config
and can affect compatibility with older Git or external tools. Require an
explicit project decision and capability check before enabling it. Do not infer
that absent paths do not exist.

## Close the transaction

Cleanup is a checked transition. Persist terminal evidence before deleting any
Git state.

1. Stop every role that can access the branch or worktree.
2. Record the baseline, implemented, reviewed, pre-finalize, accepted,
   integration-target, and integrated object IDs that exist.
3. Confirm the exact registered worktree path, expected branch, expected `HEAD`,
   and clean tracked and untracked status.
4. Remove an owned linked worktree with `git worktree remove <absolute-path>`.
   Never use `--force` and never delete the directory directly.
5. Run `git worktree prune --dry-run` only when stale registrations exist. Run
   `prune` only if every reported entry belongs to this run. Otherwise report the
   unrelated entries and leave them intact.
6. Delete private refs through one `update-ref --stdin` transaction with their
   expected old object IDs.
7. Delete the task or review branch with safe deletion only after Git confirms
   its accepted commit is integrated or another retained ref owns it. Never
   force-delete an unintegrated branch.

If any identity, path, cleanliness check, or reachability proof differs from the
ledger, stop cleanup. Leave the branch, refs, and worktree recoverable. Report the
exact mismatch and required human decision.
