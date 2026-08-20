---
name: responsive-css-architect
description: Structure responsive CSS for layout, overflow, interaction states, container queries, and stylesheet ownership.
---

# Responsive CSS Architect

Use this skill to create resilient CSS and keep stylesheets organized. Treat CSS as
a constraint system: express relationships rather than screenshot measurements,
choose the layout primitive, define the responsiveness boundary, protect against
overflow, then place styles in the file that owns the concern.

Implement only the CSS concern recorded in the owning task contract. Do not decide product topology, visible content, state ownership, or task completion. Return control after the CSS concern and its applicable states are implemented.

## Operating Rules

1. Classify the UI before writing CSS.

   * Document flow: use normal flow and spacing.
   * One-dimensional alignment: use flex.
   * Two-dimensional placement: use grid.
   * Reusable component responsiveness: use container queries.
   * Page/device-level shifts: use media queries.

2. State layout intent before emitting CSS.

   * What is the layout primitive?
   * What resizes: page, container, item, text, gaps, or media?
   * What must not overflow?
   * Which interaction states must exist?
   * Which stylesheet owns the change?

   Before introducing a numeric value, ask whether intrinsic sizing, min/max
   constraints, flex growth or shrink, grid tracks, content wrapping,
   `aspect-ratio`, `clamp()`, `min()`, `max()`, `minmax()`, `auto-fit`,
   `auto-fill`, container units, container queries, or logical properties express
   the relationship directly.

3. Prefer intrinsic, content-aware CSS.

   * Use `min()`, `max()`, `clamp()`, `minmax()`, `fit-content`, `auto-fit`, and `auto-fill` when they express the constraint directly.
   * Use logical properties such as `padding-inline`, `margin-block`, `inline-size`, and `block-size`.
   * Use custom properties for design tokens.
   * Use cascade layers for larger projects.

4. Avoid brittle CSS.

   * Do not use fixed widths for page layout unless required by a specific asset or external system.
   * Do not use absolute positioning for ordinary layout.
   * Use a hard-coded number when the thing itself is intentionally fixed, such as
     a minimum touch target, border thickness, icon size, or known control height.
     Do not use a number to compensate for unresolved layout.
   * Do not rely on exact text length.
   * Do not hide focus outlines without replacing them.
   * Do not use deep selector chains.
   * Do not add component, page, or feature styles to the root stylesheet.

5. Disable subpixel font smoothing on every frontend. Put the following rule on `body` in the global base stylesheet so supported WebKit and macOS Firefox rendering uses grayscale antialiasing consistently:

   ```css
   body {
     -webkit-font-smoothing: antialiased;
     -moz-osx-font-smoothing: grayscale;
   }
   ```

## Stylesheet Ownership

The root stylesheet is an index and global foundation, not a dumping ground.

Use the root stylesheet only for:

* stylesheet imports
* reset / normalize rules
* design tokens
* base typography and element defaults
* global accessibility helpers
* app-wide utilities

Place other CSS by ownership:

| Concern                     | Destination                               |
| --------------------------- | ----------------------------------------- |
| Design values               | `styles/tokens.css`                       |
| Reset/browser normalization | `styles/reset.css`                        |
| Element defaults            | `styles/base.css`                         |
| Small reusable helpers      | `styles/utilities.css`                    |
| Reusable app structure      | `styles/layouts/*.css`                    |
| Reusable UI components      | `styles/components/*.css`                 |
| Route-specific composition  | `styles/pages/*.css`                      |
| Domain-specific UI          | `styles/features/<feature>/*.css`         |

Before creating a stylesheet, check whether an existing stylesheet already owns the concern. Edit the smallest owning file.

## Import Order

Import broad foundations before narrow UI concerns. Keep the root stylesheet limited to global foundations and use cascade layers when the project has a deliberate layer contract:

```css
@layer reset, tokens, base, utilities, layouts, components, pages, features, overrides;

@import "./reset.css" layer(reset);
@import "./tokens.css" layer(tokens);
@import "./base.css" layer(base);
@import "./utilities.css" layer(utilities);
@import "./layouts/shell.css" layer(layouts);
@import "./components/button.css" layer(components);
@import "./pages/dashboard.css" layer(pages);
@import "./features/pos/product-grid.css" layer(features);
```

Do not use import order as a secret override mechanism. If two files fight, move rules to the true owner or reduce specificity.

## Editing Workflow

1. Inspect existing stylesheets and import graph.
2. Identify the owning stylesheet before editing.
3. Move misplaced CSS out of root/global files when touching related code.
4. Write shallow class-based selectors.
5. Add interaction states: hover, focus-visible, active, disabled, loading, empty, and error where applicable.
6. Check responsiveness at narrow, medium, wide, and long-content states.
7. Place reusable components in their actual containers. Check whether a drawer,
   grid column, full-width page, or modal would require geometric rewrites.
8. Verify reduced-motion behavior for animations.

## CSS invariants

Preserve these within the recorded concern:

* The layout works at narrow, medium, and wide widths.
* Components respond to their container when reused in different contexts.
* Moving a component between its supported containers requires little or no CSS
  rewriting.
* Long text does not break the layout.
* Empty, loading, disabled, and error states are styled.
* Keyboard focus is visible.
* Touch targets are large enough.
* Motion respects `prefers-reduced-motion`.
* No ordinary layout relies on absolute positioning.
* No new component/page/feature CSS was dumped into the root stylesheet.

## When to Read References [!important]

* Read `references/layout-patterns.md` when choosing responsive layout primitives or writing modern CSS.
* Read `references/stylesheet-architecture.md` when splitting stylesheets, adding imports, or cleaning root/global CSS.
* Read `references/review-checklist.md` when reviewing CSS changes or preparing final validation notes.
