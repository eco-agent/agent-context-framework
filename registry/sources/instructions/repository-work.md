## Work

- Before substantial code write `.codex/work/<task>.md`: outcome, decisions, state, topology, slice, replacements, non-goals, propagation.
- Record one answer and owner per decision. Specialists stay scoped.
- Complete one cross-layer slice and applicable loading, empty, error, populated, hover, focus-visible, active, and disabled states.
- Edit the owner; consolidate and replace directly. Never add compatibility, migrations, deprecations, adapters, dual writes, fallbacks, or parallel representations unless requested.
- Git and previews provide recovery. Reduce, then propagate to entry points, clients, adapters, contracts, and reverse actions. Mark gaps.
- Limits must protect a measured model, transport, storage, or runtime boundary. Derive them from that boundary, report when they are reached, and never silently truncate mandatory context or user-facing explanation.
