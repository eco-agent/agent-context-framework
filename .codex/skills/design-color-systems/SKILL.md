---
name: design-color-systems
description: Design web color systems.
---

# Color systems

Preserve established tokens and notation unless the task changes the color system. Do not use color to create product hierarchy or add visible state.

In copied references, `better-accessibility` means `design-accessible-interfaces`.

Do not claim that a generated color is in gamut or a percentage of maximum chroma unless it was computed with a color conversion or gamut library. Without that calculation, provide the algorithm instead of invented values.

## Core principles

### 1. Use a Perceptual Color Space

- **Respect the existing system.** Do not convert notation merely because this skill was loaded. Reuse the project's semantic tokens and authoring format unless the task includes a color-system migration.
- **Perceptual uniformity.** Equal L steps = equal brightness. `oklch(0.5 ...)` is visually mid. HSL's `lightness: 50%` varies wildly by hue.
- **Stable hue.** HSL blue shifts toward purple as lightness changes. OKLCH hue stays constant across the full lightness range.
- **Independent chroma.** Chroma is an absolute measure of colorfulness that doesn't depend on lightness. HSL saturation does.
- **Finite gamut.** Not every oklch value maps to a displayable sRGB color. High-chroma values at certain hues will clip; gamut awareness is required.

### 2. Write and Format OKLCH Consistently

```
oklch(L C H)
oklch(L C H / alpha)
```

| Channel | Range | Description |
| --- | --- | --- |
| L (Lightness) | 0–1 | 0 = black, 1 = white. Perceptually uniform. |
| C (Chroma) | 0–~0.4 | Colorfulness. 0 = gray. Max depends on L and H. |
| H (Hue) | 0–360 | Hue angle in degrees. |
| alpha | 0–1 | Optional transparency. Slash syntax. |

```css
oklch(0.637 0.237 25.331)
oklch(0.8 0.05 200 / 0.5)
```

Use three decimal places for L and C and up to three for H. Drop trailing zeros and format `-0` as `0`. OKLCH is Baseline 2023; when support requirements are unusually broad, check the target project's browser matrix instead of relying on a fixed global-coverage percentage.

## References

- Read [color-conversion.md](references/color-conversion.md) for conversion mechanics.
- Read [palette-generation.md](references/palette-generation.md) when constructing a palette.
- Read [gamut-and-tailwind.md](references/gamut-and-tailwind.md) for gamut and Tailwind v4 integration.
- Read [color-usage.md](references/color-usage.md) for semantic tokens and appearance variants.
