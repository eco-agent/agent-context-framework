# Rewrite agent prose hotspots

## Outcome

Reduce the ACF policy voice in skill discovery and selected skill instructions.
Give model-facing prose its own deterministic check instead of applying the ASD
technical-document check to prompts and skills.

## Decisions

- Preserve skill behavior, invocation boundaries, permissions, and completion
  conditions.
- Shorten every ACF skill description. Keep detailed routing in the skill body.
- Rewrite the six previously identified high-density skills: orchestration,
  TypeScript invariants, frontend design discipline, session optimization,
  diagnosis, and established-product adoption.
- Extend the existing repository policy command structure for agent-prose checks.

## State and topology

- Canonical skills live under `.codex/skills`.
- Protected sources and generated registry hashes live under `registry`.
- Policy commands live under `tools/repo-policy`.

## Slice

Skill catalog metadata, six skill entrypoints, the orchestration loop reference,
skill-authoring policy, agent-prose diagnostics, command wiring, and focused tests.

## Replacements

The agent-prose check replaces technical-prose guidance for model-facing text.
The ASD check remains available for repositories that configure it for technical
documentation.

## Non-goals

No template rewrite, work-record policy change, compaction hook change, or broad
rewrite of every skill reference in this pass.

## Propagation

Rebuild the registry after protected skill and instruction changes. Update the
checked-in framework projection and command documentation where the existing
policy command list owns it.

## Verification

- All 17 ACF skill folders pass the skill validator.
- The selected skill entrypoints, loop reference, and prose-routing instructions
  pass `check-agent-prose`.
- The repository policy package passes all 32 tests.
- Registry 0.8.4 builds and passes its consistency check.
- The protected `AGENTS.md` check passes.
