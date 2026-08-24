---
name: frontend-design-discipline
description: Reframe and specify substantial frontends or novel user-facing interactions before implementation when representation, composition, topology, behavior, or visual asset roles are unsettled.
---

# Define the frontend before implementing it

Decide what the product should show and how it should behave before treating the
schema or current component tree as the answer. Once the user approves one
design, give implementation specialists that design rather than the discarded
alternatives.

## Name the decision in front of you

Choose the smallest level that contains the unsettled question:

| Level | Question |
| --- | --- |
| Product | What should this product or form factor be? |
| Screen | What is this screen for? |
| Interaction | What should this action change or communicate? |
| Component | What should express the approved state? |
| Layout | How should the composition respond to available space? |
| CSS | Which layout relationship belongs in CSS? |
| Code | Is this implementation detail necessary? |

Read only enough material to decide that question. A product decision may need
runtime examples and user tasks but little component code. A CSS repair may need
one component and its real containers. Expand the reading set when you can name
the missing fact.

Read [progressive-context.md](references/progressive-context.md) when the work
crosses these levels, uses separate workers, or keeps drifting toward the current
implementation.

## Read the reference that matches the work

- For a new product direction, navigation structure, or data-driven design, read
  [product-reframing.md](references/product-reframing.md) and
  [representation-search.md](references/representation-search.md). Copy
  [design-search.md](assets/design-search.md) to
  `.codex/work/frontend/<task>-design-search.md`.
- For desktop and mobile composition, also read
  [composition-grammar.md](references/composition-grammar.md) and
  [mobile-recomposition.md](references/mobile-recomposition.md).
- When semantic regions, component boundaries, surfaces, density, or spatial
  grouping remain unsettled, read
  [composition-grammar.md](references/composition-grammar.md) before approving
  the specification.
- After the user approves one design, copy
  [frontend-spec.md](assets/frontend-spec.md) to
  `.codex/work/frontend/<task>.md`. Keep the approved answer and the facts that
  support it. Leave rejected explorations behind.
- Before reading or changing the current component tree, read
  [implementation-reconciliation.md](references/implementation-reconciliation.md).
- After composition is settled, use `responsive-css-architect` for layout,
  overflow, containers, and stylesheet ownership.
- For an authorized rendered review, read
  [visual-review.md](references/visual-review.md). Otherwise report that visual
  behavior remains unchecked.

## Ground visible decisions in the product

Use the user's requirements, real states, representative data, user tasks,
accepted decisions, nearby screens, and any pinned precedent. Types and schemas
show what values exist. They do not decide which values deserve a visible region.

Each visible region, action, and hierarchy choice needs a reason in those
sources. Familiar generated UI is not a reason. Preserve the role of approved
copy when moving it. A heading moved into helper text has changed even when its
words remain the same.

When the task creates or replaces an application shell or major navigation, use
`adopt-established-product` to pin a licensed implementation. Settle conflicts
between that precedent and the approved design before coding. Begin with the
licensed source when its terms permit reuse.

## Approve one design

Exploration may contain alternatives. The implementation specification must
settle one answer and one owner for the product direction, navigation, visible
content, actions, assets, states, responsive behavior, and code locations.

Treat the first acceptable design as a draft. Replace one major choice and
compare the result with a genuinely different solution. Keep the first choice
only when it still serves the user's task better.

Before approval, map semantic owners to spatial groups and name every visual
surface. A code boundary does not earn a border, background, heading, or padded
container. Record the interaction reason for each surface beyond the primary
one. Complete the spatial pass in
[composition-grammar.md](references/composition-grammar.md).

## Plan the visual assets

List every required icon, texture, illustration, pattern, background, empty-state
visual, and identity mark. Preserve approved product, brand, and precedent files
first. Create SVG for icons and vectors. Use `imagegen` for bitmap texture,
illustration, or photographic work.

A new asset may fill an approved visual role. It may not add product meaning,
content, actions, navigation, or features. Record the static result for people
who prefer reduced motion.

## Implement one complete path

Choose the smallest user path that exercises the main interaction. Record where
it starts, the action, state change, result, required states, and exact code
locations. Name the owner of each code location. Implement the approved design
only.

Before naming a new presentation owner, inspect dependency manifests, component
imports, providers, theme configuration, and local component directories. Map
the approved roles to the project's component library where they match. The
library does not decide product structure, copy, or hierarchy, but an adopted
component keeps ownership of behavior and accessibility unless its public API
cannot meet a recorded requirement.

Specialists may handle settled accessibility, color, typography, interface
details, animation, bitmap assets, and responsive CSS. They must not change the
approved product structure, visible content, actions, or state ownership.

## Remove leftovers and update callers

Read the final specification and diff together. Remove unused output, duplicate
state, compatibility layers, obsolete code, and files without a distinct job.
Update the specification when an implementation decision changed with approval.

Carry the finished behavior only into the entry points, clients, adapters,
contracts, and reverse actions named in the specification. Record places that
remain unsupported rather than making a new product decision during cleanup.
