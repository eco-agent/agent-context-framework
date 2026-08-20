---
name: tailwind-css-architect
description: Structure Tailwind CSS v4 styling when a frontend explicitly uses Tailwind.
---

# Tailwind CSS Architect

Use this skill when the owning project contract selects Tailwind CSS. Keep utility-class decisions near markup, keep reusable recipes in stylesheets, and preserve the neutral layout and stylesheet ownership rules supplied by `responsive-css-architect`.

Implement only the Tailwind concern recorded in the owning task contract. Do not decide product topology, visible content, state ownership, or task completion. Return control after the Tailwind concern and its applicable states are implemented.

## Operating Rules

1. State the Tailwind boundary before editing.

   * Use utilities beside markup for local layout, spacing, sizing, typography, color, responsive variants, and simple interaction states.
   * Use stylesheets for reusable variants, stable component recipes, design-system roles, advanced CSS mechanics, theme definitions, custom utilities, and custom variants.
   * Keep every plugin class name as a complete static token. Do not construct utility names dynamically.

2. Import `tw-fade` and `shadow-plugin` once after `tailwindcss` in the project entry stylesheet.

3. Use `tw-fade` on every scrollable overflow. Put `fade-x`, `fade-y`, or `fade` on the element that scrolls.

4. Use `shadow-plugin` for elevated surfaces such as cards, dialogs, popovers, dropdowns, menus, tooltips, sheets, toasts, and command palettes.

   * Do not pair `border-*` or `ring-*` with `shadow-*` on the same elevated element. Replace the pair with one concrete `smooth-shadow-ring-xs`, `smooth-shadow-ring-sm`, `smooth-shadow-ring-md`, `smooth-shadow-ring-lg`, `smooth-shadow-ring-xl`, or `smooth-shadow-ring-2xl` class so its hairline and shadow render as one continuous edge.
   * Do not add a second border or ring to `smooth-shadow-ring-*`.
   * Use `smooth-shadow-{size}` when the elevated surface should have no edge stroke.
   * Default to spacing, color, and elevation for hierarchy. Add borders only when product evidence or a functional state requires a deliberate boundary.
   * Use `smooth-ring-{color}` and `shadow-{color}` when the ring and shadow need independent tints.
   * Keep focus visible with `focus-visible:outline-*`. Ring and shadow utilities compete for the same `box-shadow` property.

## Stylesheet Ownership

The root stylesheet is an index and global foundation, not a dumping ground. It may own imports, CSS-first configuration, reset/normalize rules, design tokens, base typography and element defaults, global accessibility helpers, and app-wide utilities.

For Tailwind v4 projects, treat stylesheets as the home for theme tokens, custom utilities, custom variants, and semantic component classes. Before creating a stylesheet, check whether an existing stylesheet already owns the concern and edit the smallest owning file.

| Concern                     | Destination                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| Design values               | `styles/tokens.css` or Tailwind v4 `@theme` definitions               |
| Reset/browser normalization | `styles/reset.css`                                                    |
| Element defaults            | `styles/base.css`                                                     |
| Small reusable helpers      | `styles/utilities.css`                                                |
| Custom utilities            | `styles/utilities.css` or the Tailwind entry stylesheet                |
| Custom variants             | the Tailwind entry stylesheet or relevant owning stylesheet            |
| Reusable app structure      | `styles/layouts/*.css`                                                |
| Reusable UI components      | `styles/components/*.css`                                             |
| Route-specific composition  | `styles/pages/*.css`                                                  |
| Domain-specific UI          | `styles/features/<feature>/*.css`                                     |

## Import Order

In Tailwind v4 projects, preserve the native layer order:

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

Do not predeclare a competing layer order that omits the `theme` layer or places `utilities` before `components`. Add project CSS to the closest native layer unless the repository already has a deliberate, tested layer contract.

## Tailwind Boundary Rule

Use utilities directly when the class list describes one element clearly, remains readable, is not duplicated heavily, has minimal variants, and conditional classes represent genuine runtime state.

```tsx
<button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2">
  Save
</button>
```

```tsx
<div className={isActive ? "border-blue-500" : "border-slate-200"} />
```

Use semantic stylesheet classes when the same long class string repeats, variants require large maps or branching logic, markup is becoming styling data, or the component has a stable design-system role such as button, card, dialog, nav item, shell, or toolbar.

Do not hide large utility strings inside `cva`, `clsx`, `cn`, variant maps, or conditional class trees for core styling. Keep utilities visible near markup or promote the styling into semantic stylesheet classes. Do not use `@apply` as the default escape hatch; prefer normal CSS, CSS-first theme definitions, custom utilities, custom variants, or semantic component classes.

## Tailwind v4 CSS-First Patterns

For Tailwind-heavy work, delegate documentation lookup to one bounded native subagent:

1. Resolve this skill's directory from its source locator.
2. Generate the bounded task prompt:

   ```text
   python <skill-root>/scripts/tailwind_doc_context.py --task "<specific styling task>" --context "<design and implementation context>" --sync-if-missing
   ```

3. Pass the generated prompt unchanged to a fresh native subagent. Do not launch `codex exec` or another CLI agent.
4. Continue local inspection while it runs, then treat its result as documentation context rather than design authority.

If native subagents are unavailable, follow `references/tailwind-v4-operating-model.md`; synchronize the excluded generated cache from its retained manifest when missing, read only the relevant metadata, then report the fallback.

When a project uses Tailwind v4, prefer CSS-first configuration over JavaScript styling abstractions. Use `@theme` for shared design tokens that should generate utilities and remain available as CSS variables:

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

Use custom utilities for reusable low-level styling primitives, not full component recipes:

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

Do not create custom utilities, custom variants, or semantic classes merely to avoid writing a short, readable utility list once.

## Component Styling Policy

For reusable components, pick one styling ownership model and keep it consistent.

Use utility-owned markup when the component is simple and the classes are readable:

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

Use CSS-owned variants when the component has a stable design-system role, and let component logic select semantic names:

```tsx
export function Button({ variant = "primary", children, ...props }) {
  return (
    <button className={`button button--${variant}`} {...props}>
      {children}
    </button>
  );
}
```

Avoid turning component files into styling registries or creating large JavaScript/TypeScript variant APIs that only hide styling decisions. If the variant system becomes the primary styling surface, move the styling to CSS and let logic choose semantic class names.

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
* Utility class strings are either visible near markup or promoted into semantic CSS.
* Large styling variant maps were not introduced in JavaScript or TypeScript.

## When to Read References [!important]

* Read `references/tailwind-doc-subagent.md` before modifying or interpreting the documentation helper.
* Read `references/tailwind-v4-operating-model.md` when the documentation helper or cache is unavailable.
