---
name: adopt-established-product
description: Adopt pinned product evidence and licensed source when creating or replacing an application shell, navigation, feed, tracker, workflow, chat, media library, admin tool, or dashboard. Do not use it for bounded repairs to settled product structure.
---

# Adopt an established product

Use this skill when the task creates or replaces an application shell,
navigation system, feed, issue tracker, project workflow, chat, media library,
admin tool, or dashboard. Bounded CSS, accessibility, state, and interaction
repairs do not need it when the existing product structure is already settled.

Choose one real product that handles the same main user task. When a maintained
implementation has a compatible license and architecture, begin with that source
instead of generating a similar interface from a written description. Change
only what the user's requirements demand.

## Pin one source

Search current products and public source code. Do not choose from memory.

Record:

- the user task the precedent handles;
- the source repository and full commit ID;
- the license and required notices;
- the routes, screenshots, and interactions used for comparison;
- why the source fits this product better than the alternatives you rejected.

Choose one precedent rather than presenting an option matrix. Generic cards,
forms, modals, visual adjectives, and the repository's accidental current layout
are not precedents.

## Record what will stay and what will change

Write the repository's current implementation contract before the frontend
specification. Name each existing owner to remove or rewrite. Map every upstream
file to its project location, mark the target as an exact copy or an adaptation,
and name the license notice that must remain.

Record the navigation, density, interactions, responsive behavior, and relevant
states that will stay faithful to the precedent. List only the differences
required by the task's acceptance checks.

If the user's requirements, data model, and precedent disagree in a way that
changes the product, ask the user to decide. Otherwise keep the precedent's
choice.

## Start from the licensed implementation

Use the closest practical form of reuse:

1. Fork the suitable implementation at the pinned commit.
2. Vendor or add a subtree for the relevant application or components.
3. Copy and adapt a coherent set of source files into the existing code owner.
4. Reproduce observed behavior independently only when the source cannot legally
   be reused.

Independent reproduction requires the implementation contract to record the
source-reuse prohibition and the acceptance check that authorizes this path.

Materialize reusable source before writing replacement code. Keep the required
copyright and license notices. Review project changes as a diff from the pinned
files so the new work is visible.

Remove the implementation being replaced. Do not leave a fallback or a second
version of the same experience.

## Compare the result with the precedent

Exercise the main workflow in both products. Compare navigation, information
density, keyboard behavior, responsive behavior, and every state required by the
task. Each difference must have a named acceptance reason.

The work is complete when the source and license are pinned, source files map to
their project locations, the required bytes have been copied, and the local
workflow behaves as recorded. Verify exact hashes for unchanged copies. For
adapted files, retain the upstream path and hash and review the project diff.
The contract may contain only required differences from the precedent. A
model-prior substitute does not count as completion.
