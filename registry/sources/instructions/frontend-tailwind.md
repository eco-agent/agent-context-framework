## Tailwind frontend

Select these instructions only when the project contract names Tailwind CSS as
the frontend styling system.

Use `skill-tailwind-css-architect` for Tailwind configuration, utility
boundaries, and component styling. Tailwind utilities are the normal
representation for styles Tailwind can express. `skill-responsive-css-architect`
decides layout relationships and responsive behavior, but it does not move
utility-expressible styling into raw CSS.

Import `tw-fade` and `shadow-plugin` once, after `tailwindcss`, in the Tailwind
entry stylesheet. Put `tw-fade` on the element that owns scrollable overflow,
and choose `fade-x`, `fade-y`, or `fade` from the actual scroll axis.

Use `shadow-plugin` for elevated surfaces. Replace a border or ring combined
with a shadow by one `smooth-shadow-ring-*` class. Use `smooth-shadow-*` when the
surface needs no edge stroke. Preserve keyboard focus with
`focus-visible:outline-*`.
