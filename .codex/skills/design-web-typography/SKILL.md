---
name: design-web-typography
description: Design web typography systems.
---

# Web typography

Match the established styling and type systems. Do not introduce a second styling approach.

In copied references, `better-accessibility` means `design-accessible-interfaces`, `better-colors` means `design-color-systems`, and `better-layout` means `responsive-css-architect`.

## References

- Read [variable-fonts-and-opentype.md](references/variable-fonts-and-opentype.md) for axes, weights, synthesis, and OpenType features.
- Read [spacing-and-sizing.md](references/spacing-and-sizing.md) for type scales, heading rendering, line height, and letter spacing.
- Read [wrapping-and-punctuation.md](references/wrapping-and-punctuation.md) for measure, wrapping, truncation, punctuation, and bidi text.
- Read [details-and-accessibility.md](references/details-and-accessibility.md) for underlines, selection, forms, and text sizing.

## Core principles

### 1. Serve the Right Format

Use `.woff2` (Brotli compression, broadly supported) on the web. `.woff` is a fallback only for very old browsers; `.ttf` and `.otf` are raw desktop formats with no web compression. How the files are loaded is the project's own concern, this skill does not prescribe it.

### 2. Properties Over Raw Tags

When a CSS property exists, use it. `font-weight: 650` instead of `font-variation-settings: "wght" 650`, `font-optical-sizing: auto` instead of `"opsz"`, `font-variant-numeric: tabular-nums` instead of `font-feature-settings: "tnum" 1`. Properties keep working when a non-variable fallback renders. Reserve the raw-tag properties for custom axes (`"GRAD" 80`) and niche features (`"ss01" 1`) that have no property of their own.

### 3. Load Intended Weights and Styles

Browsers may synthesize a requested weight or style that the active family does not provide. Prefer loading the faces the design actually uses. Set `font-synthesis: none` only after verifying that every required bold, italic, small-cap, superscript, and subscript form remains visually distinct across the complete fallback stack; disabling synthesis is not a diagnostic and must not erase emphasis.

### 5. Use a Type Scale with Semantic Names

Define a small set of sizes and deviate from it as little as possible. Hard-coded sizes without a system break down at scale. For solo projects, default names like `text-sm` work fine as long as the usage rules are clear. On a team, name sizes by use (`text-body-sm`), not by size, so the rules stay consistent.

### 6. Heading Sizes Descend with Level

Within a coherent page hierarchy, map heading levels to descending steps of the type scale: a visually subordinate heading should not accidentally overpower its parent. Adjacent levels may share a size toward the small end of the scale as long as weight or spacing keeps them distinct. Pick semantic heading elements according to `better-accessibility`; this skill controls only their visual treatment.

### 7. Line-Height by Role

Headings tighter, around `1.1`. Body copy `1.5` to `1.6`. Prefer unitless values so line-height scales with the font size; fixed values like `24px` do not. Tight line-height is for short text: anything that wraps to three or more lines needs at least `1.4`, even in height-constrained rows.

### 8. Letter-Spacing by Size

Large headings often look better with slightly negative letter-spacing. Small uppercase labels need a little positive letter-spacing so letters do not feel crowded. Body copy at reading sizes needs neither.

### 9. Cap the Measure

Long lines make it hard for the eye to find the next line. Cap long-form text around 60–75 characters per line. Any unit works: `65ch` measures characters directly, and a pixel or rem cap is just as good: at a `16px` body size the range lands roughly between `560px` and `680px` depending on the font, so Tailwind's `max-w-xl` or `max-w-2xl` fit. What matters is that a cap exists and the resulting line length sits in range.

### 10. Wrap Deliberately

`text-wrap: balance` distributes text evenly across lines: use it on headings. `text-wrap: pretty` avoids leaving a single short word on the final line: use it on descriptions. Skip both in long-form text: browsers ignore `balance` past a few lines anyway, and evening out a whole paragraph wastes space and makes it harder to read. `overflow-wrap: break-word` where long words, links or IDs could escape the container. `white-space: nowrap` on labels and badges where a line break looks broken.

### 11. Tabular Numbers on Changing Values

Digits have different widths by default, so timers, counters and prices shift layout as they update. Apply `font-variant-numeric: tabular-nums` to any value that changes.

### 12. Truncate Without Losing Content

Single line: `text-overflow: ellipsis` with `overflow: hidden` and `white-space: nowrap`. Multiple lines: `line-clamp`. Truncation hides content, so if the missing text matters, keep the full value reachable in a tooltip or expanded view.

### 14. Underlines from the Font

Default underlines sit wherever the browser decides. Pull position and thickness from the font's own metrics with `text-underline-position: from-font` and `text-decoration-thickness: from-font`, or tune manually with `text-decoration-thickness`, `text-underline-offset` and `text-decoration-skip-ink`. `text-decoration-style` draws the line dotted, dashed or wavy; a dotted underline is a common hint that a word carries extra information, like an abbreviation or a defined term. Unless the only thing animating is a color change, build the underline as a separate element instead of using `text-decoration`: color is the only part of a real underline that animates reliably.

### 15. Inputs at 16px on Mobile

iOS Safari zooms the whole page when an input's text is smaller than `16px`. Keep input text at `16px` on mobile viewports (`text-base sm:text-sm`). Avoid the `maximum-scale=1` viewport meta: Safari ignores it for pinch zoom, but every other browser honors it and blocks zooming, which fails WCAG.

### 16. Size and Contrast Floors

Start long-form body text near the browser default of `16px`, then judge it in the actual typeface, measure, platform, and product density. UI text can go smaller: `14px` is a useful starting point for inputs and menus (inputs still need `16px` on mobile, see principle 15), `13px` for captions, rarely below `12px`. When text appears low-contrast, use `better-colors` to measure the rendered pair and `better-accessibility` to classify the requirement; do not change colors unless asked.

### 18. Language and Bidi Behavior

Set `lang` so browsers and assistive technology choose the right pronunciation, quotes, and hyphenation. Set `dir` at the document or content boundary where direction changes, preserve digit order, and use `<bdi>` for isolated mixed-direction values when needed. Spatial mirroring and logical CSS properties belong to `better-layout`.

### 19. Keep Useful Text Selectable

`::selection` can carry brand into the reading experience when the selected combination stays legible. Keep text selectable by default. Use `user-select: none` only on a specific draggable or gesture-driven surface where accidental selection demonstrably interferes with the interaction; never disable selection across the interface or merely because a button label can be highlighted.
