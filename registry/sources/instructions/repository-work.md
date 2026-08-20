## Work

- Before substantial code write `.codex/work/<task>.md`: outcome, decisions, state, topology, slice, replacements, non-goals, propagation.
- Record one answer and owner per decision. Specialists stay scoped.
- Resolve and record one full baseline commit before a new work stream starts. Let one `codex/<task>` branch own that stream.
- Use the current checkout for serial work. Add an ephemeral linked worktree only for concurrent work or an isolated check. Record its branch and absolute path. Give one mutable branch and index to one active writer at a time.
- Store task-owned dirty state in checkpoint commits. Never use `git stash` and never capture unrelated user changes.
- Remove only a clean worktree created by the current run, through `git worktree remove`, after recording its tip. Never force removal or delete its directory directly. Run `git worktree prune` only when every reported stale entry belongs to the run.
- Complete one cross-layer slice and applicable loading, empty, error, populated, hover, focus-visible, active, and disabled states.
- Edit the owner. Consolidate and replace directly. Never add compatibility, migrations, deprecations, adapters, dual writes, fallbacks, or parallel representations unless requested.
- Git and previews provide recovery. Reduce, then propagate to entry points, clients, adapters, contracts, and reverse actions. Mark gaps.
- Use `git subtree` for repository-shaped vendored source with an upstream update lifecycle when it is available. Keep selected-file adoption as pinned, attributed copies. Avoid submodules unless a project contract requires a separate checkout and release lifecycle.
- Never change global Git configuration. Record and justify repository or worktree configuration changes.
- Limits must protect a measured model, transport, storage, or runtime boundary. Derive them from that boundary, report when they are reached, and never silently truncate mandatory context or user-facing explanation.
