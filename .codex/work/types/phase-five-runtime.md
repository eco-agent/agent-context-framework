# Type architecture contract: Phase 5 runtime

## Domain concepts

- Runtime source workspace
- Explicit target repository root
- Runtime bootstrap request and outcome
- Runtime doctor state
- Bounded repository-context request and result
- Scoped-session hook binding, input, and decision
- Context registry, project configuration, and installation lock

## Valid states

- `materialized`: source manifest and lockfile exist; installation and build are intentionally absent.
- `dependencies-missing`: source is valid but runtime dependencies are unavailable.
- `build-missing`: dependencies are available but one or more required generated entry points are absent.
- `operational`: dependencies and every required generated entry point are present.
- `invalid`: the runtime root, manifest, lockfile, package-manager pin, or source topology violates the fixed contract.
- Bootstrap request is exactly `install-and-build` or `no-install`.
- Hook evaluation is exactly `allow`, `deny`, `context`, or `noop`.
- Hook failure routing is exactly `session-start`, `pre-tool-use`, or `unclassified`; only a structurally parsed `SessionStart` may produce session context, while `unclassified` fails closed as `PreToolUse`.

## Invalid states to exclude

- A bootstrap request containing a command, script name, package-manager arguments, or registry-provided executable data.
- An operational result when dependencies or build output are absent.
- A repository-context or hook target that resolves outside its explicit repository root.
- A hook binding that mixes absent scope data with an active state.
- A hook binding containing objective, lease, run, scheduler, task-envelope, or agent-loop state.
- A runtime package importing from the host workspace.

## Allowed transitions

- `materialized` or `dependencies-missing` -> `operational` through the fixed install-and-build bootstrap.
- `build-missing` -> `operational` through the fixed build operation.
- Any source state -> the corresponding classified state through doctor, without mutation.
- `no-install` -> `materialized` report only; it never claims operational status.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Installer CLI | Argument strings | Exact command/flag parser | `RuntimeBootstrapRequest` |
| Runtime root | User-supplied project path | Resolve, realpath, nested-root and manifest checks | `RuntimeWorkspace` |
| Runtime manifest/lock | JSON/YAML filesystem bytes | Strict fixed-field/version checks | Runtime doctor state |
| Registry/config/lock | Parsed JSON unknown | Existing strict decoders | Context installation contracts |
| Repository-context CLI | Argument strings and cursors | Existing exact parser and cursor decoder | Read/search request |
| Hook stdin | Parsed JSON unknown | Strict hook-input decoder | Hook input variant |
| Hook failure routing | Parsed JSON unknown or JSON parse failure | Structural event classifier | Preserved event identity or `unclassified` |
| Hook binding | Parsed JSON unknown | Strict scoped-session decoder and source-hash validation | Active hook scope |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| `RuntimeBootstrapRequest` | Exact root and fixed mode; no executable data | CLI arguments |
| `RuntimeBootstrapResult` | Mode-specific operational claim | Bootstrap execution |
| `RuntimeDoctorState` | One exhaustive runtime lifecycle classification | Filesystem evidence |
| `RepositoryContextResult` | Bounded content plus complete accounting metadata | Read/search execution |
| `ScopedSessionBinding` | Validated root, session, writable paths, source hashes, and compact context | Binding JSON |
| `HookDecision` | Complete Codex hook response intent without process side effects | Hook evaluator -> CLI output |

## Failure semantics

- Expected outcomes: materialized but not operational, no repository search match, hook no-op, hook denial.
- Exceptional failures: invalid runtime topology, path escape, source mutation during read, malformed cursor, missing required executable, install/build failure.
- Translation boundaries: bootstrap CLI and hook CLI translate exceptions once into stable exit/output behavior while preserving error causes internally.
- A strictly decoded `SessionStart` or structurally identified malformed `SessionStart` translates failures to session context. Invalid JSON cannot establish event identity and translates to a fail-closed patch denial.

## Public contracts affected

- Development installer API and CLI
- Nested runtime package exports and CLIs
- Runtime build and doctor scripts

## Decisions and rejected alternatives

- Rejected copying the orchestration skill's bundled SDK runtime because Phase 5 expressly excludes long-horizon Codex orchestration.
- Rejected copying whole framework packages because each contains out-of-scope objective or host-workspace concerns.
- Rejected registry-provided bootstrap commands because executable data must remain fixed and typed in the installer.
- Rejected optional-field lifecycle objects because they permit false operational states.
- Rejected raw substring inspection because JSON whitespace and key order are representation details, not hook event identity.
- Rejected pnpm/Corepack cache-path discovery because those layouts are private installation details; the bootstrap uses Corepack's public version-qualified command.

## Verification evidence

- Runtime bootstrap parsing accepts only the two declared modes; tests prove no command field or registry executable path exists.
- Runtime doctor decodes one exhaustive lifecycle status and rejects inconsistent operational claims.
- Shared, policy, repository-context, and hook packages compile with strict TypeScript 7 settings including exact optional properties and unchecked index access.
- Package-local tests exercise valid and invalid registry, path, hook, cursor, scope, and lifecycle boundaries.
- The checked-in non-Node isolation gate demonstrates `dependencies-missing` -> `operational`, exercises policy/repository-context/hooks, then proves source edit -> rebuilt behavior without a host manifest or host-file hash mutation.
