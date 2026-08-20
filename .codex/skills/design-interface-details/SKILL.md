---
name: design-interface-details
description: Implement settled icons, SVG assets, optical alignment, depth, and transitions without changing product structure.
---

# Interface details

Preserve the selected visual style and established component system. Do not create topology, cards, elevation, copy, or motion.

Use `choose-react-animation` for animation selection. Use `responsive-css-architect` for CSS ownership and implementation. In copied references, `better-accessibility` means `design-accessible-interfaces`.

## Core principles

### Asset-first composition

Preserve required product, brand, and precedent assets. Otherwise, create a code-native SVG for an icon, vector illustration, pattern, or self-contained animated asset. Use the `imagegen` skill when the required output is a bitmap texture, illustration, photo-like image, or raster variant from an accepted reference.

Do not rebuild artwork from nested elements, CSS gradients, pseudo-elements, emoji, or generic glyphs. Let CSS place, size, color, and respond to the asset. Let the asset own the artwork. Use `choose-react-animation` for animated SVG and provide a static reduced-motion result.

Create only the asset role recorded in the frontend specification. Do not introduce new meaning, copy, actions, navigation, or features through the asset.

### 1. Concentric Border Radius

Outer radius = inner radius + padding. Mismatched radii on nested elements is the most common thing that makes interfaces feel off.

### 2. Optical Over Geometric Alignment

When geometric centering looks off, align optically. Buttons with icons, play triangles, and asymmetric icons all need manual adjustment.

### 8. Image Outlines

Add a subtle `1px` outline with low opacity to images for consistent depth. The color must be pure black in light mode (`oklch(0 0 0 / 0.1)`) and pure white in dark mode (`oklch(1 0 0 / 0.1)`), never a near-black like slate, zinc, or any tinted neutral. A tinted outline picks up the surface color underneath it and reads as dirt on the image edge.

### 11. Never Use `transition: all`

Always specify exact properties: `transition-property: scale, opacity`. Tailwind's `transition-transform` covers `transform, translate, scale, rotate`.

### 12. Use `will-change` Sparingly

Only for `transform`, `opacity`, `filter`, the properties the GPU can composite. Never use `will-change: all`. Only add when you notice first-frame stutter.

### 13. Match Icon Stroke to Text Weight

An icon next to text carries the text's optical weight: `1.5px` stroke beside regular (400) text, `2px` beside semibold (600). Use one stroke weight per icon set. Never mix libraries on one surface.

### 14. One SVG, Recolored per State

Icons use `currentColor` and get their states (hover, selected, disabled) from CSS color and opacity, never from separate assets. Use the outline variant by default. Use the fill variant for the active state.

### 15. Composite Muted Icon Opacity Once

For an SVG with overlapping strokes, paths, or shapes, keep `currentColor` fully opaque and apply CSS `opacity` to the root `<svg>` or a wrapper around the complete icon. Do not put alpha in `color`, `fill`, `stroke`, `fill-opacity`, or `stroke-opacity` for this effect. Per-paint alpha compounds at intersections. Element opacity composites the completed icon once. Keep the neutral portable across backgrounds instead of replacing it with a background-specific solid tint.

## References

- Read [icons.md](references/icons.md) for icon sizing, state, rendering, and RTL details.
- Read [performance.md](references/performance.md) when changing transitions or `will-change`.
