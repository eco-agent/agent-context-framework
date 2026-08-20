---
name: frontend-design-discipline
description: Reframe and specify substantial frontends before implementation when product representation, mobile composition, data-driven UI, topology, interaction, or visual asset roles are unsettled.
---

# Frontend Design Discipline

Design the product independently of its schema and current implementation, then
hand one approved representation to bounded implementation specialists.

## Choose the attention stage

Before loading more context, name the current subject and decision:

```text
product     What should this product or form factor fundamentally be?
screen      What is this screen for?
interaction What should this action communicate or change?
component   What representation best expresses the approved state?
layout      How should the composition respond to available space?
CSS         Which intrinsic relationship expresses that layout?
line        Is this implementation detail necessary?
```

Choose reasoning granularity separately. A visual thesis needs a coarse operation
over narrow product context. A CSS repair needs a fine operation over one component
and its real containers. A completed flow review may need several screens together.

Load the smallest context that can support the current decision. Do not load code,
schemas, routes, and the full design manual merely because they are relevant to the
project. Record unavailable evidence and expand context only for a named deficiency.
Read [progressive-context.md](references/progressive-context.md) when work crosses
stages, uses separate workers, or suffers from implementation anchoring.

## Route the work

- For a new product thesis, substantial topology, or a data-driven representation,
  read [product-reframing.md](references/product-reframing.md) and
  [representation-search.md](references/representation-search.md). Copy
  [design-search.md](assets/design-search.md) to
  `.codex/work/frontend/<task>-design-search.md`.
- For desktop-to-mobile or cross-form-factor work, also read
  [mobile-recomposition.md](references/mobile-recomposition.md) before choosing
  mobile topology.
- After one representation is approved, copy
  [frontend-spec.md](assets/frontend-spec.md) to
  `.codex/work/frontend/<task>.md`. Transfer only the approved thesis and its
  evidence, not discarded alternatives or exploratory discussion.
- Before reading or modifying the current component tree, read
  [implementation-reconciliation.md](references/implementation-reconciliation.md).
- For layout, overflow, container behavior, or CSS ownership, use
  `responsive-css-architect` after topology and composition are settled.
- For an authorized rendered review, read
  [visual-review.md](references/visual-review.md). If browser or visual review is
  not authorized, record it as unverified instead of claiming inspection.

## Establish evidence

Read user requirements, actual rendered states, representative runtime data, user
tasks, accepted decisions, nearby product surfaces, and any pinned precedent needed
by the active stage. Treat type definitions and schema names as correctness evidence,
not as a command to make each field visible.

Do not fill missing decisions from familiar generated UI. Every visible region and
hierarchy role needs evidence from the user, product behavior, runtime state,
existing interface, or accepted precedent. Preserve the semantic role as well as the words.

When the task creates or replaces substantial product topology or an application
shell, use `adopt-established-product` to pin a licensed implementation precedent.
Resolve any conflict between that precedent and an approved representation before
implementation. When its license permits reuse, begin from the named materialized
source rather than independently regenerating a look-alike.

## Approve one target

The design-search artifact may contain alternatives. The frontend specification
must contain one answer and one owner for each settled decision:

```text
outcome
-> representation thesis
-> topology
-> visible content and actions
-> visual assets
-> state and transitions
-> responsive behavior
-> ownership
-> exact code locations
```

The first acceptable design is a draft. Inspect representative states, remove or
replace one major decision, and compare a materially different solution before
approval. Keep the first only if it survives that comparison.

## Plan visual assets

Inventory every required icon, texture, illustration, pattern, background,
empty-state visual, and identity mark. Preserve accepted product, brand, and
precedent assets first. Otherwise create code-native SVG for icons and vectors, and
use `imagegen` for bitmap textures, illustration, or photo-like content.

An invented asset may realize an approved visual role. It must not invent product
meaning, content, actions, navigation, or features. Record the static reduced-motion
result for motion that communicates state, feedback, direction, or character.

## Implement one vertical slice

Choose the smallest end-to-end path that exercises the dominant interaction. Record
its entry, action, state transition, result, applicable states, owner, and exact code
locations. Implement only the approved target.

Use bounded specialists for settled concerns such as accessibility, color,
typography, interface details, animation, raster assets, and responsive CSS. A
specialist must not revise the approved representation, topology, visible content,
actions, or state ownership.

## Consolidate and propagate

Read the complete specification and diff. Remove output not required by the target,
duplicate state representations, compatibility layers, obsolete code, and files or
abstractions without distinct ownership. Update the specification if an approved
implementation decision changed.

Propagate the consolidated behavior only to entry points, clients, adapters,
contracts, and reverse actions named in the specification. Record unsupported
surfaces. Do not infer a new product decision during propagation.
