# Type architecture contract

## Domain concepts

- `AuthorizedSetupTarget`: the canonical repository root and framework root fixed by the launcher.
- `SetupCatalog`: registry revision and installable component summaries.
- `SetupSnapshot`: initialized state plus directly selected components.
- `SetupInstallCommand`: a validated, non-empty ordered set of component names requested by the browser.
- `SetupInstallOutcome`: one of applied, blocked, or rejected.

## Valid states

- Snapshot: `{ status: "ready", initialized, selectedComponents, catalog }`.
- Install request: `{ components: readonly string[] }` after duplicate removal and registry membership validation.
- Applied: `{ status: "applied", snapshot, writtenPaths }`.
- Blocked: `{ status: "blocked", snapshot, conflicts }`.
- Rejected: HTTP 400 for malformed or unknown component input; HTTP 403 for a missing or invalid launch token.

## Invalid states to exclude

- A browser-provided filesystem root.
- An install command with zero components, duplicates, unknown components, or the already-selected `core` default as a new addition.
- A success outcome without the refreshed snapshot.
- A blocked outcome without at least one conflict description.
- A response that is simultaneously applied and blocked.
- A server listening on a wildcard or non-loopback address.

## Allowed transitions

- `loading -> ready | load-error`
- `ready -> applying` after a validated non-empty selection.
- `applying -> applied | blocked | request-error`
- `applied -> ready` with the refreshed snapshot.
- Existing installed selections never transition to removed in this slice.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| CLI arguments | `readonly string[]` | existing CLI parser extended with setup-only flags | fixed target root and setup launch options |
| Initial URL/API | query/header string | constant-time token comparison | authorized request |
| Install body | parsed JSON `unknown` | strict object and component-name validation against catalog | `SetupInstallCommand` |
| Registry file | JSON `unknown` | existing `decodeContextRegistry` through `loadContextRegistry` | `ContextRegistryV2` |
| Target repository | filesystem path | `realpath` in existing installer | canonical project root |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| `ContextRegistryV2` | complete decoded registry | projected to `SetupCatalog` |
| `ContextInspection` | canonical installer inspection | projected to `SetupSnapshot` |
| HTTP JSON | no compile-time guarantee | parsed once to command or serialized from outcomes |
| Browser view state | explicit loading/ready/applying/error variant | derived from API responses |

## Failure semantics

- Expected outcomes: installer collision/blocking is returned as `status: "blocked"`; no process crash.
- Exceptional failures: unreadable roots, unavailable built assets, server binding failure, and installer invariant failures throw to the HTTP/CLI boundary.
- Translation boundaries: the HTTP adapter maps malformed input to 400, invalid authorization to 403, expected blocked plans to 409, and unexpected failures to a concise 500 response.

## Public contracts affected

- `@agent-context/dev-tooling` exports existing context installer functions and their existing result types.
- `agent-context setup --cwd PROJECT [--port PORT] [--no-open]` becomes a new CLI command.
- `tools/setup-ui` exposes a launcher callable from the existing CLI.

## Decisions and rejected alternatives

- Rejected accepting `cwd` in the browser API because it would expand filesystem authority after launch.
- Rejected a universal response with optional `result`, `error`, and `conflicts`; discriminated outcomes prevent contradictory states.
- Rejected WebSockets and persistent jobs because setup mutations are bounded request/response operations.
- Rejected a second installer implementation or direct config-file writes.

## Verification evidence

- Parser tests exercise malformed JSON, duplicate names, unknown names, missing token, and wrong token.
- Service tests exercise uninitialized initialization, additive installs, preserved existing selections, and blocked result translation.
- TypeScript build proves exhaustive browser state rendering and server outcome handling.
