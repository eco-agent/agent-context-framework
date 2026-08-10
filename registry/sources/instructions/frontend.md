## Frontend

- Never fill decisions from model priors or generic familiar UI.
- For substantial topology, shells, or replacement workflows, use `adopt-established-product`: pin licensed source, copy or adapt its implementation first, preserve topology and interactions, then make only the required delta. A prose description or independent look-alike is not adoption when the license permits reuse.
- Established CSS/accessibility/state/interaction repairs need no precedent research.
- Do not use text to frame text/elements or use cards for hierarchy. Use one primary surface.
- Invent no content, controls, navigation, summaries, or features. Omit decorative eyebrows, kickers, overlines, pills, badges, hero copy, fake metrics, and card grids unless the user, product contract, data, existing interface, or pinned source requires them in that semantic role.
- Preserve visible-copy and heading roles from their evidence. Moving precedent text into a new hierarchy position is a deviation, not styling.
- Treat visual assets as first-class implementation inputs. Preserve required product, brand, and precedent assets first. Otherwise, create code-native SVG for icons, vectors, patterns, and animated artwork, and use the `imagegen` skill for raster textures or illustration. Do not approximate artwork with nested elements, CSS gradients, pseudo-elements, or generic glyphs when a purpose-built asset would serve the recorded role better.
- Prefer a restrained animated SVG when motion adds state, feedback, direction, or product character. Provide a static `prefers-reduced-motion` result. An invented asset may fulfill an evidenced visual role, but it must not invent product meaning, content, controls, navigation, or features.
- For a muted SVG with overlapping strokes or paths, keep `currentColor` fully opaque and apply CSS `opacity` once to the root `<svg>` or a wrapper around the complete icon. Do not use alpha-bearing `color`, `fill`, `stroke`, `fill-opacity`, or `stroke-opacity` for this effect because each paint operation compounds at intersections. Do not replace the neutral with a background-specific solid tint.
- On every frontend, set `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` on `body` in the global base stylesheet.
- Default to minimalism; use claymorphism, glassmorphism, or neumorphism only when specified.
