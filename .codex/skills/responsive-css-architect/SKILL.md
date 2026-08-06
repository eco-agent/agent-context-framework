---
name: responsive-css-architect
description: Engineer responsive CSS and stylesheet ownership. Use for layout, overflow, interaction states, container or media queries, Tailwind, or stylesheet structure.
---

# Responsive CSS Architect

Use this skill to create resilient CSS and keep stylesheets organized. Treat CSS as a constraint system: choose the layout primitive, define the responsiveness boundary, protect against overflow, then place styles in the file that owns the concern.

Implement only the CSS concern recorded in the owning task contract. Do not decide product topology, visible content, state ownership, or task completion. Return control after the CSS concern and its applicable states are implemented.

## Operating Rules

1. Classify the UI before writing CSS.

   * Document flow: use normal flow and spacing utilities.
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
   * Is Tailwind clearer beside the markup, or should this become semantic CSS?

3. Prefer intrinsic, content-aware CSS.

   * Use `min()`, `max()`, `clamp()`, `minmax()`, `fit-content`, `auto-fit`, and `auto-fill` when they express the constraint directly.
   * Use logical properties such as `padding-inline`, `margin-block`, `inline-size`, and `block-size`.
   * Use custom properties for design tokens.
   * Use cascade layers for larger projects.

4. Avoid brittle CSS.

   * Do not use fixed widths for page layout unless required by a specific asset or external system.
   * Do not use absolute positioning for ordinary layout.
   * Do not rely on exact text length.
   * Do not hide focus outlines without replacing them.
   * Do not use deep selector chains.
   * Do not add component, page, or feature styles to the root stylesheet.
   * Do not move large Tailwind class strings into JavaScript or TypeScript variant registries.

5. Import `tw-fade` and `shadow-plugin` once after `tailwindcss` in the Tailwind entry stylesheet.

6. Use `tw-fade` on every scrollable overflow. Put `fade-x`, `fade-y`, or `fade` on the element that scrolls.

7. Use `shadow-plugin` for elevated surfaces such as cards, dialogs, popovers, dropdowns, menus, tooltips, sheets, toasts, and command palettes.

   * Do not pair `border-*` or `ring-*` with `shadow-*` on the same elevated element. Replace the pair with one concrete `smooth-shadow-ring-xs`, `smooth-shadow-ring-sm`, `smooth-shadow-ring-md`, `smooth-shadow-ring-lg`, `smooth-shadow-ring-xl`, or `smooth-shadow-ring-2xl` class so its hairline and shadow render as one continuous edge.
   * Do not add a second border or ring to `smooth-shadow-ring-*`.
   * Use `smooth-shadow-{size}` when the elevated surface should have no edge stroke.
   * Default to spacing, color, and elevation for hierarchy. Add borders only when product evidence or a functional state requires a deliberate boundary.
   * Use `smooth-ring-{color}` and `shadow-{color}` when the ring and shadow need independent tints.
   * Keep focus visible with `focus-visible:outline-*`. Ring and shadow utilities compete for the same `box-shadow` property.
   * Keep every plugin class name as a complete static token. Do not construct names such as `smooth-shadow-ring-${size}` dynamically because Tailwind cannot detect them.

8. Disable subpixel font smoothing on every frontend. Put the following rule on `body` in the global base stylesheet so supported WebKit and macOS Firefox rendering uses grayscale antialiasing consistently:

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
* Tailwind imports and CSS-first Tailwind configuration
* reset / normalize rules
* design tokens
* base typography and element defaults
* global accessibility helpers
* app-wide utilities

For Tailwind v4 projects, treat stylesheets as the home for theme tokens, custom utilities, custom variants, and semantic component classes.

Place other CSS by ownership:

| Concern                     | Destination                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| Design values               | `styles/tokens.css` or Tailwind v4 `@theme` definitions               |
| Reset/browser normalization | `styles/reset.css`                                                    |
| Element defaults            | `styles/base.css`                                                     |
| Small reusable helpers      | `styles/utilities.css`                                                |
| Tailwind custom utilities   | `styles/utilities.css` or the project’s Tailwind entry stylesheet     |
| Tailwind custom variants    | the project’s Tailwind entry stylesheet or relevant owning stylesheet |
| Reusable app structure      | `styles/layouts/*.css`                                                |
| Reusable UI components      | `styles/components/*.css`                                             |
| Route-specific composition  | `styles/pages/*.css`                                                  |
| Domain-specific UI          | `styles/features/<feature>/*.css`                                     |

Before creating a stylesheet, check whether an existing stylesheet already owns the concern. Edit the smallest owning file.

## Import Order

In Tailwind v4 projects, preserve Tailwind's native layer order:

```css
@layer theme, base, components, utilities;

@import "tailwindcss";
@import "tw-fade";
@import "shadow-plugin";

/* Contains top-level @theme declarations. */
@import "./tokens.css";

@import "./reset.css" layer(base);
@import "./base.css" layer(base);

@import "./components/button.css" layer(components);
@import "./layouts/shell.css" layer(components);
@import "./pages/dashboard.css" layer(components);
@import "./features/pos/product-grid.css" layer(components);

@import "./utilities.css" layer(utilities);
```

Do not predeclare a competing layer order that omits Tailwind's `theme` layer or places `utilities` before `components`. Add project CSS to the closest native layer unless the repository already has a deliberate, tested layer contract.

Without Tailwind, import broad foundations before narrow UI concerns and avoid relying on undocumented override order.

## Editing Workflow

1. Inspect existing stylesheets and import graph.
2. Identify the owning stylesheet before editing.
3. Move misplaced CSS out of root/global files when touching related code.
4. Write shallow class-based selectors.
5. Add interaction states: hover, focus-visible, active, disabled, loading, empty, and error where applicable.
6. Check responsiveness at narrow, medium, wide, and long-content states.
7. Verify reduced-motion behavior for animations.

## Tailwind Boundary Rule

Use Tailwind for markup-local styling decisions: ad hoc layout, spacing, sizing, typography, color, responsive variants, and simple interaction states that are clearest beside the element they affect.

Use stylesheets for reusable variants, stable component recipes, design-system roles, advanced CSS mechanics, Tailwind theme definitions, custom utilities, custom variants, and styling that would otherwise become JavaScript or TypeScript data.

Do not hide large Tailwind strings inside `cva`, `clsx`, `cn`, variant maps, or conditional class trees for core styling. Either keep Tailwind visible in the markup or promote the styling into a stylesheet with semantic class names.

Do not use `@apply` as the default escape hatch for moving Tailwind into CSS. Prefer normal CSS, Tailwind v4 CSS-first theme definitions, custom utilities, custom variants, or semantic component classes.

Default boundary:

```txt
Tailwind near markup.
Normal CSS for variants.
Logic selects names.
CSS owns systems.
```

### Use Tailwind Directly When

* The class list describes one element clearly.
* The style is local to the component.
* The markup remains readable.
* The class list is not duplicated heavily.
* Variants are minimal.
* Conditional classes represent genuine runtime state.

```tsx
<button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2">
  Save
</button>
```

```tsx
<div className={isActive ? "border-blue-500" : "border-slate-200"} />
```

### Use Semantic Stylesheet Classes When

* The same long class string appears repeatedly.
* Variants require large maps or branching logic.
* The component file is becoming mostly styling data.
* Class composition hides layout intent from the markup.
* The component has a stable design-system role: button, card, dialog, nav item, shell, toolbar.
* The styling needs container queries, cascade layers, `:has()`, keyframes, custom properties, third-party overrides, print rules, custom utilities, or custom variants.

Prefer stylesheet-owned variants written as normal CSS:

```css
@layer components {
  .button {
    display: inline-flex;
    min-block-size: 2.75rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    padding-inline: var(--space-3);
    font-weight: 650;
  }

  .button:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  .button:disabled,
  .button[aria-disabled="true"] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .button--primary {
    background: var(--color-accent);
    color: var(--color-accent-contrast);
  }

  .button--secondary {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  .button--danger {
    background: var(--color-danger);
    color: var(--color-danger-contrast);
  }
}
```

Then let component logic select semantic names:

```tsx
<button className={`button button--${variant}`}>{children}</button>
```

Avoid turning component files into styling registries:

```tsx
const variants = {
  primary: "...large Tailwind string...",
  secondary: "...large Tailwind string...",
  danger: "...large Tailwind string...",
};
```

Avoid variant APIs when they mostly exist to move styling decisions into TypeScript:

```tsx
<Button variant="primary" size="lg" tone="success" density="compact" />
```

## Tailwind v4 CSS-First Patterns

For Tailwind-heavy work, delegate documentation lookup to one bounded native subagent:

1. Resolve this skill's directory from its source locator.
2. Generate the bounded task prompt:

   ```text
   python <skill-root>/scripts/tailwind_doc_context.py --task "<specific styling task>" --context "<design and implementation context>" --sync-if-missing
   ```

3. Pass the generated prompt unchanged to a fresh native subagent. Do not launch `codex exec` or another CLI agent.
4. Continue local inspection while it runs, then treat its result as documentation context rather than design authority.

Do not assume `scripts/` exists at the project root. If native subagents are unavailable, follow `references/tailwind-v4-operating-model.md`; synchronize the excluded generated cache from its retained manifest when missing, read only the relevant metadata, then report the fallback.

When a project uses Tailwind v4, prefer CSS-first configuration over JavaScript styling abstractions.

Use `@theme` for shared design tokens that should generate Tailwind utilities and remain available as CSS variables:

```css
@theme {
  --color-accent: oklch(0.56 0.18 255);
  --color-accent-contrast: oklch(1 0 0);
  --color-surface-muted: oklch(0.96 0.01 255);
  --color-danger: oklch(0.58 0.22 29);
  --color-danger-contrast: oklch(1 0 0);

  --radius-md: 0.75rem;
  --space-3: 1rem;
}
```

Use custom utilities for reusable low-level styling primitives, not for full component recipes:

```css
@utility content-grid {
  display: grid;
  grid-template-columns:
    [full-start] minmax(1rem, 1fr)
    [content-start] minmax(0, 72rem)
    [content-end] minmax(1rem, 1fr)
    [full-end];
}

@utility content-grid-child {
  grid-column: content;
}

@utility full-bleed {
  grid-column: full;
}
```

Use custom variants when a repeated selector condition is clearer as a named variant:

```css
@custom-variant hocus (&:hover, &:focus-visible);
```

Then keep usage near the markup:

```tsx
<a className="text-accent underline-offset-4 hocus:underline">
  View report
</a>
```

Do not create custom utilities, custom variants, or semantic classes merely to avoid writing a short, readable Tailwind class list once.

## Component Styling Policy

For reusable components, pick one styling ownership model and keep it consistent.

Use Tailwind-owned markup when the component is simple and the classes are readable:

```tsx
export function EmptyState() {
  return (
    <section className="grid place-items-center rounded-xl border border-dashed p-8 text-center">
      <div className="grid gap-2">
        <h2 className="text-lg font-semibold">No results</h2>
        <p className="max-w-prose text-sm text-slate-500">
          Try adjusting your filters or search terms.
        </p>
      </div>
    </section>
  );
}
```

Use CSS-owned variants when the component has a stable design-system role:

```tsx
export function Button({ variant = "primary", children, ...props }) {
  return (
    <button className={`button button--${variant}`} {...props}>
      {children}
    </button>
  );
}
```

Do not create a large JavaScript or TypeScript variant API just to hide styling:

```tsx
const buttonStyles = {
  base: "...large Tailwind string...",
  variants: {
    tone: {
      primary: "...large Tailwind string...",
      danger: "...large Tailwind string...",
    },
    size: {
      sm: "...large Tailwind string...",
      md: "...large Tailwind string...",
      lg: "...large Tailwind string...",
    },
  },
};
```

If the variant system becomes the primary styling surface, move the styling to CSS and let logic choose semantic class names.

## CSS invariants

Preserve these within the recorded concern:

* The layout works at narrow, medium, and wide widths.
* Components respond to their container when reused in different contexts.
* Long text does not break the layout.
* Empty, loading, disabled, and error states are styled.
* Keyboard focus is visible.
* Touch targets are large enough.
* Motion respects `prefers-reduced-motion`.
* No ordinary layout relies on absolute positioning.
* No new component/page/feature CSS was dumped into the root stylesheet.
* Tailwind class strings are either visible near markup or promoted into semantic CSS.
* Large styling variant maps were not introduced in JavaScript or TypeScript.

## When to Read References [!important]

* Read `references/layout-patterns.md` when choosing responsive layout primitives or writing modern CSS.
* Read `references/stylesheet-architecture.md` when splitting stylesheets, adding imports, or cleaning root/global CSS.
* Read `references/review-checklist.md` when reviewing CSS changes or preparing final validation notes.
* Read `references/tailwind-doc-subagent.md` before modifying or interpreting the Tailwind documentation helper.
