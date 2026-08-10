# Type architecture contract: operator selection plan

## Domain concepts

- Direct component: a component explicitly selected in project configuration or
  requested by the operator.
- Resolved component: a direct component or dependency in the deterministic
  registry closure.
- Bundle: a dependency-only component that provides a curated registry-owned
  entry point without owning artifacts of its own.
- Footprint: declared artifact, unique target, skill target, and isolated runtime
  target counts for a resolved closure.
- Selection preview: a read-only real-installer plan for existing direct
  selections plus proposed additions.
- Activation disclosure: a capability whose files may be installed while its
  behavior remains conditional, such as hooks awaiting a scoped session binding.

## Valid states

```text
uninitialized -> preview(core + requested) -> ready | blocked
initialized   -> preview(existing + requested) -> current | ready | blocked
initialized   -> inspect(existing) -> current | drifted | blocked
preview       -> explicit install request -> existing transactional materializer
```

Every preview includes direct, requested, resolved, and transitive component
names; footprint counts; required and recommended capabilities; drift counts;
trust requirements; and conditional activation disclosures.

## Invalid states to exclude

- Computing dependency closure only in the browser client.
- Calling a mutating installer command to obtain a preview.
- Presenting a transitive component as a direct selection.
- Calling every raw registry component a curated preset.
- Hiding artifact/target counts, external runtime requirements, or third-party
  notice counts behind a single component count.
- Describing Codex hooks as active when Phase 7 provides no session-binding
  producer.
- Inferring capability availability from the host or framework workspace.
- Returning a ready preview when the real planner reports an ownership conflict.

## Allowed transitions

- `help` is repository-independent and never loads or writes project state.
- `inspect` previews exactly the configured direct selection and never writes.
- `plan [COMPONENT...]` previews configured selections plus additions and never
  writes; an uninitialized project includes required `core` selection.
- Setup UI requests a server-owned preview whenever direct selections change.
- Install remains a separate explicit request through the existing materializer.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| CLI arguments | Command, components, flags | Discriminated CLI parser with command-specific flags | Help, inspect, plan, or mutation command |
| Setup request JSON | Selected component names | Strict setup command decoder against registry names | Requested direct additions |
| Registry JSON | Components, dependencies, artifacts, capabilities, licenses | Existing strict registry decoder and deterministic resolver | Resolved closure and footprint |
| Project files and lock | Arbitrary current bytes and prior membership | Existing safe path reader, lock decoder, projection, and planner | Assessment summary and plan status |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| `ContextSelectionPreview` | Server/CLI domain value from decoded registry and real planner | Current config, lock, registry, requested additions |
| `ContextInspection` | Current-project snapshot plus current selection preview | `inspectProject` |
| `SetupSnapshot` | Browser-safe registry catalog, current inspection, bundle classification, and activation notes | Strict setup decoder |
| `SetupSelectionPreview` | Browser-safe projection of the server plan | `/api/plan` response decoder |

## Failure semantics

- Expected outcomes: current, changes-ready, or blocked preview; no components
  requested; hooks await a binding; policy awaits explicit configuration.
- Exceptional failures: unknown/duplicate component, invalid project config or
  lock, registry corruption, unsafe path, or unreadable project state.
- Translation boundaries: CLI renders text/JSON; setup server maps request errors
  to 400 and plan conflicts to a typed blocked response.

## Public contracts affected

- Installer inspection and read-only planning API.
- CLI grammar, help, text formatting, JSON output, and exit status.
- Setup contract, server snapshot/plan endpoint, browser client, and focused tests.
- README operator documentation.

## Decisions and rejected alternatives

- Reuse the real installer planner rather than maintain a second footprint or
  conflict model in the UI.
- Classify dependency-only registry components as bundles instead of inventing a
  hard-coded “full framework” profile whose CSS/runtime choices are not universal.
- Keep capability availability observational and explicit; the framework may
  declare requirements but does not infer host readiness.
- Report hooks as requiring a scoped binding rather than adding a binding producer,
  which would cross the orchestration exclusion boundary.

## Verification evidence

- Pending focused CLI parser/formatter, selection preview, setup contract/server,
  and setup client checks.
