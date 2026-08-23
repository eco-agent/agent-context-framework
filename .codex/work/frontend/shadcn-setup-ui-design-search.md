# Frontend design search

## Active attention

- Subject: screen
- Decision: replace the ACF setup workspace with the approved shadcn preset and
  remove disruptive layout changes.
- Reasoning granularity: coarse
- Allowed context sources: user feedback, rendered setup UI, existing setup API
  contract, generated preset source, shadcn upstream source and license.
- Explicitly excluded context: registry implementation details that do not alter
  the setup contract, application code outside setup UI ownership.
- Stopping condition: one topology preserves all current actions and has a
  stable narrow and wide composition.

## Product subject

- Audience: a repository maintainer configuring ACF locally.
- Single product job: choose additions, understand their resolved impact, and
  install the reviewed selection.
- User tasks and behavior: search registry entries, compare direct and transitive
  selection, notice conflicts and activation requirements, then install.
- Subject materials and vernacular: repository path, registry entries, dependency
  closure, planned writes, conflicts, capabilities, and licenses.

## Evidence

| Evidence | Source | What it establishes | Limit |
| --- | --- | --- | --- |
| User selected preset | prompt | base-mira shadcn is the visual and component source | does not change ACF behavior |
| User saw large shifts and little continuity | rendered setup UI feedback | layout stability and motion are acceptance requirements | timing still needs rendered review |
| Existing setup state machine | `tools/setup-ui/src/App.tsx` | exact actions, states, copy roles, and keyboard paths | current topology has no authority |
| Setup contract | `tools/dev-tooling/src/setup-contract.ts` | server data and valid state vocabulary | does not decide hierarchy |
| Generated preset | shadcn CLI 4.19.0, preset `byaZqBz6I` | theme, components, fonts, icons, density | full TanStack template is not adopted |

## Representative states

| State | Realistic value or fixture | Frequency | Difference users must perceive |
| --- | --- | --- | --- |
| Typical | several direct selections with a changes-ready plan | common | what will be added and install readiness |
| Neutral | no optional additions selected | common | core still resolves for a fresh repository |
| Extreme | many components and long dependency closure | occasional | density remains readable without page jumps |
| Empty or missing | search has no matches or review has no selection | common | clear next action without invented content |
| Awkward or long | long project path, component name, conflict path, license source | occasional | content wraps or truncates without overflow |
| Transition or update | rapid selection reversal and section navigation | common | continuity without stale plan flashes |
| Failure | load, plan, install, or ownership conflict | uncommon | failure blocks installation and remains actionable |

## Competing representations

| Thesis | Mapping | Structure and interaction | Source value visible? | Evidence gained | Reason rejected or retained |
| --- | --- | --- | --- | --- | --- |
| Current navigation shell | literal | sidebar changes one long document between component and review modes | yes | current behavior and keyboard paths | rejected by user and causes large composition changes |
| Guided installer | behavioral | short staged sequence reveals only the next decision and hides raw plan metrics until final review | no | quietest possible flow | rejected because experienced maintainers need continuous plan evidence while selecting |
| Stable setup workspace | literal | searchable catalogue and live plan share one bounded surface on wide screens, with tabs on narrow screens | yes | selection and consequence stay connected without moving the page | retained, best fit for the task and preset |

## First acceptable draft

- Representation: stable two-pane workspace with catalogue and live plan.
- What made it technically acceptable: it maps to existing state without changing
  the server contract.
- Major decision removed or replaced: replaced fixed global footer plus one long
  scrolling document with a stable action region and independently bounded panes.
- Materially different comparison: the guided installer reduced visible source
  values but made iterative comparison slower.
- Result across the same states and tasks: the split workspace keeps the plan in
  context and contains long or changing lists.

## Approved handoff

- Representation thesis: a quiet shadcn workspace where selection and consequence
  remain adjacent and geometry stays stable.
- Product job: choose, understand, and install ACF additions.
- Primary interaction: toggle components while the server-owned plan updates in
  place, then install from a stable action region.
- What users perceive: direct selection, resolved closure, footprint, required
  trust or activation, licenses, conflicts, and install readiness.
- What remains quiet or hidden: installed entries stay visible but subdued; empty
  metadata sections are omitted; implementation and registry internals stay hidden.
- Typical, neutral, extreme, empty, awkward, transition, and failure behavior:
  bounded panes, reserved plan height, state-specific alerts, wrapping paths, and
  opacity or transform continuity without geometry animation.
- Mobile classification: recompose.
- Required accessibility equivalents: native labels, Base UI keyboard behavior,
  visible focus, live plan status, alert semantics, arrow-key catalogue movement,
  and a static reduced-motion state.
- Required visual assets: Phosphor icons supplied by the preset. No raster assets.
- Unresolved feasibility questions: exact animation timing remains subject to
  rendered review.
- Evidence sources: user prompts, current rendered UI, setup contract, generated
  preset source, and pinned shadcn source.
