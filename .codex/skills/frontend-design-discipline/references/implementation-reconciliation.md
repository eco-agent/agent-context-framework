# Implementation reconciliation

Use this reference only after a representation and composition are approved.

## Reconcile target and current state

Receive two bounded inputs:

```text
approved target representation
current implementation needed to reach that target
```

The existing implementation is evidence about behavior, integrations, and cost. Its
component boundaries, DOM hierarchy, control inventory, naming, CSS, and framework
conventions have no authority over the approved product representation unless the
specification explicitly retains them.

Inventory the component system before assigning new presentation owners. Inspect
dependency manifests, existing component imports, providers, theme setup, local
wrappers, and shared component directories. A component library does not decide
the approved topology, copy, or hierarchy. Once an approved role matches a
library component, reuse that component's behavior and accessibility. Do not
replace it with hand-written markup merely because custom styling looks easier.

Map each approved behavior and state to its implementation owner. Preserve shared
domain models, queries, mutations, validation, permissions, formatting, state
machines, and business rules when they still serve the target. Replace presentation,
composition, navigation, and interaction owners when they do not.

## Prefer direct replacement

Deletion is unrestricted within the approved change. Remove obsolete regions,
components, styles, viewport branches, and abstractions. Prefer replacement over
compatibility layers, parallel representations, or a universal component when the
target structure differs materially.

Some duplicated presentation code is acceptable when two interaction models are
genuinely different and their shared behavior remains owned below the presentation
layer.

Before implementation, record:

- retained product behavior and owner
- replaced or removed UI and owner
- shared lower-layer behavior
- component-library behavior and wrappers retained
- recorded library mismatches that require a replacement
- new presentation owner
- exact entry points and reverse actions
- feasibility constraints that must return to the design owner

Do not let implementation convenience silently revise the approved target.
