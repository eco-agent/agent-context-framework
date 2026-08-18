---
name: adopt-established-product
description: Adopt a pinned, externally evidenced product and licensed source implementation for substantial product-topology work. Use when creating or replacing an application shell, navigation and information architecture, feed, issue tracker, project workflow, chat, media library, admin tool, or dashboard. Do not use for bounded fixes to an established interface.
---

# Adopt Established Product

Suppress model priors by grounding product decisions in one real external precedent. When its license and architecture permit reuse, copy, vendor, fork, or port the maintained source before writing project-specific changes. A prose summary followed by an independent rewrite is not adoption. Reproduce observable behavior independently only when source reuse is prohibited. Change only the user-required delta.

This skill is an explicit product-topology branch. It does not apply to CSS fixes, accessibility remediation, state repair, isolated interaction changes, or work whose topology and product grammar are already established.

## Select one precedent

1. Derive the dominant user job and product category from the request and data contracts.
2. Search current product behavior and public source; do not select from memory.
3. Choose the closest successful product and one maintained licensed implementation. Do not produce an option matrix.
4. Record the repository, exact commit, license, reference routes or screenshots, and why its user job matches.

Do not treat generic cards, dashboards, forms, modals, visual-style adjectives, or the repository's accidental UI as product precedent.

## Freeze the adoption contract

Write the current implementation contract before the frontend specification. Record:

- existing owners to remove or rewrite;
- product name, source repository, exact revision, and license;
- a repository evidence file with captured routes, screenshots, and behavior;
- topology, navigation, density, interactions, responsive behavior, and states to adopt unchanged;
- only deviations required by named acceptance gates.

Use the repository's current implementation-contract version. For reusable source, also record every upstream file to materialize, its owned target, whether the target remains an exact copy or is adapted, and the retained license-notice path. For independent observation, record the source-reuse prohibition and the acceptance gate that authorizes it.

If the user has not requested a difference, preserve the precedent decision. Ask only when user requirements, data contracts, and the selected precedent materially conflict.

## Adopt source before writing replacements

Prefer, in order:

1. fork the suitable implementation at the pinned revision;
2. vendor or subtree the relevant application or components;
3. adapt its coherent topology and interaction implementation in the existing owner;
4. independently reproduce pinned observable behavior only when source reuse is not permitted.

For source reuse, materialize the named files into the worktree before generating new implementation code. Preserve the required license and copyright notices. Make changes as a diff from those files so Git shows the upstream implementation and the project-specific delta.

Do not rebuild the established shell from primitives merely because generated code is cheap or because copying licensed code feels risky. A verified permissive license is authority to reuse under its terms. Remove the implementation being replaced; do not retain a fallback or parallel experience.

## Verify reference fidelity

Exercise the dominant workflow in the reference and implementation. Capture evidence for topology, navigation, content density, applicable states, keyboard behavior, and responsive behavior. Verify every deviation against its acceptance gate and remove unrequired deviations.

Completion requires a pinned source, retained license, named source-to-target mappings, materialized source bytes, a divergence-only contract, observable local behavior, and no model-prior substitute. For copied files, verify exact hashes. For adapted files, retain the upstream path and hash and review the diff from those bytes.
