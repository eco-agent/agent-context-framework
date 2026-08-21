# Spacing and sizing

A sensible scale and comfortable spacing do more for typography than any effect.

## Units

| Unit | Behavior |
| --- | --- |
| `px` | Fixed |
| `em` | Scales with the current font size |
| `rem` | Scales with the root font size |
| `%` on `font-size` | Relative to the parent's font size, behaves like `em` |

## Type scale

A small set of predefined sizes used across a product, deviated from as little as possible. Hard-coding sizes without a system breaks down at scale.

```css
:root {
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
}
```

There are many existing scales to pick from, or define a custom one. The Tailwind type scale (`text-xs` through `text-9xl`, each class pairing a size with a matching line height) is a solid ready-made choice.

For solo projects the default names work fine as long as there are clear rules for where each size is used. On a team, give sizes semantic names: `text-sm` tells you the size but not the use; `text-body-sm` keeps sizes consistent with clear usage rules.

A role-based scale pairs each size with its line-height and weight, so a role is
one decision instead of three. Preserve the project's existing scale. Use the
following restrained example only when the project has no type roles:

| Role | Size | Line-height | Weight |
| --- | --- | --- | --- |
| Display | `2.25rem` (36px) | `1.1` | `600` |
| Title | `1.5rem` (24px) | `1.2` | `600` |
| Heading | `1.125rem` (18px) | `1.3` | `600` |
| Body | `1rem` (16px) | `1.5` | `400` |
| Caption | `0.8125rem` (13px) | `1.4` | `400` |

Emphasis within a role is one weight step up (`400` → `500`), not a size change.

## Heading hierarchy

Assign each heading level to a descending step of the scale, so hierarchy comes from the scale instead of one-off sizes:

```css
h1 { font-size: var(--text-2xl); }
h2 { font-size: var(--text-xl); }
h3 { font-size: var(--text-lg); }
```

In Tailwind the same mapping is utility classes per level (`text-2xl`, `text-xl`, `text-lg`), typically centralized in a component or `@layer base` rather than repeated inline.

When reviewing a page, compare the named roles and computed size of headings
within each semantic section. A child that accidentally renders more prominently
than its parent breaks the visual hierarchy. Deep levels may share a size when
the scale runs out of comfortable steps, as long as weight and surrounding space
keep them distinct. A heading should not be smaller than body text unless the
approved type system defines it as a label-style overline.

Heading semantics and outline quality belong to `better-accessibility`. Pick the element from the document structure, then use this skill to make that structure visually legible; never pick a heading element for its browser-default size.

## Kerning and letter-spacing

- **Kerning** adjusts specific pairs like `AV` or `Ye`. It is built into the font
  and browsers apply it automatically. Leave `font-kerning` at `auto` or
  `normal` unless an approved type system requires otherwise.
- **`letter-spacing`** adds the same space between every character:
  - Ordinary headings and body copy use `normal`.
  - A named display role may use the value defined by the established type
    system or approved source.
  - A named uppercase-label role may use one positive tracking token.

```css
/* The role owns the exception. Individual headings do not override it. */
.type-label-uppercase {
  text-transform: uppercase;
  letter-spacing: var(--type-label-tracking);
}
```

Do not use arbitrary values such as `tracking-[-0.023em]` or local
`letter-spacing` declarations to tune one heading. Do not imitate kerning with
tracking. If the hierarchy is weak, choose an established role or a loaded
weight first.

## Line-height

Line-height belongs to the type role. Tailwind text-size utilities already pair
a size with a line-height. Keep that pair unless rendered text clips, collides,
or becomes hard to read at its supported widths.

When a role needs a correction, choose one conventional unitless value and
change the role definition. Do not add `leading-[0.98273]` or another arbitrary
per-element value. An exact value is acceptable only when an approved source
specifies it or a measured rendering defect requires it.

Anything that wraps to three or more lines needs body-role leading, even in
height-constrained places such as list rows and cards. Fix vertical alignment
with layout and control sizing, not line-height.

```css
/* Bad: card description at heading leading */
.card-description { line-height: 1.1; }
```

Use the product's existing body role on the description instead of adding a
local line-height declaration.

## Text trimming with text-box

Fonts reserve space above and below the letters, which is why text sits slightly too low in buttons and badges. `text-box` trims it. Two parts: which edges to trim (`trim-both`, `trim-start`, `trim-end`) and where:

| Keyword | Trims at |
| --- | --- |
| `cap` | The cap height (top) |
| `alphabetic` | The baseline (bottom) |
| `text` | The font's own text edge, keeping room for descenders |

```css
/* trim top and bottom */
.badge {
  text-box: trim-both cap alphabetic;
}

/* trim only the top */
.heading {
  text-box: trim-start cap;
}

/* trim only the bottom */
.label {
  text-box: trim-end alphabetic;
}
```

Supported in Chromium (133+) and Safari (18.2+), not yet Firefox; treat it as progressive enhancement, where unsupported browsers keep the default leading.
