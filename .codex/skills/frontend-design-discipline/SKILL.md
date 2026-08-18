---
name: frontend-design-discipline
description: Specify substantial frontends before implementation when topology, state, ownership, interaction, or visual asset roles are unsettled.
---

# Frontend Design Discipline

Turn user requirements and repository evidence into a durable task contract, then implement one complete vertical slice.

## Establish evidence

Read the existing interface, product requirements, accepted decisions, and data contracts.

Do not fill missing decisions from familiar model-generated UI patterns.

Every visible content region and hierarchy role needs evidence from the user, product or data contract, existing interface, or pinned precedent. Preserve the semantic role as well as the words. Treat moving a precedent title into an eyebrow, badge, summary, or other hierarchy position as a deviation that needs an acceptance gate.

Omit common generated-UI seasoning unless the evidence requires it in that role: eyebrows, kickers, overlines, decorative microheadings, pills, badges, generic hero statements, fake metrics, card grids, gradient panels, and ornamental summaries. These are not harmless defaults.

When the task creates or replaces substantial product topology or an application shell, use `adopt-established-product` to select one current external product and pinned licensed implementation precedent. Do not invoke product adoption for bounded repairs to an established interface. When adoption applies, resolve topology, visible content, actions, state, and interaction from that evidence. Ask only when user requirements, data contracts, and the precedent materially conflict.

When the selected license permits reuse, begin from the materialized source files named by the implementation contract. Do not read them and independently regenerate equivalent components.

## Plan visual assets

Inventory every required icon, texture, illustration, pattern, background, empty-state visual, and identity mark before implementation.

Preserve accepted product, brand, and precedent assets first. When none exists, create code-native SVG for icons, vectors, patterns, and self-contained animated artwork. Use the `imagegen` skill for bitmap textures, illustrative imagery, photo-like content, and raster variants derived from references. Do not substitute nested elements, CSS gradients, pseudo-elements, emoji, or an arbitrary library glyph when a purpose-built asset would express the recorded visual role better.

Prefer restrained animated SVG when motion communicates state, feedback, direction, or product character. Record the static reduced-motion result. Use a static asset when motion adds nothing.

An invented asset may realize an already-required visual role. It must not create product meaning, visible content, actions, navigation, or features that lack evidence.

## Write the frontend specification

For substantial frontend work, copy [frontend-spec.md](assets/frontend-spec.md) to `.codex/work/frontend/<task>.md`.

Write decisions, not questions, aspirations, design adjectives, or option lists.

Expand decisions in this order:

```text
outcome
→ topology
→ visible content and actions
→ visual assets
→ state
→ ownership
→ exact code locations
```

Stop expanding when every decision has one answer and one owner.

Expand established decisions into implementation decisions. Do not turn an absent product decision into permission to choose one.

Record existing code, UI, state, and files that the implementation replaces or removes.

## Choose the first vertical slice

Choose the smallest end-to-end user path that exercises the dominant interaction.

Record its entry, action, state transition, result, owner, and exact code locations.

Record every applicable state in the slice.

Do not start a second slice until the first is consolidated.

## Preserve reference fidelity

When a product precedent is selected, preserve its information hierarchy, density, navigation, interaction grammar, and responsive behavior. Preserve repository style rules unless the user explicitly replaces them. Do not blend the precedent with generic model-prior cards, dashboards, forms, or modals.

## Use bounded specialists

Use a specialist only when the recorded slice contains its concern:

- `responsive-css-architect`: layout, responsiveness, CSS ownership, Tailwind, and overflow.
- `design-accessible-interfaces`: recorded keyboard, focus, form, naming, announcement, hit-area, motion-preference, or zoom behavior.
- `design-web-typography`: an explicit typography-system decision.
- `design-color-systems`: an explicit color-system or contrast-remediation decision.
- `design-interface-details`: a settled interface-detail, icon, or code-native SVG decision.
- `imagegen`: an original bitmap texture, illustration, photo-like image, or raster variant from accepted references.
- `choose-react-animation`: specified motion behavior, including animated SVG.

A specialist implements its concern. It must not change precedent, topology, visible content, actions, state ownership, or scope.

Return to this specification after each specialist concern.

## Implement the first slice

Implement only the recorded content, actions, state, topology, and ownership.

Adopt the pinned implementation before writing a new owner. Otherwise edit the existing owner before creating a new component, abstraction, or file. Remove the implementation that the specification replaces.

For adopted source, preserve copied files exactly and express adaptations as reviewable diffs from their verified upstream bytes. Keep the required license notice.

## Consolidate the slice

Read the complete specification and diff.

Remove:

- output not required by the specification;
- duplicate representations of state;
- parallel implementations of the same concern;
- obsolete code left behind by the change;
- files or abstractions without distinct ownership.

Update the specification if an implementation decision changed. Review the revised diff again before verification.

## Propagate

After the first slice is complete and reduced, implement the same shared behavior on every applicable propagation surface recorded in the specification.

Record unsupported surfaces. Do not infer new product behavior while propagating.

Repeat the workflow for another slice only after applicable propagation is complete.
