---
name: design-accessible-interfaces
description: Implement accessible interface behavior.
---

# Accessible interfaces

Use the platform before custom behavior. Match the established styling and
component systems. When the project has an accessible component primitive for a
role, use it instead of rebuilding the behavior or bypassing the component
system with lower-level markup. Native-first does not mean library-last.

In copied references, `better-colors` means `design-color-systems`, `better-typography` means `design-web-typography`, and `better-layout` means `responsive-css-architect`.

## References

- Read [focus-and-keyboard.md](references/focus-and-keyboard.md) for focus, keyboard patterns, and route changes.
- Read [semantics-and-aria.md](references/semantics-and-aria.md) for native elements, landmarks, names, and disabled states.
- Read [forms.md](references/forms.md) for labels, validation, autocomplete, and submission behavior.
- Read [screen-readers.md](references/screen-readers.md) for live regions, alternative text, and hidden content.
- Read [hit-areas.md](references/hit-areas.md) for target sizing and collision rules.
- Read [motion-and-zoom.md](references/motion-and-zoom.md) for motion preferences, zoom, and reflow.

## Core principles

### 1. Native Elements First

The first rule of ARIA: don't use ARIA when a native element exists. `<button>` for actions, `<a href>` for navigation (it must support Cmd/Ctrl/middle-click), never `<div onClick>`. No ARIA is better than bad ARIA.

### 2. Visible Focus Rings

Style `:focus-visible`, not bare `:focus`, so keyboard users get a ring and mouse users usually don't. Prefer the browser's unmodified focus indicator. If the design needs a custom ring, use a project focus token or another explicit color and verify the complete indicator against every adjacent color it crosses; `currentColor` is acceptable only after the same check. Use at least a `2px` solid perimeter or an equivalent visible area. Never use `outline: none` without a verified replacement, and preserve system colors in forced-colors mode.

### 3. Full Keyboard Support

Every pointer interaction needs a keyboard path, following the ARIA APG patterns: Escape closes overlays, arrow keys move within composite widgets (tabs, menus, listboxes), Tab moves between widgets, Enter and Space activate. Only `tabindex="0"` (join the natural tab order) and `tabindex="-1"` (programmatic focus), never positive values, which break the natural order. Composite widgets use roving tabindex: the active item is `0`, all others `-1`.

### 4. Trap and Restore Focus

Modals set `inert` on the background content, move focus inside on open, and return focus to the trigger on close. Add `overscroll-behavior: contain` so background content doesn't scroll.

### 5. Minimum Hit Area

WCAG 2.5.8's Level AA baseline is a 24×24 CSS-pixel target or one of its defined spacing, equivalent-control, inline, user-agent, or essential exceptions. For easier activation, aim for 44×44px in touch contexts and 40×40px in desktop interfaces when density permits. Extend with a pseudo-element if the visible element should stay smaller. Never let extended hit areas overlap.

### 6. Label and Type Every Control

Every input gets a `<label for>` or wrapping `<label>`; a placeholder is never a label, and label and control share one hit target: no dead zones between a checkbox and its text. Add `autocomplete` with a meaningful `name`, and the correct `type` and `inputmode` for the keyboard. Never block paste; users paste passwords and one-time codes.

### 7. Errors That Announce

Keep submit enabled until the request starts, then disable with a spinner while keeping the original label. Validate on submit: mark failing fields with `aria-invalid="true"`, point `aria-describedby` at the inline error text, and focus the first invalid field. Use native `disabled` when a native control is genuinely unavailable. Use `aria-disabled="true"` only when retaining focusability or discoverability is intentional; then block pointer, keyboard, and form behavior in code and style the state explicitly.

### 8. Accessible Names Everywhere

Icon-only buttons need a descriptive `aria-label`. Visible label text must appear in the accessible name. Decorative elements get `aria-hidden="true"`, never on a focusable element.

### 9. Don't Rely on Color Alone

Status needs a redundant cue: icon, text, or underline alongside the color. Determine which WCAG contrast requirement applies from the content and state, then use `better-colors` to measure the rendered foreground/background pair. When contrast fails, report the pair and requirement it misses; do not change the project's colors unless asked.

### 10. Honor prefers-reduced-motion

Wrap motion in `@media (prefers-reduced-motion: no-preference)` so it is opt-in. Under reduced motion, replace slides and scales with opacity crossfades; kill parallax and autoplay entirely. Independent of the preference: autoplaying media needs a visible pause control, and toasts carrying actions or errors stay until dismissed.

### 11. Announce Dynamic Content

Use `aria-describedby` for field-specific validation, a polite live region (`role="status"`) for non-urgent updates not tied to a control such as toasts or result counts, and `role="alert"` only for urgent errors not tied to a control. For reliable repeated polite announcements, render a stable empty region before updating its text; dynamically inserted alerts have different support and must be tested with the target screen readers.

### 12. Alt Text by Purpose

Decorative images get `alt=""`, informative images describe the meaning, functional images describe the action: a search icon button is `alt="Search"`, not `alt="magnifying glass"`.

### 13. Structure Is Navigation

Use headings that describe their sections and form a coherent outline; one page-level `<h1>` and properly nested levels are the recommended default, not standalone WCAG pass/fail rules. Expose one visible primary `<main>` landmark. When repeated navigation or chrome precedes it, make a "Skip to content" link the first focusable element. Anchored headings get `scroll-margin-top`.

### 14. Survive Zoom and Text Resize

The page must work at 200% zoom and reflow at 320px width without horizontal scrolling. Use `min-height` instead of fixed `height` on text containers, prefer `rem` breakpoints where they fit the codebase's conventions, and never use `user-scalable=no` or `maximum-scale=1`.
