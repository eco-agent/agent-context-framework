# Documentation

## Scope

These instructions apply to files under `docs/`.

- Treat these files as planning and architectural references for framework work.
- Do not claim that proposed components, commands, or integrations exist.
- Update affected decision, dependency, ownership, and implementation matrices together.
- Preserve links between architecture documents and superseded decisions.
- Resolve fuzzy or overloaded terms against the existing code and contracts.
- Create an ADR only for a hard-to-reverse, surprising decision with real alternatives.

## Commands

- For documentation-only changes, run only `pnpm verify:profile docs`. Do not also run task or branch verification.

## Constraints

- Documentation is planning authority, not implementation evidence.

## References

- [Documentation index](README.md)
- [Portable objective orchestration](architecture/portable-objective-orchestration.md)

<!-- agent-context:documentation:start -->

## Prose and reporting style

Write documentation and reports in plain English. Start with the outcome, then
give the reasons, tradeoffs, and evidence the reader needs. Short paragraphs and
small lists are easier to follow than dense shorthand, deeply nested bullets, or
one uninterrupted block of text.

Define an unfamiliar term when it first matters, and use a familiar word when it
is equally precise. Add an example when it makes an abstract point concrete.
Remove repetition and decorative prose.

Let the subject and reader determine the length and structure. Do not impose a
fixed limit on characters, words, paragraphs, or bullets. Never cut user-facing
prose to satisfy an internal convenience limit.

When they matter, disclose assumptions, uncertainty, unverified behavior,
failed or skipped checks, risks, regressions, and required follow-up work. Say
when an action is destructive or irreversible. Name the
files, interfaces, or behavior that changed.

Accuracy comes first. Next, include enough detail for safe review and
continuation, state verification clearly, stay relevant, and make the result easy
to read.
<!-- agent-context:documentation:end -->
