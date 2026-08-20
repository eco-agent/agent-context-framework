---
name: choose-react-animation
description: Animate React interfaces and SVG assets when motion clarifies state, feedback, navigation, drag, scroll, or layout changes.
---

# Choose React Animation

Use CSS for small style changes, View Transitions for discrete scene changes, and Motion for live or interruptible interaction.

## Workflow

1. Inspect the existing animation stack, dependencies, styling conventions, and reduced-motion handling.
2. Identify what drives the animation: a small style change, a transition between settled DOM states, or continuous and interruptible interaction.
3. Choose the least complex option that handles interruption, cleanup, and accessibility correctly.
4. Implement the smallest change. Do not add Motion merely to express a transition CSS already handles cleanly.
5. Verify the interaction in its real lifecycle, including rapid reversal, unmounting, and reduced motion where relevant.

## Prefer Animated SVG for Self-contained Assets

When a required icon, vector illustration, pattern, texture, status glyph, or identity mark is self-contained, prefer a code-native animated SVG over recreating the artwork from styled elements, gradients, or pseudo-elements. Use a static SVG only when motion adds no state, feedback, direction, or product character.

Keep one stable SVG and animate its groups or paths. Prefer `transform` and `opacity`. Use stroke animation only when the stroke itself carries the meaning. Use `currentColor` when the asset follows interface state. Keep the `viewBox`, accessible name, and settled geometry stable.

Use CSS for selector-driven hover, active, state, and decorative loops. Use Motion when React state, interruption, sequencing, gesture, or lifecycle drives the SVG. Do not add Motion only to animate a self-contained SVG that CSS can express cleanly.

Under `prefers-reduced-motion: reduce`, remove nonessential movement and render the meaningful settled frame. Preserve the state change and accessible name without relying on animation.

## Choose CSS by Default

Use CSS transitions or keyframes for:

- hover, focus, active, and button feedback;
- simple fades, spins, pulses, and skeletons;
- decorative or self-contained keyframe loops;
- effects driven entirely by selectors, classes, or media queries.

Prefer CSS when it avoids a dependency and keeps the behavior easy to inspect. Keep the state in CSS rather than duplicating it in React solely to animate it.

```tsx
function SaveButton() {
  return <button className="save-button">Save</button>;
}
```

```css
.save-button {
  transition: transform 160ms ease, opacity 160ms ease;
}

.save-button:hover {
  transform: translateY(-2px);
}

.save-button:active {
  transform: scale(0.97);
}
```

## Choose View Transitions for Scene Changes

Use the View Transition API when the browser should carry the eye from one settled rendered state to another:

- page or route transitions;
- grid-to-detail, gallery-to-lightbox, or other shared-element transitions;
- tab, filter, theme, or broad DOM-state replacement;
- same-origin cross-document navigation when both pages can opt in.

View Transitions snapshot the old and new rendered states and animate between them. Prefer them when replacing a scene is the behavior, not when the user needs to grab, scrub, reverse, or redirect live elements.

For same-document changes, wrap the DOM update or navigation in `document.startViewTransition`. Assign stable, unique `view-transition-name` values only to elements that must bridge the two states. Preserve a direct-update fallback when the API is unavailable, and follow the framework or router's existing integration rather than bypassing its state model.

```css
.selected-product-image {
  view-transition-name: selected-product;
}
```

Do not use View Transitions for an individual component merely because it mounts or unmounts. They are strongest when a substantial rendered state is replaced.

## Choose Motion for React When It Removes Behavioral Complexity

Use `motion/react` for:

- detailed component enter and exit animation, especially for toasts, tooltips, dropdowns, and modals;
- interactive layout changes that otherwise require measurement or FLIP logic;
- drag, pan, gesture, or spring interactions;
- scroll-linked or continuously changing values;
- animation driven by React state or component lifecycle that must remain interruptible;
- dynamic variants, interruption, or coordinated sequences such as staggered children.

Use `AnimatePresence` for exit animation and `layout` or `layoutId` for layout transitions. Reuse the project's existing Motion patterns before introducing new abstractions.

```tsx
import { AnimatePresence, motion } from "motion/react";

function Modal({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
        />
      )}
    </AnimatePresence>
  );
}
```

Do not install Motion unless its lifecycle, layout, gesture, spring, or sequencing primitives materially simplify the implementation.

## Resolve Overlap Deliberately

Both View Transitions and Motion can animate layout changes and exits. Choose by behavior:

- Use View Transitions when one scene replaces another, such as a route, result set, or expanded dashboard state.
- Use Motion when elements remain part of an interactive system, such as a reorderable list, rapidly toggled accordion, draggable board, or spring-coupled layout.
- Use View Transitions for a whole route leaving and another entering. Use Motion for detailed lifecycle behavior of an individual component.
- Combine layers when justified: View Transitions between scenes, Motion within the active scene, and CSS for local feedback.

Treat interruption as the tie-breaker. If the user should be able to grab, reverse, scrub, or redirect the animation, prefer Motion.

## Performance and Accessibility

- Prefer `transform` and `opacity`.
- Avoid animating `width`, `height`, `top`, `left`, or margins on every frame when a transform can express the effect.
- Do not assume CSS is fast or Motion is slow; verify the rendered behavior and property costs.
- Respect `prefers-reduced-motion`. Remove nonessential movement and preserve essential state changes.
- Keep focus, pointer, and keyboard behavior correct throughout the animation.
- Avoid timers and duplicated React state when native transition events or Motion lifecycle callbacks are sufficient.
- Check View Transition support and keep the underlying state change functional without animation.

## Review Checklist

- Confirm the chosen tool matches the animation driver.
- Confirm settled-state replacement is not confused with live interaction.
- Confirm no new dependency or abstraction is unnecessary.
- Test mount, unmount, rapid toggling, and interrupted transitions.
- Check transform origins, overflow, stacking contexts, and pointer interaction.
- Check reduced-motion behavior.
- Critique the result in context and make a second pass for timing, restraint, and clarity.
