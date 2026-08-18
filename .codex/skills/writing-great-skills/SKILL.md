---
name: writing-great-skills
description: Reference for writing and editing predictable skills.
---

# Writing great skills

A skill wrangles determinism out of a stochastic system. **Predictability** means taking the same process every run, not producing the same output. Every lever below serves it.

**Bold terms** are defined in [GLOSSARY.md](GLOSSARY.md).

## Invocation

Two choices trade different costs:

- A **model-invoked** skill allows implicit invocation. Its description states its purpose and the branches that trigger it. Discovery metadata contributes to **context load**.
- A **user-invoked** skill sets `policy.allow_implicit_invocation: false` in `agents/openai.yaml`. Its description is a short human-facing label. Its body loads only when the user invokes it, but Codex may still show its compact catalog entry.

Pick model invocation only when the agent or another skill must reach the skill without the user naming it. Otherwise make it user-invoked.

When user-invoked skills become difficult to remember, use one user-invoked **router skill**. The router names each skill and its trigger.

## Writing the description

A model-invoked **description** states what the skill is and lists the **branches** that should trigger it. Every word increases **context load**, so descriptions earn aggressive pruning:

- Front-load the skill's **leading word**.
- Keep one trigger per branch. Collapse synonyms that rename the same branch.
- Remove identity already established by the body.

For a user-invoked skill, keep one short human-facing sentence without trigger lists.

## Information hierarchy

A skill contains **steps**, **reference**, or both. Place each item according to how immediately the agent needs it:

1. **In-skill step**—an ordered action in `SKILL.md`. End each step on a checkable **completion criterion**. Where it matters, make it exhaustive.
2. **In-skill reference**—a definition, rule, or fact needed by every branch.
3. **External reference**—material moved into a linked file and loaded only when a **context pointer** fires.

A demanding completion criterion drives **legwork**, whether it binds a step or flat reference.

Use **progressive disclosure** for material needed only by some branches. Inline what every branch needs. The wording of a context pointer decides when the agent reaches its target.

Use **co-location** within each file: keep a concept's definition, rules, and caveats together.

## When to split

Each split spends context load or cognitive load:

- Split by invocation only when a distinct leading word should trigger independently or another skill must reach it.
- Split by sequence when visible later steps cause observed premature completion. First confirm that a sharper completion criterion cannot fix it.

## Pruning

Keep each meaning in one **single source of truth**.

Check every line for **relevance**. Then run the **no-op** test on each sentence in isolation: does it change behavior versus the model default? Delete sentences that do not.

After pruning model-facing prompts, tool descriptions, handoffs, or skill instructions, run `pnpm check:technical-prose --files <targets>`. Resolve each finding without dropping facts or constraints.

## Leading words

A **leading word** is a compact concept from the model's pretraining that anchors behavior in fewer tokens. Reuse the same word in descriptions, prompts, docs, and skill bodies when it should drive invocation and execution.

Prefer an existing word over a coined term. A made-up word spends tokens defining priors that an established word already provides.

## Failure modes

- **Premature completion**—the agent leaves a step before its criterion is met. Sharpen the criterion first. Hide later steps only when the bound remains irreducibly fuzzy and the failure is observed.
- **Duplication**—the same meaning has more than one source of truth.
- **Sediment**—stale layers remain because adding feels safer than removing.
- **Sprawl**—the skill is too long even though its lines are live and unique. Disclose reference or split a real branch.
- **No-op**—an instruction changes nothing versus the model default.
- **Negation**—a prohibition makes the prohibited prior more available. State the positive target. Keep a prohibition only for a hard guardrail that cannot be stated positively.
