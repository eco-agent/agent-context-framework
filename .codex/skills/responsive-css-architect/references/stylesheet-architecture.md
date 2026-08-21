# Stylesheet Architecture

Use this reference when partitioning, importing, or cleaning CSS.

## Standard Folder Shape

```txt
src/
  styles/
    index.css
    reset.css
    tokens.css
    base.css
    utilities.css

    layouts/
      shell.css
      sidebar.css
      dashboard-grid.css

    components/
      button.css
      card.css
      modal.css
      form-field.css
      nav-tabs.css

    pages/
      login.css
      dashboard.css
      event-editor.css

```

Adapt names to the project, but keep the ownership model.

## Root Stylesheet Rules

`index.css`, `global.css`, `app.css`, or root-level stylesheets may own only:

- imports
- reset rules
- tokens
- base element defaults
- global accessibility helpers
- broad utilities

They must not own:

- component CSS
- route/page CSS
- feature-specific CSS
- temporary fixes without an owner
- page-specific override piles

## Import Order With Cascade Layers

```css
@layer reset, tokens, base, utilities, layouts, components, pages, features, overrides;

@import "./reset.css" layer(reset);
@import "./tokens.css" layer(tokens);
@import "./base.css" layer(base);
@import "./utilities.css" layer(utilities);

@import "./layouts/shell.css" layer(layouts);
@import "./layouts/dashboard-grid.css" layer(layouts);

@import "./components/button.css" layer(components);
@import "./components/card.css" layer(components);
@import "./components/modal.css" layer(components);
@import "./components/form-field.css" layer(components);

@import "./pages/dashboard.css" layer(pages);

@import "./overrides.css" layer(overrides);
```

Use `overrides.css` sparingly. Prefer fixing ownership and specificity before adding overrides.

## Import Order Without Cascade Layers

```css
@import "./reset.css";
@import "./tokens.css";
@import "./base.css";
@import "./utilities.css";

@import "./layouts/shell.css";
@import "./components/button.css";
@import "./pages/dashboard.css";
@import "./features/pos/product-grid.css";
```

Do not use import order as a secret override mechanism. If two files fight, move rules to the true owner or reduce specificity.

## Ownership Decision Tree

```txt
Is this a design value?
→ tokens.css

Is this reset/normalization?
→ reset.css

Is this an element default?
→ base.css

Is this a small reusable helper?
→ utilities.css

Is this reusable app structure?
→ layouts/*.css

Is this a reusable UI component?
→ components/*.css

Is this tied to one route?
→ pages/*.css

Is this tied to one business feature?
→ features/<feature>/*.css
```

## Component Stylesheet Example

```css
/* src/styles/components/button.css */

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-block-size: 2.75rem;
  padding-block: 0.65rem;
  padding-inline: 1rem;
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.button--primary {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.button--secondary {
  background: var(--color-surface-muted);
  color: var(--color-text);
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
```

## Feature Stylesheet Example

```css
/* src/styles/features/pos/product-grid.css */

.pos-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: var(--space-2);
}

.pos-product-card {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.pos-product-card__name {
  font-weight: 700;
}

.pos-product-card__meta {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
```

## Root Stylesheet Anti-Pattern

```css
/* Bad: src/styles/index.css */

body { margin: 0; }
.button { /* component */ }
.dashboard-card { /* page */ }
.login-form { /* page */ }
.pos-product-grid { /* feature */ }
.event-editor-panel { /* feature/page */ }
```

## Correct Root Stylesheet

```css
/* Good: src/styles/index.css */

@layer reset, tokens, base, utilities, layouts, components, pages, features, overrides;

@import "./reset.css" layer(reset);
@import "./tokens.css" layer(tokens);
@import "./base.css" layer(base);
@import "./utilities.css" layer(utilities);
@import "./layouts/shell.css" layer(layouts);
@import "./components/button.css" layer(components);
@import "./components/card.css" layer(components);
@import "./pages/dashboard.css" layer(pages);
@import "./features/pos/product-grid.css" layer(features);
```

## Refactoring Bloated Root CSS

1. Identify each selector's concern: token, base, utility, layout, component, page, or feature.
2. Create missing owner files only when no suitable owner exists.
3. Move related selectors together.
4. Add imports in the correct layer/order.
5. Remove duplicate rules left behind in the root file.
6. Check that class names still match markup.
7. Verify behavior in narrow, medium, wide, long-content, and keyboard states.
