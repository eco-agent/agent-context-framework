## Frontend

Do not make product decisions from model priors or a familiar generic interface.
Before substantial frontend implementation, use `frontend-design-discipline` to
settle the product representation from the user's tasks and the states you can
observe. Treat schemas and the current implementation as evidence, not as the
default interface.

Treat desktop and mobile as projections of the same product model. For each
mobile surface, record whether the correct treatment is `preserve`, `adapt`,
`recompose`, `split`, `replace`, or `remove`. Preservation is not the default.

When the task changes substantial topology, an application shell, or a
replacement workflow, use `adopt-established-product`. Pin licensed source,
copy or adapt its implementation, preserve its topology and interactions, then
make only the required change. If the license permits reuse, a prose description
or an independently built look-alike does not count as adoption. Established
repairs to CSS, accessibility, state, or interaction need no precedent search.

Use one primary surface. Do not use cards to create hierarchy. Do not add text
whose only purpose is to frame other text or elements. Do not invent content,
controls, navigation, summaries, or features. Decorative eyebrows,
kickers, overlines, pills, badges, hero copy, fake metrics, and card grids belong
only where the user, product contract, data, existing interface, or pinned source
gives them that role.

Preserve the evidenced role of visible copy and headings. Moving precedent text
to a different place in the hierarchy changes the product; it is not a styling
choice.

Treat visual assets as implementation inputs. Preserve required product, brand,
and precedent assets first. Otherwise, create code-native SVG for icons,
vectors, patterns, and animated artwork. Use `imagegen` for raster textures and
illustration. When a purpose-built asset fits the recorded role, do not imitate
it with nested elements, CSS gradients, pseudo-elements, or generic glyphs.

Use restrained SVG animation when motion explains state, feedback, direction,
or product character. Always provide a static `prefers-reduced-motion` result.
An invented asset may fill an evidenced visual role, but it may not invent
product meaning, content, controls, navigation, or features.

For a muted SVG with overlapping strokes or paths, leave `currentColor` fully
opaque. Apply CSS `opacity` once to the root `<svg>` or to a wrapper around the
whole icon. Alpha-bearing `color`, `fill`, `stroke`, `fill-opacity`, and
`stroke-opacity` compound where paint operations overlap, so do not use them for
this effect. Do not replace the neutral with a solid tint chosen for one
background.

Every frontend must set `-webkit-font-smoothing: antialiased` and
`-moz-osx-font-smoothing: grayscale` on `body` in the global base stylesheet.
Default to minimalism. Use claymorphism, glassmorphism, or neumorphism only when
specified.
