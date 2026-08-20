## Tailwind frontend

Select these instructions only when the project contract names Tailwind CSS as
the frontend styling system.

Use `skill-tailwind-css-architect` for Tailwind configuration, utility
boundaries, and component styling. Neutral layout and stylesheet ownership stay
with `skill-responsive-css-architect`.

Import `tw-fade` and `shadow-plugin` once, after `tailwindcss`, in the Tailwind
entry stylesheet. Put `tw-fade` on the element that owns scrollable overflow,
and choose `fade-x`, `fade-y`, or `fade` from the actual scroll axis.

Use `shadow-plugin` for elevated surfaces. Replace a border or ring combined
with a shadow by one `smooth-shadow-ring-*` class. Use `smooth-shadow-*` when the
surface needs no edge stroke. Preserve keyboard focus with
`focus-visible:outline-*`.
