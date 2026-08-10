# Framework setup UI

## Outcome

Create the first bounded slice of a local-first framework setup application: a terminal command starts a loopback HTTP server and prints a tokenized localhost URL; the browser loads the target repository and registry state, lets the user select additional components, and applies those additions through the existing transactional installer.

## Decisions

- Owner: `tools/setup-ui` owns the browser application and its compiled static assets.
- Owner: `tools/dev-tooling` owns the loopback HTTP boundary and setup launcher beside the installer implementation. The setup boundary calls its existing inspection, registry, initialization, and add operations directly.
- T3 Code at commit `67ef189d8b7b68c3096350db404bd649704ec6f2` is the pinned product precedent. Its MIT-licensed settings shell, search interaction, controls, and visual tokens are copied before adaptation.
- The first slice is additive. Existing selected components are shown as installed and cannot be removed in this flow. Removal, update, repair, and overwrite controls are non-goals for this slice.
- The server binds only to `127.0.0.1`. A random token is required on the initial document request and every API request. The target root is fixed when the process starts and cannot be supplied by browser input.
- Setup state is represented by explicit transport variants. Untrusted request bodies are parsed once at the HTTP boundary.
- The browser uses ordinary HTTP request/response behavior. WebSockets, task queues, databases, agent loops, objectives, and orchestration are outside this setup surface.
- No registry component is added for the setup UI in this slice. It is a framework-owned development and distribution entrypoint, not content installed into downstream repositories.

## State

- Branch: `codex/framework-setup-ui`
- Worktree: `D:/dev/agent-context-framework-setup-ui`
- Base revision: `d5c8ee35d8427f30d9e7a241cbb8761312a96032`
- Upstream precedent: `https://github.com/pingdotgg/t3code.git` at `67ef189d8b7b68c3096350db404bd649704ec6f2`
- Upstream license: MIT, copyright 2026 T3 Tools Inc.
- Live `app.t3.codes` inspection was attempted on 2026-08-10; the hosted application returned `Non-compliant action` to the automated browser. The pinned repository source is therefore the authoritative implementation evidence.
- The official `npx t3` package was subsequently launched locally through its generated Windows binary and paired successfully. Its live settings route confirmed the open-row surface and compact navigation recorded in `.codex/work/frontend/framework-setup-ui-live-reference.md`.

## Topology

```text
pnpm agent-context setup --cwd <repository>
  -> setup launcher
     -> loopback-only HTTP server + fixed authorized root
        -> GET /api/setup
           -> inspectProject + loadContextRegistry
        -> POST /api/install
           -> initProject when needed
           -> addComponent for each newly selected component
        -> built React browser application
           -> searchable component navigation
           -> additive component selection
           -> review and apply result
```

## First cross-layer slice

1. Start the command against a real repository root.
2. Open the printed tokenized localhost URL.
3. Load initialized state, registry revision, selected components, component dependencies, capabilities, and license counts.
4. Search and select one or more uninstalled registry components.
5. Review the explicit dependency closure.
6. Apply additions through the existing installer.
7. Show a typed success, blocked, or failure result and refresh installed state.

The slice covers loading, uninitialized, populated, empty-search, hover, focus-visible, active selection, disabled installed components, applying, success, blocked, and error states. At narrow widths the left navigation becomes a compact top section without duplicating state.

## Replacements

- No framework behavior is replaced.
- Copied T3 Code route, navigation, controls, HTML, and stylesheet sources become owned `tools/setup-ui` files and are then directly adapted to the setup domain.
- There is no compatibility layer or parallel setup representation.

## Non-goals

- Removing or updating installed components.
- Overwriting locally modified instructions.
- Runtime bootstrap, recovery, or doctor repair actions.
- Remote hosting, LAN binding, authentication accounts, telemetry, persistence, or deployment.
- Objective kernels, schedulers, queues, databases, task envelopes, Codex SDK workflows, or long-running agent loops.

## Propagation

- Export the required installer entrypoints from `@agent-context/dev-tooling`.
- Add the setup UI workspace and TypeScript project reference.
- Add `setup` parsing and execution to the existing `agent-context` command.
- Build browser assets before running the launcher; production server serves only those generated assets.
- Add focused parser, HTTP boundary, setup service, and browser build checks.

## Verification

- Focused TypeScript builds pass for `tools/setup-ui` and `tools/dev-tooling`.
- Focused tests pass for token enforcement, malformed and unknown requests, real materializer installation, and CLI argument parsing.
- Dependency adoption policy passes for React, React DOM, their declarations, and the Vite Plus core alias.
- Local browser smoke passed against a temporary non-Node repository: the setup page loaded registry `0.5.2`, installed `core`, refreshed to `Installed`, and reported four written paths.
- No broad acceptance run unless a regression requires it.
