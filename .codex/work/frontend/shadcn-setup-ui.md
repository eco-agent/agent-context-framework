# Frontend specification

## Outcome

- Replace the ACF setup frontend with the base-mira shadcn preset selected by the
  user, preserve setup behavior, contain layout changes, and add restrained state
  continuity.

## Approved representation

- Representation thesis: a quiet setup workspace where component choice and the
  server-owned consequence remain adjacent.
- Product job: choose, understand, and install ACF additions.
- Primary interaction: search and toggle components while a stable live plan
  updates, then install from a fixed-height action region.
- What users perceive: current repository, registry revision, initialization,
  direct selection, resolved closure, footprint, capabilities, licenses,
  activations, drift, conflicts, and install readiness.
- What remains quiet or hidden: empty metadata groups and registry internals.
- Required accessibility equivalents: labelled controls, visible focus, keyboard
  list navigation, live status, alerts, disabled reasons, and reduced motion.
- Evidence sources: user approval, existing setup behavior, setup contracts, and
  shadcn preset `byaZqBz6I`.
- Unresolved feasibility questions: none before implementation.

## State behavior

| State | Representative value or fixture | Result | Accessible equivalent |
| --- | --- | --- | --- |
| Typical | changes-ready plan | both panes remain visible and install enables | plan status text and button state |
| Neutral | no optional selection | catalogue remains usable and core closure is described | explicit no-additions summary |
| Extreme | many selected items | pane scrolls without moving header or action region | complete DOM order and text |
| Empty or missing | no search match or no selected item on mobile review | quiet empty message with next action | semantic status text |
| Awkward or long | long path and conflict | wrap or truncate with title where full value matters | full text remains available |
| Loading | initial snapshot or plan request | reserved skeleton or progress row | labelled status and `aria-busy` |
| Failure | load, plan, install, or conflict | destructive alert in the owning region | `role=alert` and disabled install |
| Transition or update | rapid toggle or tab change | interruptible view transition or CSS opacity and transform | direct state update under reduced motion |

## Context boundary

- Subject and decision: setup screen topology and presentation.
- Implementation context allowed now: setup client state, API contract, preset
  component source, theme, package manifest, and Vite build.
- Context still excluded: registry semantics and target application code.
- Required output and stopping condition: built client preserves every current
  path and passes narrow checks plus rendered review.
- Isolation status: best-effort.

## Product precedent

- Applicability: product-topology
- Product: shadcn base-mira preset `byaZqBz6I`
- Upstream repository: `https://github.com/shadcn-ui/ui.git`
- Exact revision: `1773ecfeeb4a04366978d353e69b5c7ded78dcb2`
- License: MIT
- Reference routes and screenshots: generated TanStack Start preset and local
  component registry output.
- Evidence artifact or repository path: `tools/setup-ui/SHADCN_UPSTREAM.md`
- Implementation mode: reuse
- Retained license notice: `tools/setup-ui/SHADCN_UPSTREAM.md`

### Source files

| Upstream path | Owned target | Mode | Upstream SHA-256 |
| --- | --- | --- | --- |
| generated `src/styles.css` | `src/styles/tokens.css` and `src/styles/index.css` | adapt | `a54b68b0e5d675567c77355b077e3a6b9ca659c3e7abc8c30d9aa8855287c371` |
| generated `button.tsx` | `src/components/ui/button.tsx` | adapt | `53b98cbb6fb8ffe1c4f31e0a9fd5cb63c452c40929b4ea2fca69b46baa201f4a` |
| generated `checkbox.tsx` | `src/components/ui/checkbox.tsx` | adapt | `1d27ced327f8d1da9b5c4ce356fa5996f95eb29cd055d8e1106953bdefa6aad4` |
| generated `input.tsx` | `src/components/ui/input.tsx` | adapt | `674ce2645cbf7b3c477e06dcd0afd0fcc252139f7c3723c00ce6c4c2b350e536` |
| generated `tabs.tsx` | `src/components/ui/tabs.tsx` | adapt | `543aa18970f1245b653c6a7b087dee9bd4a717f0c243a16ee50c64a25898ae04` |
| generated `alert.tsx` | `src/components/ui/alert.tsx` | adapt | `a232c5932e3f7882dea35ac03f1a0823c937e97750c40cb29bde20c859a2244c` |
| generated `badge.tsx` | `src/components/ui/badge.tsx` | adapt | `7c725a69371f38459e6078313f9993bd4b3b249a892f10590e8e268a8e6fdc2d` |
| generated `skeleton.tsx` | `src/components/ui/skeleton.tsx` | adapt | `8110bba70d0cb9fe968c0b7bd092ad12258caef40b028b4a87f402bdab907faf` |
| generated `spinner.tsx` | `src/components/ui/spinner.tsx` | adapt | `e3ab8fdb74922bf51d9c1e8725a6c4a6ebd60b01f254ae0d0c9ddde62fe9d1eb` |

## Adopt unchanged

- Topology: shadcn's restrained single-surface application treatment.
- Navigation: Base UI tabs for narrow-screen projection.
- Information density: base-mira compact text and control scale.
- Interaction grammar: Base UI controls, data-state variants, Phosphor icons,
  zinc semantic tokens, and pointer-enabled buttons.
- Responsive behavior: mobile-first utilities with a wide split workspace.
- States: preset hover, focus-visible, active, disabled, invalid, and skeleton
  recipes.

## Required deviations

- Acceptance gate: existing setup behavior remains intact.
- Reference behavior: generated TanStack Start template owns routing only.
- Required change: keep ACF's Vite entry point and API state machine.
- Acceptance gate: no large shifts during plan updates or navigation.
- Reference behavior: preset provides components but no ACF layout.
- Required change: bounded panes, reserved status height, View Transitions for
  scene replacement, and CSS transitions for local feedback.

## Decisions

### Topology

- Wide screens use one header, a catalogue pane, a plan pane, and a stable action
  region. There is no decorative card grid.

### Mobile or alternate-form-factor composition

- Classification: recompose
- Task-frequency ordering: catalogue first, review second, install action always
  reachable.
- Regions removed, merged, split, or replaced: desktop panes become Base UI tabs.
- Navigation and interaction changes: tab triggers replace the permanent split.
- Shared domain/state behavior: selection, plan, errors, and install state.
- Divergent presentation owners: responsive utilities in `App.tsx`.

### Visible content and actions

| Region or action | Exact content or behavior | Evidence source | Semantic role |
| --- | --- | --- | --- |
| Header | title, project path, initialized state, registry revision | current UI | page identity and context |
| Catalogue | search, count, component rows, installed state | current UI | selection |
| Plan | selection preview and every current disclosure | current UI and contract | consequence and conflict review |
| Action region | selected summary, resolved closure, install button | current UI | commit action |
| Result notice | applied, blocked, or failed outcome with dismiss | current UI | feedback |

### Visual assets

| Required role | Evidence source | Method | Motion and reduced-motion result | Owner |
| --- | --- | --- | --- | --- |
| Search, package, review, status, and action icons | shadcn preset icon library | existing Phosphor package | transform or opacity only, static under reduced motion | `App.tsx` |

### State ownership

- `App.tsx` retains the discriminated application and preview states.
- `api.ts` retains launch token and request ownership.
- Base UI owns control behavior and accessibility.
- CSS and native View Transitions own presentation continuity.

### Responsive behavior

- Layout relationships: grid defines stable wide panes; narrow screens use one
  tab panel and one fixed-height action region.
- Actual container contexts: full setup page and viewport-width narrow tab panel.
- Intrinsic constraints: `minmax(0, 1fr)`, `min-w-0`, bounded content widths, and
  wrapping metadata.
- Intentional fixed physical constraints: minimum control and action heights.
- Narrow, medium, wide, and long-content behavior: no horizontal overflow; lists
  scroll inside their owner; plan content wraps; header path truncates safely.

### Ownership and exact code locations

- Application composition: `tools/setup-ui/src/App.tsx`
- API: `tools/setup-ui/src/api.ts`
- Components: `tools/setup-ui/src/components/ui/*`
- Utilities: `tools/setup-ui/src/lib/utils.ts`
- Global CSS and theme: `tools/setup-ui/src/styles/*`
- Build integration: `tools/setup-ui/vite.config.ts`, package manifest, lockfile.

## Implementation reconciliation

| Current owner | Change | Approved target owner | Shared behavior | Reason |
| --- | --- | --- | --- | --- |
| `App.tsx` | replace presentation, retain state | `App.tsx` with shadcn composition | selection, plan, install | direct replacement |
| `SetupSidebar.tsx` | remove | responsive catalogue and tabs in `App.tsx` | `/` search shortcut | sidebar topology rejected |
| custom UI components | remove | generated `components/ui` recipes | control roles | use selected library |
| `index.css` | remove | Tailwind entry and token files | global font smoothing | use preset styling owner |
| `api.ts` | retain | `api.ts` | complete API behavior | still serves target |

## First vertical slice

- Entry: loaded setup snapshot.
- Action: search and toggle one component.
- State transition: requested selection changes and server plan refreshes.
- Result: plan updates in place and install readiness changes without moving the
  shell.
- Applicable states: loading, ready, empty, plan error, blocked, applying, result.
- Owners and code locations: `App.tsx`, `components/ui`, `styles`, and `api.ts`.

## Replace or remove

- `SetupSidebar.tsx`, old component wrappers, `index.css`, and t3code notice.

## Non-goals

- Registry, installer, server, and target workspace changes.
- Decorative illustration or motion.
- TanStack Start routing or framework adoption.

## Propagation after consolidation

- Applicable entry points: setup Vite client and setup server static assets.
- Applicable clients: local token-protected browser client.
- Applicable adapters: setup API decoder only.
- Applicable contracts: existing setup contracts.
- Reverse actions: deselection, dismiss result, reload after load failure.
- Unsupported surfaces: none known.

## Authorized visual review

- Authorization: user requested frontend replacement after inspecting the live UI.
- Rendered states and transitions: pending.
- Screenshots or frames: pending.
- Major decision removed or replaced: fixed global footer plus long page replaced
  by bounded panes.
- Materially different comparison: guided installer rejected because it hides the
  live plan during iterative selection.
- Selected result and reason: stable split workspace keeps cause and consequence
  adjacent.
- Human judgment owner: user.
- Unverified behavior and risks: pending implementation.
