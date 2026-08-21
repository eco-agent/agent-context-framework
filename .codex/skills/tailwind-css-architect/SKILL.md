---
name: tailwind-css-architect
description: Structure Tailwind CSS v4 styling when a frontend explicitly uses Tailwind.
---

# Tailwind CSS architect

Use this skill when the owning project contract selects Tailwind CSS. Tailwind
utilities are the normal representation for every style Tailwind can express
cleanly. Keep those decisions near markup or in the project's established
component recipe. Use `responsive-css-architect` to decide layout relationships
and responsive behavior, not to move utility-expressible styling into raw CSS.

Implement only the Tailwind concern recorded in the owning task contract. Do not decide product topology, visible content, state ownership, or task completion. Return control after the Tailwind concern and its applicable states are implemented.

## Operating rules

1. State the Tailwind boundary before editing.

   * Use utilities beside markup for layout, spacing, sizing, typography, color,
     responsive variants, and interaction states.
   * Keep an existing component library's utility recipe and variant mechanism.
     Do not replace them with a parallel stylesheet API.
   * Use CSS files for Tailwind directives such as `@theme`, `@utility`, and
     `@custom-variant`. Use ordinary CSS rules only for base rules, a selector,
     property, or at-rule Tailwind cannot represent, or third-party markup that
     cannot receive utility classes.
   * Repetition, a long class string, or a stable component role is not enough
     reason to move styling into raw CSS.
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

## Stylesheet ownership

The root stylesheet is an index and global foundation, not a dumping ground. It may own imports, CSS-first configuration, reset/normalize rules, design tokens, base typography and element defaults, global accessibility helpers, and app-wide utilities.

For Tailwind v4 projects, stylesheets own the exceptions named above. Before
creating a rule, confirm that Tailwind cannot express it clearly in markup or in
the project's existing component recipe. Name the unsupported selector,
property, at-rule, or third-party constraint, then edit the smallest owning file.

| Raw CSS exception | Destination |
| --- | --- |
| Design values | `styles/tokens.css` or Tailwind v4 `@theme` definitions |
| Reset or browser normalization | `styles/reset.css` |
| Element defaults | `styles/base.css` |
| A reusable low-level utility | `styles/utilities.css` or the Tailwind entry stylesheet |
| A repeated selector condition | the Tailwind entry stylesheet or the closest owning stylesheet |
| Third-party markup | the closest integration or component stylesheet |
| Unsupported CSS mechanics | the closest component, feature, or layout owner |

## Import order

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
@import "./utilities.css" layer(utilities);
```

Do not predeclare a competing layer order that omits the `theme` layer or places `utilities` before `components`. Add project CSS to the closest native layer unless the repository already has a deliberate, tested layer contract.

## Tailwind boundary rule

Use utilities when Tailwind can express the style, including repeated component
recipes and genuine runtime variants. Keep a plain recipe beside the component.
When the project or its component library already uses `cva`, `clsx`, `cn`, or a
similar helper, preserve that mechanism for a finite variant and state API.

```tsx
<button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2">
  Save
</button>
```

```tsx
<div className={isActive ? "border-blue-500" : "border-slate-200"} />
```

Do not create a variant abstraction merely to abbreviate one class string. Keep
the finite choices legible and colocated with their component. If conditional
styling becomes open-ended or mirrors arbitrary CSS properties, simplify the
component API instead of moving the same complexity into a stylesheet.

Use raw CSS only when the boundary above permits it. Do not use `@apply` or a
semantic class as an escape from utility markup. A component name such as
button, dialog, navigation item, shell, or toolbar does not create a CSS
exception by itself.

## Tailwind v4 CSS-first patterns

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

## Component styling policy

Reuse the project's component library before creating a new component recipe.
Preserve the library's markup contract, behavior, accessibility, and established
variant helper. Add utilities through the extension points it provides.

Keep project-owned component styling in utilities:

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

For a component with a finite public variant API, use the repository's existing
recipe helper. If the repository has none, a small colocated map is acceptable.
Do not create a second variant system, and do not replace a library recipe with
hand-written CSS.

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
* Styles Tailwind can express remain Tailwind utilities.
* Repetition and class-string length did not cause a move into raw CSS.
* Existing component-library recipes and variant helpers remain in use.
* Every new raw CSS rule meets one named exception from this skill.

## When to read references [!important]

* Read `references/tailwind-doc-subagent.md` before modifying or interpreting the documentation helper.
* Read `references/tailwind-v4-operating-model.md` when the documentation helper or cache is unavailable.
