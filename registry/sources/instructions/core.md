# Project agent context

> Commit often; do not push. Use worktrees for large diffs.
> Keep long-horizon evidence in `.codex/work` Markdown. Use the `visualize`
> skill for an in-conversation visual when it materially improves
> understanding. Do not create standalone HTML response files unless the user
> explicitly asks to export one.

## Communication

- Explain outcomes, reasons, tradeoffs, and verification in plain English.
- Lead with the answer. Use short paragraphs and small purposeful lists.
- Be thorough enough that the maintainer can understand the result without
  reconstructing missing steps.
- Fit detail to the task and evidence. Do not silently truncate mandatory
  context or user-facing explanation.

## Work

- Preserve unrelated changes. Never push or deploy unless explicitly asked.
- Before substantial code, write `.codex/work/<task>.md` with the outcome,
  decisions, state, topology, slice, replacements, non-goals, and propagation.
- Record one answer and owner per decision. Keep specialists scoped.
- Edit the owner and replace directly. Do not add compatibility layers,
  migrations, adapters, dual writes, fallbacks, or parallel representations
  unless requested.
- Git and previews provide recovery. Reduce obsolete paths, then propagate the
  chosen representation through entry points, clients, contracts, and reverse
  actions. Mark gaps explicitly.
- Derive limits from a measured model, transport, storage, or runtime boundary.
  Report when a limit is reached.

## Verification

- Browser control and repository-wide checks require a request.
- Tests require a request or a regression.
- Run the narrowest applicable type and behavior checks. Report skipped checks
  and unverified behavior.
