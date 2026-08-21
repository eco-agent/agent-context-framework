# Work record: repair context controls

## Outcome

Restore the behavioral controls weakened during the prose rewrite, then make the canonical instructions, installed projections, prose checks, and work-record lifecycle enforce the same rules.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Repair order | Follow the five-part order accepted by the maintainer. | Primary agent |
| Skill semantics | Restore safety, permission, ownership, stopping, and completion guards. Keep prose concise without changing those controls. | Canonical skill source |
| Installed instruction integrity | Compare canonical sources with installed root instructions and role prompts deterministically. | Context governance |
| Git policy | Use the stronger core vendoring, provenance, and submodule rules in every projection. | Repository-work instruction source |
| Prose enforcement | Run the agent-prose check through the repository's normal changed-file verification path. | Repository policy |
| Work-record lifecycle | Close completed records explicitly and define when they remain, move, or may be removed. | Framework work policy |

## State

- Baseline: `4ff8042b18a2ec23ce1e457004b2bfcf407145e9`.
- Branch: `codex/rewrite-agent-prose`.
- Repository policy is unconfigured. No project contracts or named verification profiles are available.
- The unrelated untracked record `.codex/work/headless-interface-evaluation-assistant-turns.md` remains outside this task.

## Topology

Canonical registry sources produce installed root instructions and role prompts. Context governance protects those projections. Repository policy selects changed files and runs deterministic checks. Skills add task-specific constraints without broadening the authority granted by the root policy.

## Slice

1. Restore one weakened guard in its canonical skill source, propagate it to the installed skill, add a deterministic assertion where appropriate, and run the narrow owner check.

## Replacements

- Replace weakened skill wording with the prior behavioral requirements.
- Replace selected-phrase projection checks with whole-source comparisons for exact projections.
- Replace the advisory-only prose path with changed-file verification ownership.

## Non-goals

- Do not redesign the registry or verification architecture.
- Do not add external Git tools or change global Git configuration.
- Do not alter unrelated product or framework behavior.

## Propagation

- Canonical skill sources and installed `.codex/skills` copies.
- `registry/sources/instructions/core.md`, `repository-work.md`, root `AGENTS.md`, and context-governance configuration.
- Canonical and installed role prompts.
- Repository-policy check selection, tests, decisions, and work-record templates.

## Verification evidence

- Pending.
