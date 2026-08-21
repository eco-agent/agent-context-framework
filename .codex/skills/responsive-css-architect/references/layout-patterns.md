# Layout Patterns and Modern CSS

Use this reference when writing or refactoring responsive CSS.

## Express Relationships, Not Measurements

Let the browser solve geometry from content and available space. Prefer rules that
describe how items relate:

```css
.collection {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
}

.content {
  inline-size: min(100%, 42rem);
}

.row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.item {
  flex: 1 1 16rem;
}
```

Avoid encoding the geometry of one screenshot:

```css
.panel {
  width: 372px;
  margin-left: 18px;
  top: 74px;
  height: 493px;
}
```

A number is appropriate when it describes an intentional physical constraint, such
as a minimum touch target, border thickness, icon size, or known control height. It
is a smell when it repairs the current placement instead of expressing layout intent.

## Layout Primitive Selection

| Situation | Prefer | Notes |
| --- | --- | --- |
| Article/document flow | Normal flow + spacing | Let content define height. |
| Navigation, toolbars, buttons, chips | Flex | One axis, wrapping allowed. |
| Cards, dashboards, product grids | Grid | Two-dimensional placement. |
| Component changes based on available space | Container queries | Better than viewport media queries for reusable components. |
| Whole-page navigation or shell changes | Media queries | Use when the viewport truly controls the layout. |

## DO: Tokenize Fluid Values

```css
:root {
  --space-1: clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem);
  --space-2: clamp(0.75rem, 0.6rem + 0.8vw, 1rem);
  --space-3: clamp(1rem, 0.8rem + 1vw, 1.5rem);
  --space-4: clamp(1.5rem, 1rem + 2vw, 3rem);

  --text-sm: clamp(0.875rem, 0.84rem + 0.2vw, 1rem);
  --text-md: clamp(1rem, 0.95rem + 0.3vw, 1.125rem);
  --text-lg: clamp(1.25rem, 1rem + 1vw, 2rem);

  --radius-sm: 0.5rem;
  --radius-md: 1rem;

  --color-surface: #ffffff;
  --color-surface-muted: #f5f5f5;
  --color-text: #1f2933;
  --color-text-muted: #5f6c7b;
  --color-accent: #2563eb;
  --color-accent-contrast: #ffffff;
  --color-border: #d8dee8;
  --color-focus-ring: color-mix(in srgb, var(--color-accent), white 45%);
}
```

## DO: Use Grid for Card Collections

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: var(--space-3);
}
```

This responds to available space without naming devices.

## DO: Use Container Queries for Reusable Components

```css
.product-card {
  container-type: inline-size;
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

@container (min-width: 32rem) {
  .product-card {
    grid-template-columns: 10rem 1fr;
    align-items: start;
  }
}
```

Use container queries when a component may appear in sidebars, modals, dashboards, or full-width pages.

Review the same component in those actual contexts. Its internal CSS should respond
to available space without learning which page happened to contain it.

## DO: Use Flex for One-Dimensional Controls

```css
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
```

## DO: Include Interaction States

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-block-size: 2.75rem;
  padding-block: 0.65rem;
  padding-inline: 1rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.button:hover {
  filter: brightness(0.95);
}

.button:active {
  transform: translateY(1px);
}

.button:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 3px;
}

.button:disabled,
.button[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: transform 120ms ease, filter 120ms ease;
  }
}
```

## DO: Protect Against Overflow

```css
.content {
  overflow-wrap: anywhere;
}

.media-frame > img,
.media-frame > video,
.media-frame > svg {
  max-inline-size: 100%;
  block-size: auto;
}

.table-wrapper {
  overflow-x: auto;
}
```

## DO NOT: Use Fixed Page Widths

```css
/* Bad */
.page {
  width: 1200px;
}

/* Better */
.page {
  inline-size: min(100% - 2rem, 72rem);
  margin-inline: auto;
}
```

## DO NOT: Use Absolute Positioning for Normal Layout

```css
/* Bad */
.card {
  position: absolute;
  top: 180px;
  left: 420px;
}

/* Better */
.card-list {
  display: grid;
  gap: var(--space-3);
}
```

## DO NOT: Use Fragile Fixed Grids

```css
/* Bad */
.card-grid {
  grid-template-columns: 300px 300px 300px;
}

/* Better */
.card-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
}
```

## DO NOT: Hide Focus Without Replacement

```css
/* Bad */
.button:focus {
  outline: none;
}

/* Better */
.button:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 3px;
}
```

## DO NOT: Animate Everything

```css
/* Bad */
* {
  transition: all 300ms ease;
}

/* Better */
@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: transform 120ms ease, filter 120ms ease;
  }
}
```
