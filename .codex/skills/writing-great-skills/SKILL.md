---
name: writing-great-skills
description: Write or revise Codex skills and their invocation metadata.
---

# Write useful skills

A skill should change how Codex decides or works. Remove instructions that only
repeat normal agent behavior, global policy, or facts the task already supplies.

## Choose how the skill is invoked

A model-invoked skill allows automatic selection. Its description must tell the
model when the skill applies and distinguish it from nearby skills.

A user-invoked skill sets `policy.allow_implicit_invocation: false` in
`agents/openai.yaml`. Its description can be a short label because the user names
the skill directly.

Use automatic selection only when the agent or another skill must reach the
skill without the user naming it. If many user-invoked skills become difficult to
find, create one user-invoked router that names their separate jobs.

## Keep the catalog description short

Put one discriminating trigger sentence in `description`. Move procedures,
examples, exclusions, and detailed routing into the body. Remove model identity
and capability claims already established elsewhere.

Every catalog word is loaded before the skill body, so it must help selection.

## Put information where it is needed

Keep instructions needed by every use in `SKILL.md`. Move substantial details
needed by only one branch into a linked reference. Say exactly when to read that
reference.

An ordered step should end with a result another agent can check. A rule or fact
that applies throughout the workflow can remain outside the steps. Keep each
meaning in one file and link to it rather than copying it.

Split a skill only when different requests need different catalog triggers, or
when seeing later steps repeatedly causes agents to stop early. First try a
clearer completion condition.

## Prune the instructions

For each sentence, ask whether removing it would change a capable agent's
decision or result. Delete it when the answer is no.

Remove repeated global rules, generic encouragement, speculative edge cases,
and examples that do not clarify a real branch. Prefer established terms to
framework-specific names that need their own explanation.

Keep prohibitions for safety, permissions, and observed failure modes. For an
ordinary preference, describe the desired result instead of making the unwanted
behavior more prominent.

## Check model-facing prose separately

After pruning model-facing instructions, run the repository-declared agent-prose
check when one exists. It catches a small set of visible writing problems. It
does not judge tone or meaning. Resolve findings without dropping facts or
constraints.

Use a technical-prose check only for technical documentation selected by the
repository's policy. Do not apply its ASD-style rules to prompts, handoffs, role
instructions, or skills. Do not assume either policy command is installed.

## Watch for recurring problems

- Premature completion means an agent leaves a step before producing its
  checkable result. Tighten that result before hiding later steps.
- Duplication means the same rule appears in more than one place. Keep one source
  and link to it.
- Sediment is old guidance retained because adding felt safer than replacing.
  Delete the stale layer.
- Sprawl means the live instructions are still too long. Move a real conditional
  branch into a reference.
- A no-op instruction changes nothing compared with normal model behavior.
  Remove it.
- A negative instruction can make the unwanted behavior more available. State
  the positive target unless the prohibition is a necessary guardrail.
