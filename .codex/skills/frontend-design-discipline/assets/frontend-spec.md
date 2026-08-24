# Frontend specification

This artifact is the approved, deliberately lossy interface between design search
and implementation. Do not copy discarded alternatives or exploratory discussion
into it.

## Outcome

-

## Approved representation

- Representation thesis:
- Product job:
- Primary interaction:
- What users perceive:
- What remains quiet or hidden:
- Required accessibility equivalents:
- Evidence sources:
- Unresolved feasibility questions:

## State behavior

| State | Representative value or fixture | Visible, behavioral, ambient, or narrative result | Accessible equivalent |
| --- | --- | --- | --- |
| Typical |  |  |  |
| Neutral |  |  |  |
| Extreme |  |  |  |
| Empty or missing |  |  |  |
| Awkward or long |  |  |  |
| Loading |  |  |  |
| Failure |  |  |  |
| Transition or update |  |  |  |

## Context boundary

- Subject and decision:
- Implementation context allowed now:
- Context still excluded:
- Required output and stopping condition:
- Isolation status (`runtime-enforced` or `best-effort`):

## Product precedent

- Applicability (`product-topology` or not applicable):
- Product:
- Upstream repository:
- Exact revision:
- License:
- Reference routes and screenshots:
- Evidence artifact or repository path:
- Implementation mode (`reuse` or `observe`):
- Retained license notice:

### Source files

| Upstream path | Owned target | Mode (`copy` or `adapt`) | Upstream SHA-256 |
| --- | --- | --- | --- |
|  |  |  |  |

## Adopt unchanged

- Topology:
- Navigation:
- Information density:
- Interaction grammar:
- Responsive behavior:
- Loading, empty, error, populated, hover, focus-visible, active, and disabled states:

## Required deviations

- Acceptance gate:
- Reference behavior:
- Required change:

## Decisions

### Topology

-

### Mobile or alternate-form-factor composition

- Classification (`preserve`, `adapt`, `recompose`, `split`, `replace`, `remove`, or not applicable):
- Task-frequency ordering:
- Regions removed, merged, split, or replaced:
- Navigation and interaction changes:
- Shared domain/state behavior:
- Divergent presentation owners:

### Visible content and actions

| Region or action | Exact content or behavior | Evidence source | Semantic role |
| --- | --- | --- | --- |
|  |  |  |  |

Unspecified decorative framing is absent. This includes eyebrows, kickers,
overlines, pills, badges, generic hero copy, fake metrics, card grids, and ornamental
summaries.

### Composition grammar

| Semantic owner | Spatial group | Layout owner | Visual containment | Reason |
| --- | --- | --- | --- | --- |
|  |  |  | `shared`, `own surface`, or `none` |  |

- Primary surface or no-surface decision:
- Reading order:
- Shared alignments and baselines:
- Relationships communicated by placement:

#### Surface budget

| Surface | Primary or additional | Interaction reason | Relevant states |
| --- | --- | --- | --- |
|  |  |  |  |

Every additional surface needs an interaction reason. Semantic or component
ownership alone is not a reason.

#### Density profile

- Evidence source or established product default:
- Repeated row height:
- Related-item gap:
- Section gap:
- Control height:
- Type roles:
- Exceptions and reasons:

#### Negative component decisions

- Cards omitted or justified:
- Badges omitted or justified:
- Headings omitted or justified:
- Tabs omitted or justified:
- Dialogs omitted or justified:
- Separators omitted or justified:
- Button labels omitted or justified:

#### Spatial pass

- Shared alignment check:
- Reading-order check:
- Surface-count check:
- Repeated-padding check:
- Density check:
- Placement-replaces-chrome check:
- Render, wireframe, or sketch evidence:

### Visual assets

| Required role | Evidence source | Source or creation method (`existing`, `SVG`, or `imagegen`) | Motion and reduced-motion result | Owner and code location |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

An invented asset may fulfill a recorded visual role. It does not add product
meaning, visible content, actions, navigation, or features.

### State ownership

-

### Responsive behavior

- Layout relationships:
- Actual container contexts:
- Intrinsic constraints:
- Intentional fixed physical constraints:
- Narrow, medium, wide, and long-content behavior:

### Ownership and exact code locations

-

## Implementation reconciliation

| Current owner | Retain, replace, or remove | Approved target owner | Shared lower-layer behavior | Reason |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## First vertical slice

- Entry:
- Action:
- State transition:
- Result:
- Applicable states:
- Owners and code locations:

## Replace or remove

-

## Non-goals

-

## Propagation after consolidation

- Applicable entry points:
- Applicable clients:
- Applicable adapters:
- Applicable contracts:
- Reverse actions:
- Unsupported surfaces:

## Authorized visual review

- Authorization or acceptance contract:
- Rendered states and transitions:
- Screenshots or frames:
- Major decision removed or replaced:
- Materially different comparison:
- Selected result and reason:
- Human judgment owner:
- Unverified behavior and risks:
