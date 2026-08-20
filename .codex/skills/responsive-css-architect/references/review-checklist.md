# CSS Review Checklist

Use this reference before finalizing CSS changes.

## Layout

- The layout primitive matches the problem: normal flow, flex, grid, container query, or media query.
- Page width uses intrinsic constraints such as `min()`, `max()`, or `inline-size: min(...)` rather than fixed viewport guesses.
- Collections use responsive grid patterns such as `repeat(auto-fit, minmax(min(100%, X), 1fr))` when appropriate.
- Reusable components respond to their container, not only the viewport.
- The component can move among its supported drawer, grid, page, and modal contexts
  with little or no geometric rewriting.
- Numeric values describe intentional constraints rather than compensate for one
  screenshot or containing page.
- Long text, missing images, one item, many items, and empty states do not break the layout.

## Interaction and Accessibility

- Interactive elements have visible `:focus-visible` styles.
- Hover styles are not the only indication of interactivity.
- Disabled and loading states are styled.
- Error and empty states are considered where relevant.
- Animations respect `prefers-reduced-motion`.
- Touch targets are comfortably sized.

## Maintainability

- Root/global stylesheet contains only globals and imports.
- Component styles live in component files.
- Page styles live in page files.
- Feature styles live in feature folders.
- Selectors are shallow and class-based.
- Design values use tokens instead of scattered literals.
- Import order is broad-to-narrow and preferably uses cascade layers.
- `!important` is absent unless needed for third-party CSS, with a comment explaining why.

## Final Response Evidence

When reporting CSS work, include:

```txt
Layout intent:
Responsive strategy:
Stylesheet ownership:
Key files changed:
Validation performed:
Risks or follow-ups:
```
