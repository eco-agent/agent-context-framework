# Visual review

Use this reference after a representation is runnable and rendered review is
authorized.

## Inspect observed states

Render typical, neutral, extreme, empty, awkward, long-content, repeated, loading,
error, disabled, and transition states that apply. For continuous inputs, sample the
range densely enough to reveal quiet regions, thresholds, and discontinuities. Also
inspect motion between representative values.

Review the actual result rather than inferring behavior from JSX, CSS, types, or a
single screenshot.

Ask:

- Are meaningful state differences legible without becoming noisy?
- Does the neutral state feel deliberate rather than unfinished?
- Do extremes remain one coherent product rather than unrelated themes?
- Does the transition itself communicate useful behavior?
- Is exact source data visible only when users need it?
- Does any UI chrome interrupt the representation?
- Can an element, label, card, or state encoding be deleted?
- Did a generic component appear because representation search stopped early?
- Do non-color, reduced-motion, and assistive equivalents preserve meaning?

For responsive work, place the component in its actual contexts and representative
containers. Ask how much CSS would need to change if it moved between a drawer,
two-column grid, full-width page, and modal. A portable component should require
little or no geometric rewriting.

## Challenge the first result

After the first working version, remove or replace one major design decision and
attempt a materially different solution. Compare both across the same product states
and tasks. Keep the first only when it survives that comparison.

Record screenshots or frames, inspected states, the destructive comparison, the
selected result, and unresolved risks. Automated checks can prove that states were
rendered and evidence exists. Human review owns whether the representation is
coherent, useful, and sufficiently quiet.

Bind acceptance to the exact evidence IDs, content hashes, and Git revision that
the human reviewed. A later render is new evidence even when its route and viewport
match. If the accepted evidence does not live at a durable project-owned path,
promote it before closing the design task or report that the visual decision has
no durable owner.
