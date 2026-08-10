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

## Protected framework baseline

- Treat this framework-managed section as maintainer-owned policy. Do not edit,
  remove, override, or weaken it from project work. Framework policy changes
  originate in canonical registry sources and require maintainer review.
- Project instructions and contracts may add repository-specific detail or
  stricter requirements. When they conflict with this protected baseline, retain
  the baseline and report the conflict.

## Project contracts

- Before implementation, read every exact path declared in a configured
  `.agent-context/policy.json` under `repository.projectContracts`.
- If a declared contract is missing, or repository policy is unconfigured, report
  that state before relying on project architecture or documentation assumptions.

## Verification

- For code changes, run the narrowest applicable type and behavior checks before
  handoff. Read-only review, explanation, and status work do not authorize tests.
- Browser control, computer control, and broad or repository-wide checks require
  an explicit request or a declared final-acceptance contract.
- Report skipped checks and unverified behavior.
