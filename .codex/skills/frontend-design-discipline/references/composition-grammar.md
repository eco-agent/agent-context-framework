# Composition grammar

Use this reference after choosing a representation and before approving its
implementation specification. It decides how information shares space. It does
not decide which source component should own the code.

## Separate semantic and visual boundaries

Name the semantic owners needed for behavior, testing, and maintenance. Then
compose them into the fewest spatial groups that preserve reading order and
interaction.

A semantic owner may render directly into a shared layout. Do not give it a
border, background, heading, rounded container, or independent padding merely
because it has its own component or data type. Add a visual boundary only when
it marks one of these differences:

- a distinct interaction context, such as a movable pane or dismissible dialog
- independent scrolling, selection, focus, or navigation
- a state that must remain legible apart from neighboring content
- a destructive or permission-sensitive action boundary
- a product boundary supported by approved precedent

If proximity, alignment, type, or whitespace already explains the relationship,
omit the boundary.

## Spend surfaces deliberately

A page has one primary surface or none. Treat every additional bordered,
elevated, tinted, rounded, or independently padded region as an exception. Name
its interaction reason and the states in which it appears.

Do not nest surfaces to create hierarchy. Do not turn each noun in a requirement
into a card. Status, metadata, actions, and supporting detail can share a row,
column, table, or pane when placement already communicates their relationship.

Use these forms before adding a noun container:

| Relationship | Preferred form |
| --- | --- |
| label to value | property list or aligned field group |
| command to current selection | action row or toolbar |
| primary work to supporting detail | split pane or inspector |
| repeated records | dense list or table |
| event to time | timeline or ordered activity list |
| control to affected content | adjacent control row or shared header |

## Set a density profile

Choose spacing, row height, type size, and control height from product evidence.
Use existing operational defaults when they fit. Otherwise record compact values
for the approved screen and explain any larger exception.

Density is a relationship, not a global gap token. Prefer shared baselines and
consistent row rhythm. Do not respond to each crowded region by adding padding,
another heading, or another container. Check whether a label can disappear,
whether related fields can align, and whether placement can carry the grouping.

## Apply negative component rules

Use a card only for an independently meaningful surface with a recorded
interaction reason. Use a badge only when the state must scan across repeated
items or compete with nearby values. Use a heading only when it helps navigation
or identifies a region that placement cannot make clear.

Use tabs only for peer views that cannot usefully appear together and whose
hidden state is acceptable. Use a dialog only for a bounded interruption that
must leave the current context intact. Use a separator only for a real structural
transition. Label a button when the icon or placement cannot identify its action.

These components remain available. None is the default answer to weak hierarchy.

## Complete the spatial pass

Inspect the approved composition as one page rather than as separate components.
Record the result of each check:

1. Reading order follows the user's task.
2. Related values share alignment or proximity.
3. The surface count stays within the recorded budget.
4. Repeated padding does not create nested boxes.
5. Density matches the product and the representative data.
6. Placement replaces unnecessary labels, headings, badges, and separators.
7. Semantic owners remain free to render into a shared visual group.
8. Narrow layouts preserve the product model even when they recompose it.

If a screenshot or runnable view exists, perform this pass on the rendered result.
If it does not, use a plain text wireframe or layout sketch. Source code alone does
not settle composition.
