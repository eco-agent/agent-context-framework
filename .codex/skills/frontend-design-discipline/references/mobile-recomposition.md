# Mobile recomposition

Use this reference when translating an existing product across form factors.

## Treat form factors as product projections

Desktop and mobile are projections of the same product model, not two sizes of one
view. Before reading component boundaries as constraints, classify each mobile
surface:

```text
preserve   the same representation and flow remain appropriate
adapt      the representation remains but its composition changes
recompose  tasks and regions are reorganized around mobile use
split      one desktop surface becomes several mobile views
replace    a different representation or interaction serves the same product job
remove     the region does not earn mobile attention
```

`preserve` is not the default.

Mobile work may delete whole regions, replace components, reorder by task frequency,
split or merge flows, move secondary actions behind menus or sheets, replace tables
with purpose-built lists or drill-down views, change navigation architecture, and
ignore visual parity when parity harms usability.

## Reuse at the right layer

Usually share:

- domain models
- queries and mutations
- validation and permissions
- formatting and business rules
- state machines

Allow differences in:

- screen composition
- navigation
- interaction flow
- component hierarchy
- information density
- presentation

Some duplicated presentation logic is healthier than a universal component filled
with viewport branches when the interaction models genuinely differ. Judge reuse by
whether product behavior remains coherent, not by whether the same component renders
both form factors.

## Counterfactual review

Remove the desktop implementation from the mental context. Given only product
requirements, data, and mobile user tasks, would this screen be designed the same
way? If not, recompose the product rather than compressing the desktop DOM.
