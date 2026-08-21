## Work

Before substantial code, create `.codex/work/<task>.md`. Record the intended
outcome, decisions, current state, topology, smallest complete slice,
replacements, non-goals, and propagation paths. Give every decision one answer
and one owner, and keep specialists within their assigned scope.

Resolve the baseline to a full commit ID before starting a new work stream, then
record it. One `codex/<task>` branch owns that stream. Use the current checkout
for serial work. Create an ephemeral linked worktree only when concurrent work
or an isolated check needs another checkout. Record its branch and absolute
path, and give each mutable branch and index to one active writer at a time.

Checkpoint task-owned dirty state with commits. Never use `git stash`, and never
include unrelated user changes. A run may remove only a clean worktree that it
created, after recording the worktree tip. Remove it with `git worktree remove`.
Do not force removal or delete the directory directly. Run `git worktree prune`
only when every stale entry Git reports belongs to the current run.

Complete one cross-layer slice. Where the product has these states, include
loading, empty, error, populated, hover, focus-visible, active, and disabled
behavior.

Edit the owning representation, consolidate there, and replace obsolete paths
directly. Do not add compatibility layers, migrations, deprecations, adapters,
dual writes, fallbacks, or parallel representations unless the user asks for
them. Git and
previews provide recovery. After reducing the old representation, carry the
chosen one through entry points, clients, adapters, contracts, and reverse
actions. Record any gap you cannot close.

Prefer a package dependency when its public API is enough. Use `git subtree` for
repository-shaped vendored source with an upstream update lifecycle when the
host provides it. Record the upstream URL, commit, prefix, license, and update
procedure. If the host lacks subtree support, stop and report the missing
capability instead of inventing another vendoring method. A selected-file
adoption remains a pinned, attributed copy. Do not add or mutate a submodule
unless a project contract requires its separate repository lifecycle.

Never change global Git configuration. Record and justify any repository or
worktree configuration change.

Every limit must protect a measured model, transport, storage, or runtime
boundary. Derive the limit from that boundary and report when it is reached.
Never silently cut mandatory context or user-facing explanation.
