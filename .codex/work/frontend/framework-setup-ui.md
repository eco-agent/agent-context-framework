# Framework setup UI frontend specification

## Purpose

The interface helps a maintainer inspect one explicitly authorized repository and add framework components without reconstructing registry dependencies or typing a sequence of installer commands.

## Evidence and ownership

- Product precedent: T3 Code settings at pinned revision `67ef189d8b7b68c3096350db404bd649704ec6f2`.
- Evidence: `.codex/work/frontend/framework-setup-ui-reference.md`.
- Source/materialization contract: `.codex/work/framework-setup-ui.implementation.json` and `.codex/work/frontend/framework-setup-ui-materialization.json`.
- Browser application, layout, and interaction owner: `tools/setup-ui`.
- Registry and mutation owner: `tools/dev-tooling` plus existing `tools/repo-policy` contracts.

## Information topology

```text
Setup shell
├── Sidebar
│   ├── Product label
│   ├── Component search
│   ├── All components
│   └── Selected review
└── Primary surface
    ├── Authorized repository + registry revision
    ├── Component rows
    │   ├── selection control
    │   ├── exact registry name
    │   ├── dependency names
    │   └── capabilities/license count
    └── Sticky action row
        ├── dependency closure summary
        └── Apply additions
```

There is one primary content surface. Rows, spacing, color, and a sticky action edge provide hierarchy; components are not presented as a grid of cards.

## Visible content contract

- Title: `Agent Context Setup`.
- Repository line: canonical target path supplied by the launcher.
- Registry line: exact registry revision.
- Search placeholder: `Search components`.
- Component copy comes only from registry names, dependencies, capabilities, and license facts.
- Existing selection state: `Installed`.
- Action: `Install selected`.
- Empty search: `No components match this search.`
- No new selection: `Choose at least one component to continue.`
- Success reports written paths returned by the installer.
- Blocked state reports exact installer conflict paths and details.

## Interaction and state

- `/` focuses and selects the component search unless focus is already in an editable control.
- Escape clears a non-empty search.
- Arrow keys move through visible component rows; Enter/Space toggles the active uninstalled row.
- Clicking a row toggles its checkbox. Installed rows are disabled and cannot be deselected.
- The review section shows explicitly selected components and their resolved dependency closure.
- Applying disables all selection controls and the action until the request completes.
- On success the catalog is refreshed; newly installed direct selections become disabled installed rows.
- On blocked or error the selection remains available for correction/retry.

## Responsive behavior

- At wide widths, the sidebar is fixed at a compact settings-navigation width and the content scrolls independently.
- Below 760px, the sidebar becomes a compact top section with search and two navigation choices; the primary surface follows beneath it.
- The sticky action row wraps text before controls. No horizontal page scroll is permitted.

## Visual contract

- Preserve T3 Code's restrained neutral surfaces, compact type scale, selected-row treatment, rounded controls, and low-contrast separators.
- Use one small green success accent and one red error accent only for semantic states.
- Use the system sans stack; no network font dependency.
- Body includes `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`.
- Elevated action/status surfaces use shadow without an additional border.
- Motion is limited to short color, opacity, and layout transitions and becomes static under `prefers-reduced-motion`.

## Accessibility

- Semantic headings preserve one `h1` and section `h2` hierarchy.
- Search is labelled and uses `role=listbox` only while results exist.
- Rows use native checkboxes and labels.
- Status changes use a polite live region; failures use `role=alert`.
- Every interactive state has a visible focus indicator and a minimum 36px target height.
- Color is never the only installed, selected, success, or error indicator.

## First slice boundaries

Included: launch, authorization, loading, inspection, search, additive selection, dependency review, apply, refreshed success, blocked, and error.

Excluded: remove, update, overwrite, recover, bootstrap, remote access, account state, persistence, theme settings, and orchestration.

## Acceptance gates

- `precedent-shell`: mapped source files and retained MIT notice are materialized from the exact pin.
- `authorized-root`: the browser cannot choose or change the filesystem root.
- `additive-install`: existing selections survive and only new valid names reach installer calls.
- `dependency-review`: dependency closure displayed before apply matches registry resolution.
- `state-coverage`: loading, empty, populated, disabled, applying, success, blocked, and error render distinctly.
- `responsive-shell`: the same state is usable at desktop and narrow viewport widths.
