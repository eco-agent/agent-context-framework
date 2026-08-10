# T3 Code product precedent evidence

## Pin

- Product: T3 Code
- Repository: `https://github.com/pingdotgg/t3code.git`
- Revision: `67ef189d8b7b68c3096350db404bd649704ec6f2`
- License: MIT
- License holder: T3 Tools Inc., 2026
- Verified routes/source: `apps/web/src/routes/settings.tsx`, `apps/web/src/components/settings/SettingsSidebarNav.tsx`, `apps/web/src/components/ui/{button,checkbox,input}.tsx`, `apps/web/src/index.css`, and `apps/web/index.html`.

## Observed implementation

The pinned settings implementation uses a compact navigation surface next to one primary settings surface. Search is embedded in the navigation and supports `/` focus, arrows, Enter, and Escape. The selected navigation row is quiet but unambiguous. The content area uses a restrained top bar, dense rows, small controls, muted secondary copy, and strong focus-visible behavior instead of a dashboard of cards.

The hosted route `https://app.t3.codes/` was also opened in the in-app browser on 2026-08-10. It returned a page titled `Non-compliant action` under automated access, so no hosted-screen claim is used as implementation evidence. The exact pinned source is authoritative.

## Adopted behaviors

- Compact left navigation plus one primary content surface.
- Search-first navigation with `/`, arrow, Enter, and Escape behavior.
- Dense control rows with muted supporting text.
- Explicit hover, active, focus-visible, and disabled states.
- Responsive collapse of the navigation without duplicating application state.
- Neutral light/dark system tokens and antialiased body rendering.

## Required deviations

- Replace T3 Code routes with one setup workflow and in-page sections.
- Replace account, provider, appearance, and archive content with registry components and installation review.
- Replace authentication/pairing with a process-local random launch token.
- Replace T3 Code server/WebSocket concerns with a bounded loopback HTTP API.
- Do not copy project/workspace chat, terminals, orchestration, or agent-loop topology.

## Source mapping

| T3 Code source | Owned target | Mode | Preserved role |
| --- | --- | --- | --- |
| `apps/web/src/routes/settings.tsx` | `tools/setup-ui/src/App.tsx` | adapt | primary settings surface and top bar |
| `apps/web/src/components/settings/SettingsSidebarNav.tsx` | `tools/setup-ui/src/SetupSidebar.tsx` | adapt | search and compact navigation interaction |
| `apps/web/src/components/ui/button.tsx` | `tools/setup-ui/src/components/Button.tsx` | adapt | button sizes, variants, and focus behavior |
| `apps/web/src/components/ui/checkbox.tsx` | `tools/setup-ui/src/components/Checkbox.tsx` | adapt | selection control behavior |
| `apps/web/src/components/ui/input.tsx` | `tools/setup-ui/src/components/Input.tsx` | adapt | search input behavior |
| `apps/web/src/index.css` | `tools/setup-ui/src/index.css` | adapt | design tokens and state grammar |
| `apps/web/index.html` | `tools/setup-ui/index.html` | adapt | browser document and color-scheme bootstrapping |
| `LICENSE` | `tools/setup-ui/LICENSE.t3code-upstream` | copy | retained MIT notice |

The framework materializer records SHA-256 and byte size for every mapped source file in `.codex/work/frontend/framework-setup-ui-materialization.json`.
