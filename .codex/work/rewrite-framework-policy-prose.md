# Rewrite framework policy prose

## Outcome

The canonical framework instructions should state policy in ordinary language.
They must keep the same permissions, requirements, and stopping conditions
without teaching agents to copy compressed policy shorthand into their own text.

## Decisions

- Preserve the imported Unslop text exactly. Rewrite only ACF-authored policy.
- Keep every existing policy obligation and source owner.
- Group related rules where that makes the instruction easier to follow. Do not
  turn policy into a response template.
- Publish the change as registry 0.8.5 so installations can identify the new
  instruction text precisely.

## State and topology

- The baseline is commit `0ca2dd6` on `codex/rewrite-agent-prose`.
- Canonical instruction sources live under `registry/sources/instructions`.
- The registry builder projects those sources into `AGENTS.md`, `docs/AGENTS.md`,
  and the frozen registry.
- `.agent-context/policy.json` is absent, so project contracts and named
  verification profiles are unconfigured.

## Slice

Rewrite the ACF-authored instruction sources, rebuild their projections, and
check the resulting model-facing text with `check-agent-prose`.

## Replacements

Replace compressed bullets, sentence fragments, and overloaded rules in the
canonical policy sources. Keep the same files and projection paths.

## Non-goals

- Do not change the imported Unslop rules.
- Do not rewrite work-record, project-decision, or type-contract templates yet.
- Do not change hooks, compaction behavior, skill behavior, or runtime code.

## Propagation

- Canonical instruction sources and their protected hashes.
- Root and documentation instruction projections.
- Registry revision, decision record, component hashes, and frozen registry.

## Verification

- `check-agent-prose` passed for the 11 canonical instruction sources, both
  checked-in projections, this record, and the registry decision.
- Registry 0.8.5 built with 30 components and passed `registry:check`.
- All 37 repository-policy tests passed, including protected semantic phrases,
  preserved instruction blocks, and projection checks.
- An ordinal comparison confirmed that the imported Unslop section is unchanged
  from baseline commit `0ca2dd6`.
- `check:agents` and `git diff --check` passed.
- No browser, downstream fixture, or final acceptance run was available because
  repository policy is unconfigured and the change does not alter runtime
  behavior.
