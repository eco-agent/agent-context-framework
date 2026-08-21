# Work record: framework maintainer skill

## Outcome

The repository has an automatically selected maintainer skill for changing ACF
instructions, skills, registry components, governance, and generated
configuration without weakening existing behavior or replacing checkable rules
with prose.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Skill name | `maintain-agent-context-framework` | Skill catalog |
| Invocation | Automatic when work changes ACF policy, registry, governance, skills, or generated instruction configuration | Skill frontmatter |
| Preservation | Treat every existing instruction as an active constraint until the user explicitly removes or supersedes it | Skill workflow |
| Interpretation | Convert subjective wording into one owner, one decision, named exceptions, and checkable completion evidence | Skill workflow |
| Bounds | Every behavioral rule needs an observation that shows whether the agent stayed inside it | Skill workflow |
| Grace path | Every stop condition names the allowed next action, fallback, escalation, or recorded omission | Skill workflow |
| Attention | Keep the live instruction set small, route conditional detail, and use checks or artifacts so the model need not remember every rule at once | Skill workflow |
| Prose and code | Use prose for judgment and intent. Use deterministic code for syntax, equality, reachability, limits, and mechanically observable invariants | Skill workflow |
| Packaging | Register the skill as an optional leaf component without adding it to a broad bundle | Registry source |
| Registry revision | Publish the new skill as registry `0.8.8` | Registry source |

## State

- Baseline: `d51f5994c8ef90810617e8ffe2739fb332ff5d1b`.
- Branch: `codex/framework-maintainer-skill`.
- Repository policy: `.agent-context/policy.json` is not configured.
- Unrelated user file: `.codex/work/headless-interface-evaluation-assistant-turns.md` remains untouched.
- The new branch is stacked on `codex/frontend-policy-repairs` so it retains the
  completed registry `0.8.7` changes.

## Topology

The skill entrypoint owns the decisions needed during every framework edit. A
short reference owns the prose-versus-code classification and examples. Registry
source packages the skill as an optional component. Context governance protects
its non-dilution, bounded-observation, grace-path, attention, and completion
requirements. Focused registry tests prove installation and trigger metadata.

## Slice

1. Create and validate the skill, register and govern it, rebuild registry
   `0.8.8`, then install it into an isolated fixture and verify the exact files
   and protected instructions.

## Replacements

- Replace ad hoc judgment about framework edits with one maintainer workflow.
- Replace vague skill descriptions with a catalog trigger that names applicable
  work.
- Replace prose-only enforcement where deterministic observation is possible.

## Non-goals

- Do not revise the frontend policy completed in registry `0.8.7`.
- Do not add the new skill to `core`, `engineering`, or `skill-authoring`.
- Do not add a script when existing governance and registry checks can enforce
  the result.
- Do not create a checklist for ordinary coding work outside ACF maintenance.

## Propagation

- Skill source and invocation metadata under
  `.codex/skills/maintain-agent-context-framework/`.
- `registry/registry.source.json`, generated `registry/registry.json`, context
  governance, registry tests, and a durable registry `0.8.8` decision.
- Agent prose and structural skill validation.

## Verification evidence

- Semantic preservation review: registry `0.8.7` instruction and skill sources
  are retained unchanged. Registry metadata, governance, and tests change only
  to add the new optional leaf and publish `0.8.8`. No behavior is removed.
- The `skill-creator` structural validator passed.
- Agent prose passed for the skill, enforcement reference, registry decision,
  and temporary work record.
- Registry `0.8.8` built and passed its deterministic check with 31 components.
- The isolated maintainer-skill installation test passed. It proves the leaf has
  no component dependencies, installs exact source files, keeps automatic
  invocation enabled, and retains four protected behavioral rules.
- The full context registry and governance suite passed all 24 tests.
- The dev-tooling TypeScript project passed typecheck.
- `git diff --check` passed.
- Browser review and broad acceptance were not run. The repository policy is
  unconfigured, and this task changes no rendered interface behavior.

## Closure

| Field | Value |
| --- | --- |
| Status | `active` |
| Final revision | `uncommitted` |
| Durable destination | `registry/decisions/0.8.8-framework-maintainer-skill.md` |
| Retention reason | Active task state only |
| Cleanup | No temporary worktree, process, or private ref created |
