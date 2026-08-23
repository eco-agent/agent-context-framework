# Shadcn setup UI replacement

## Intended outcome

Replace the ACF workspace setup frontend with the stock shadcn preset
`byaZqBz6I`, while retaining the setup server contract, component selection,
preview, automatic initialization, installation, and status reporting.
Remove avoidable layout jumps and use restrained animation to carry the user
through selection, preview, navigation, and status changes.

## Ownership and baseline

- Owner: `codex/shadcn-setup-ui`
- Baseline: `d8e922359a298129fb061ce8d72ff16c800bef31`
- Worktree: `D:\dev\agent-context-framework`
- Repository policy declares no project contract paths. Source, registry, and
  tests remain evidence, but no project contract is assumed.

## Current state

- The current React setup UI lives in `tools/setup-ui`.
- A token-protected loopback server owns planning and filesystem writes.
- The target workspace remains `D:\dev\business-operating-system`.
- The user rejected the current visual system and selected the shadcn preset by
  its registry identifier.

## Current implementation contract

- `tools/setup-ui/src/api.ts` captures the launch token, removes it from the
  visible URL, and owns authenticated snapshot, plan, and install requests.
- `tools/dev-tooling/src/setup-server.ts` owns initialization, plan authority,
  conflict blocking, component installation, and the refreshed snapshot.
- `tools/setup-ui/src/App.tsx` owns the current state machine, selection set,
  debounced-by-staleness plan requests, installation action, and result notice.
- `tools/setup-ui/src/SetupSidebar.tsx` owns search focus with `/`, escape to
  clear, section navigation, and the selected count.
- `tools/setup-ui/src/components` and `tools/setup-ui/src/index.css` own the
  custom presentation that will be removed.
- `tools/setup-ui/LICENSE.t3code-upstream` belongs to the presentation being
  replaced. Remove it only after no t3code-derived bytes remain.

## Pinned product source

- User task: choose registry additions, understand the real server plan, and
  install without losing context during state changes.
- Preset: `byaZqBz6I`, resolved by `shadcn` CLI `4.19.0` with TanStack Start
  template and pointer cursors enabled.
- Repository: `https://github.com/shadcn-ui/ui.git`
- Revision: `1773ecfeeb4a04366978d353e69b5c7ded78dcb2`
- License: MIT, copyright shadcn 2023.
- Published CLI integrity:
  `sha512-EQF6R+CUXTsEP2BpyhxrUEAFesrtFD1POvVOf5jM+wkgtA4kG1EW1+1Wlmi9LqiprSL681JJXBcS0u8WkVVVyQ==`
- Adoption mode: copy the generated base-mira component recipes and adapt their
  import paths and Vite ownership. Keep the preset's Public Sans and Nunito Sans
  typography, zinc semantic tokens, Base UI behavior, Phosphor icons, compact
  density, radii, and interaction grammar.
- Required differences: retain the existing ACF setup state and API owners, use
  a Vite client rather than TanStack Start, keep accessible target sizes, use
  stable split-pane geometry, and add reduced-motion-aware continuity.

## Decisions

- Product topology owner: the user-selected shadcn preset, pinned through the
  shadcn CLI output and license evidence.
- Product behavior owner: the existing ACF setup API and server.
- Styling owner: Tailwind CSS v4 utilities and shadcn component recipes.
- Responsive owner: the setup page shell and component-list containers.
- Motion owner: CSS for local feedback and Motion only where interruptible React
  layout or lifecycle changes need it.
- Final visual judgment owner: the user.

## Smallest complete slice

One workspace can load the setup UI, search and select components, review the
server-generated plan, initialize when needed, install the selection, and see
success or failure through the replacement shadcn interface.

## Preservation map

| Behavior | Classification | Owner | Observation | Grace path |
| --- | --- | --- | --- | --- |
| Token-protected loopback access | Retained | setup server | existing server tests and browser load | stop and report if the client cannot authenticate |
| Server-owned component planning | Retained | setup API | preview request and rendered review | expose the server error without client-side reimplementation |
| Existing selection preservation | Retained | setup API | selected and installed states in the UI | block ambiguous writes and report the conflict |
| Initialize, install, and recover actions | Retained | setup API | action responses and setup tests | retain the last stable state and show the server error |
| Current custom visual system | Removed | current setup UI | source diff removes obsolete components and CSS | none, the user selected a direct replacement |
| Stock shadcn preset `byaZqBz6I` | Added | shadcn registry source | pinned generated source and package metadata | stop if the preset cannot be resolved or licensed |
| Responsive narrow-screen setup flow | Changed | replacement setup shell | rendered narrow, medium, and wide states | preserve a single-column usable flow if richer composition fails |
| Layout continuity and animated state feedback | Added | replacement setup UI | rapid selection, preview, navigation, and reduced-motion review | keep stable settled states and disable nonessential movement under reduced motion |

## Replacements

- Replace the custom Button, Checkbox, Input, sidebar, and root stylesheet with
  the preset's component system and Tailwind entry stylesheet.
- Remove the previous upstream presentation source and its notice only after no
  copied bytes remain.

## Source mapping

| Upstream source | Project owner | Mode |
| --- | --- | --- |
| generated `src/styles.css` | `tools/setup-ui/src/styles/*` | adapt |
| `apps/v4/registry/bases/base/ui/button.tsx` | `tools/setup-ui/src/components/ui/button.tsx` | adapt |
| `apps/v4/registry/bases/base/ui/checkbox.tsx` | `tools/setup-ui/src/components/ui/checkbox.tsx` | adapt |
| `apps/v4/registry/bases/base/ui/input.tsx` | `tools/setup-ui/src/components/ui/input.tsx` | adapt |
| `apps/v4/registry/bases/base/ui/tabs.tsx` | `tools/setup-ui/src/components/ui/tabs.tsx` | adapt |
| generated badge, alert, skeleton, and spinner recipes | matching `tools/setup-ui/src/components/ui` files | adapt |
| generated `src/lib/utils.ts` | `tools/setup-ui/src/lib/utils.ts` | copy |
| generated `components.json` | `tools/setup-ui/components.json` | adapt aliases only |

## Non-goals

- Do not change registry semantics or component dependencies.
- Do not change setup server authority or security.
- Do not alter a target workspace during frontend development.
- Do not deploy or push.
- Do not add decorative motion that does not explain state or direction.

## Propagation paths

- Entry point: `tools/setup-ui/src/main.tsx`
- Product flow: `tools/setup-ui/src/App.tsx`
- Setup client: `tools/setup-ui/src/api.ts`
- Component system and theme: `tools/setup-ui/src/components`, stylesheet entry,
  package manifest, and lockfile
- Built setup assets consumed by the setup server
- Setup UI tests and repository frontend verification profile

## Closure

- Status: active
- Final revision: pending
- Verification: pending
