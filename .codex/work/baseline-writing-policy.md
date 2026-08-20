# Work record: baseline writing policy

## Outcome

Every framework installation applies the adopted Unslop rules to all
agent-authored prose. The existing documentation rules keep their narrower job.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Policy placement | Put the rules in the protected `core` instruction source because every installed profile includes core. | `registry/sources/instructions/core.md` |
| Scope | Apply the rules to agent-authored prose in responses, plans, prompts, handoffs, records, reviews, commit messages, and documentation. Preserve exact text, code, quotations, protocol payloads, and machine-readable syntax. | Core communication policy |
| Rule text | Adopt the user-supplied Unslop body verbatim, apart from its skill frontmatter and top-level skill heading. | Upstream Unslop text |
| Documentation policy | Keep the documentation source focused on reporting completeness, disclosure, and review safety. Do not duplicate the Unslop rules there. | `registry/sources/instructions/documentation.md` |
| Provenance | Attribute `cursor/plugins` revision `fd6dd6f7276956a532bb78a748a8d2818b6eb5f4` under MIT and install its license notice with core. | Core component license metadata |

## State

- Baseline revision: `9ec1a562d92fa6376371ce0793e8f8ce5d4a6b6e` on `main`.
- Working branch: `codex/unslop-baseline`.
- Registry revision before this work: `0.8.0`.
- `.agent-context/policy.json` is absent, so project contracts and named
  verification profiles are unconfigured.

## Topology

`registry/sources/instructions/core.md` is the canonical text. The `core`
component installs it into `AGENTS.md`. The registry builder derives the frozen
registry, component revision, governance hash, and local projections.

## Slice

1. Change the core source, declare and install the upstream notice, rebuild the
   registry, and confirm that the generated core component and root projection
   contain the same policy.

## Replacements

- Extend the existing communication rules with a scoped baseline plus the full
  Unslop editing loop and pattern list.
- Do not create a second auto-invoked skill or duplicate the rules in the
  documentation component.

## Non-goals

- Do not change ASD English or the technical-prose checker.
- Do not make code, exact quotations, copied source text, protocol payloads, or
  machine-readable data conform to prose preferences.
- Do not add a model-judged writing test.

## Propagation

- Canonical core instruction source.
- Core component license metadata and installed notice.
- Installed core `SOURCE.json` attribution.
- Registry revision and decision record.
- Generated registry, governance checksum, core component, and root `AGENTS.md`.
- Focused registry and agent-context checks.

## Verification evidence

- `pnpm --silent registry:build` built registry `0.8.1` with 30 components.
- `pnpm --silent registry:check` passed.
- `pnpm --silent check:agents` passed.
- A direct ordinal comparison confirmed that the canonical Unslop text matches
  the user attachment exactly after removing the two added heading levels.
- A second direct comparison confirmed that root `AGENTS.md` contains the same
  Unslop text as the canonical core source.
- `git diff --check` passed.
- `check-technical-prose` reported 12 findings in the core source. Eleven point
  to quoted examples or contractions in the verbatim upstream text. One points
  to the pre-existing top-level quote. The decision and this work record had no
  findings. The adopted examples remain unchanged because they teach the rules
  and exact preservation is part of this decision.
- No browser, broad workspace, downstream fixture, or acceptance check ran. This
  change has no executable code and repository policy is unconfigured.
