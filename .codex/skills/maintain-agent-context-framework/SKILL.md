---
name: maintain-agent-context-framework
description: Use when changing Agent Context Framework instructions, skills, registry components, governance, or generated configuration; do not use for ordinary project implementation.
---

# Maintain Agent Context Framework

Change the canonical owner, then carry the change through its required
projections and observations. Preserve every behavior the user did not explicitly
remove or replace. Treat existing instructions as active constraints, not prose
that can be freely summarized.

## Start with a preservation map

Before editing, trace the affected behavior through its canonical source,
installed projection, registry component, governance rule, generated output, and
test. Classify each relevant instruction as retained, changed, removed, or added.
Only the user's request can authorize a removal or weaker requirement.

A rewrite is not preservation merely because it covers the same topic. Check
whether the new wording keeps the same owner, trigger, requirement strength,
exceptions, stopping condition, and completion evidence. If two retained
requirements conflict and the request does not choose between them, report the
conflict and ask for one decision before editing either rule.

Keep this map in the active work record when one exists. Otherwise include it in
the final review. Do not create a second artifact for it. The map should
disappear with temporary task state after the durable decision owns the result.

## Give every boundary an observation and a grace path

For each behavior being added or changed, settle four facts:

| Fact | Question |
| --- | --- |
| Owner | Which source or role decides? |
| Boundary | What is allowed, forbidden, or limited? |
| Observation | What diff, artifact, test, or report shows whether the agent stayed inside it? |
| Grace path | What may the agent do when the primary path reaches the boundary? |

A grace path is the permitted next action after a boundary blocks the primary
path. It may route the agent to an existing implementation, a named fallback, a
decision owner, a request for missing authority, or a recorded unsupported case.
It must not widen scope or silently weaken the boundary.

Do not leave behavioral limits behind phrases such as "when appropriate",
"where practical", "as needed", or "reasonable". When judgment is genuinely
required, name the evidence, decision owner, finite choices, and required report.
Keep exceptions narrow and observable. An unnamed exception is an escape hatch.
Assume the agent will take the least constrained reading that still appears
compliant. If that reading is unacceptable, tighten the owner, boundary,
observation, or grace path.

A boundary without an observation is a wish. A boundary without a grace path
often produces a no-op agent. Repair both before adding more prohibitions.

## Design for limited attention

Assume the model can solve the problem. Do not diagnose every drift as ignorance
or refusal. First check whether the rule was present at the decision point,
competed with too many live instructions, lacked an observation, or gave the
agent no allowed next action.

Keep universal invariants in the skill or instruction entrypoint. Route
conditional detail to a reference that says when to read it. Put deterministic
memory in code, generated artifacts, tests, or a bounded work record. Keep each
meaning with one owner and derive projections from that owner.

Do not solve attention pressure by repeating the same rule in more places. Move
the rule closer to the action, shorten unrelated live context, or enforce its
mechanical part. Expand context only when the agent can name the missing fact.
Never require an unbounded audit to prove an ordinary edit.

## Choose prose or enforcement code deliberately

Use prose for intent, ownership, permissions, judgment criteria, semantic
boundaries, narrow exceptions, and grace paths. Use deterministic code for
syntax, schemas, path containment, exact projections, hashes, dependency closure,
generated output, changed-file selection, and limits derived from measured
boundaries.

Many important rules need both. Prose states why the invariant exists and what
an exception means. Code observes the mechanical part and reports the valid next
action. Do not claim that a keyword check proves behavior it cannot observe, and
do not encode taste or semantic judgment as a brittle regular expression.

Read [prose-and-enforcement.md](references/prose-and-enforcement.md) when adding
or changing governance, validators, tests, limits, or another mechanism that
might replace model-facing prose.

## Treat model-facing language as behavior

Instruction language becomes an example of how the agent writes. Use direct,
concrete sentences in the voice expected from the agent. Do not let terse policy
fragments, abstract jargon, canned symmetry, or sterile checklists leak into
responses and handoffs.

Treat a skill's YAML `description` as its catalog trigger. State the requests
that should load the skill and distinguish nearby work. Do not use that field as
a body summary, capability claim, or promotional blurb.

Run the repository's agent-prose check on every changed model-facing file. The
check catches known patterns. It does not replace a semantic or voice review.

## Carry the change through its owners

Edit the canonical source first. Update direct projections, registry revision and
decision, governance hashes and semantic requirements, generated registry data,
installation tests, and any caller that depends on the old behavior. Replace the
old representation directly. Do not add compatibility wording, duplicate rules,
or parallel owners unless the user asks for them.

Extend an existing checker before creating a new one. Add an artifact only when
it either changes the model's decision at the right time or proves a boundary
the model cannot observe from available task state. Process that only records
that work happened is ceremony. Delete it.

## Completion contract

Finish only when all of the following are true:

- The semantic diff names every affected behavior as retained, changed, removed,
  or added.
- Every changed boundary has an owner, observation, and grace path.
- Prose and programmatic enforcement have distinct jobs and agree.
- Canonical sources, projections, registry data, governance, and callers agree.
- Every repository-declared narrow check for the changed owners passes. An
  unavailable observer follows its named grace path and is reported.
- The handoff names skipped checks and behavior that no available observer can
  verify.
- Temporary work state is removed after durable evidence reaches its owner.
