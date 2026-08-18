# Glossary — Building Great Skills

A skill exists to wrangle determinism out of a stochastic system. **Predictability** is the root virtue; every term below is a lever on it.

The terms are grouped by **Invocation**, **Information Hierarchy**, **Steering**, and **Pruning**. Failure modes live beside the lever that corrects them.

## Predictability

The degree to which a skill makes the agent behave the same way on every run—the same process, not the same output. A brainstorming skill should predictably diverge.

_Avoid_: consistency, reliability, robustness, output determinism

## Invocation

How a skill is reached and which load the choice spends.

### Model-Invoked

A skill whose implicit invocation policy allows the agent to fire it autonomously. Its description is a permanent **context pointer** and contributes **context load**. Use this only when the agent or another skill must reach it without the user naming it.

_Avoid_: ability, tool, capability

### User-Invoked

A skill with `policy.allow_implicit_invocation: false`. Its body is reachable only when the user invokes it. It trades agent discovery for **cognitive load**. Codex may still display a compact human-facing catalog description.

_Avoid_: procedure, workflow, command

### Description

The compact catalog text that identifies a skill. For a model-invoked skill, it is also the machine-readable trigger and top-level **context pointer**. For a user-invoked skill, keep it as a short human-facing label.

_Avoid_: frontmatter, summary

### Context Pointer

A reference held in context that names out-of-context material and encodes when to reach it. Its wording, not its target, determines when and how reliably the agent follows it.

_Avoid_: link, reference, import

### Context Load

The tokens and attention permanently spent on model-visible discovery metadata. It limits how many independently discoverable skills should exist.

_Avoid_: token cost, context bloat

### Cognitive Load

What the user must remember about explicit-only skills: which exist and when to invoke them. It is the price of human agency, not a cost that should always be eliminated.

_Avoid_: human index, burden, overhead

### Router Skill

A user-invoked skill that names other user-invoked skills and when to reach for each. It reduces cognitive load without making every skill independently discoverable.

_Avoid_: dispatcher, menu, registry, index

### Granularity

How finely skills are divided. More model-invoked skills spend context load; more user-invoked skills spend cognitive load. Split by invocation only for an independently useful trigger. Split by sequence only to hide later steps that cause observed premature completion.

_Avoid_: chunking, modularity

## Information Hierarchy

How skill content is ranked by immediacy:

1. In-skill **steps**
2. In-skill **reference**
3. Disclosed or **external reference**

The hierarchy is independent of invocation. A skill can contain steps, reference, or both.

_Avoid_: structure, organization, layout

### Steps

Ordered actions the agent performs. Each step ends on a **completion criterion**. Not every skill needs steps.

_Avoid_: workflow, instructions, choreography

### Reference

Definitions, rules, facts, parameters, and examples consulted on demand. Keep universally needed reference in `SKILL.md`; disclose branch-specific material.

_Avoid_: supporting material, docs, background

### External Reference

Reference outside `SKILL.md`, reached through a context pointer. It can be a disclosed file within the skill or a repository document shared by several skills.

_Avoid_: doc, resource, knowledge base

### Progressive Disclosure

Moving reference down the information hierarchy and behind a context pointer. Inline what every branch needs. Disclose what only some branches need. If must-have material is missed, strengthen the pointer before inlining the material.

_Avoid_: lazy loading, chunking

### Co-location

Keeping a concept's definition, rules, and caveats together so reading one part brings its neighbors with it. It complements the information hierarchy: hierarchy chooses depth; co-location chooses adjacency.

_Avoid_: grouping, clustering, cohesion

### Sprawl

_Failure mode._ A skill is too long even though every line remains live and unique. Correct it through progressive disclosure or a justified branch or sequence split.

_Avoid_: bloat, length, size, verbosity

## Steering

The levers that make runtime behavior predictable.

### Branch

A distinct use of a skill that sends different runs through different content or steps.

_Avoid_: path, case, fork

### Leading Word

A compact concept already present in the model's pretraining that anchors behavior in few tokens. Reuse it in descriptions, prompts, docs, and skill bodies when that shared vocabulary should guide invocation and execution.

An established term recruits existing priors. A coined term must spend tokens defining its own.

_Avoid_: keyword, term, motif

### Completion Criterion

The condition that tells the agent a unit of work is done. Its clarity resists premature completion; its demand determines legwork. Strong criteria are checkable and, where needed, exhaustive.

_Avoid_: done condition, exit condition, stopping rule

### Legwork

The work an agent performs within a step: reading, exploring, changing, and gathering evidence. It is driven by the completion criterion and strong leading words, not by adding more visible steps.

_Avoid_: scope, effort, diligence, coverage

### Post-Completion Steps

Steps visible after the current one. They can pull attention toward being done and produce premature completion.

_Avoid_: horizon, fog of war, lookahead

### Premature Completion

_Failure mode._ Ending a step before its criterion is met because attention shifts toward later steps. Sharpen the completion criterion first. Hide later steps only when the criterion remains irreducibly fuzzy and the failure is observed.

_Avoid_: premature closure, rushing, shortcutting

### Negation

_Failure mode._ Steering by prohibition makes the forbidden behavior more available. State the positive target. Keep a prohibition only as a hard guardrail that cannot be phrased positively, and pair it with the target behavior.

_Avoid_: ironic rebound, don't-prompting, the pink elephant

## Pruning

Keeping every instruction live, singular, and behavior-changing.

### Single Source of Truth

The state where each meaning lives in one authoritative place.

_Avoid_: home, canonical location

### Duplication

_Failure mode._ The same meaning has more than one source of truth. It costs maintenance and tokens and unintentionally raises the meaning's prominence.

_Avoid_: repetition, redundancy

### Relevance

Whether a line still bears on what the skill does. A line loses relevance when it never affects the task, belongs to another branch, or has gone stale.

_Avoid_: load-bearing, staleness, freshness

### Sediment

_Failure mode._ Old content accumulates because adding feels safer than removing. It is the default fate of a skill without pruning.

_Avoid_: accretion, bloat, cruft, rot

### No-Op

_Failure mode._ An instruction changes nothing because the model already behaves that way by default. Test each sentence independently: does it change behavior versus the default?

A leading word is a technique; no-op is a verdict. A weak leading word can still be a no-op.

_Avoid_: redundant instruction, restating the obvious
