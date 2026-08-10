## Frontend Tailwind

Select this section only when the project contract identifies Tailwind CSS as the frontend styling system.

- Use `skill-tailwind-css-architect` for Tailwind-specific configuration, utility boundaries, and component styling decisions. Keep neutral layout and stylesheet ownership in `skill-responsive-css-architect`.
- Import `tw-fade` and `shadow-plugin` once after `tailwindcss` in the Tailwind entry stylesheet.
- Represent scroll state with `tw-fade` on the element that owns scrollable overflow. Use `fade-x`, `fade-y`, or `fade` according to the axis.
- Use `shadow-plugin` for elevated surfaces. Replace a border/ring plus shadow pair with one `smooth-shadow-ring-*` class, or use `smooth-shadow-*` when no edge stroke is needed. Keep focus visible with `focus-visible:outline-*`.
