# Type architecture contract: Phase 6 repository policy

## Domain concepts

- Runtime component membership
- Repository-policy configuration state
- Explicit repository facts
- Package-manager declaration
- Tokenized verification command
- Named verification profile
- Preserved policy invariant
- Repository observation
- Policy doctor result
- Policy verification result

## Valid states

- Policy configuration is exactly `unconfigured` or `configured`.
- `unconfigured` contains no repository facts, commands, or profiles.
- `configured` contains one complete repository-facts object, zero or more
  commands, one or more profiles, and one default profile that exists.
- Package manager is exactly `none` or a declared name and version.
- Repository layout is exactly `none`, `single-package`, or `monorepo`.
- Frontend presence is an explicit boolean and does not imply a framework.
- A profile references only declared command identifiers.
- Runtime doctor requires source and generated output only for packages that are
  actually materialized beneath `packages/`.
- Policy doctor is exactly `configuration-required`, `ready`, or `invalid`.
- A command is exactly a shell-free process argument vector or a named package
  script bound to the configured versioned package manager.
- Command execution is exactly `passed`, `failed`, or `timed-out`.

## Invalid states to exclude

- Partial repository facts or optional fields inside configured policy.
- An unconfigured policy carrying commands or inferred repository facts.
- Duplicate languages, documentation roots, commands, profiles, or profile
  command references.
- A default profile that is not declared.
- A command containing a shell string instead of executable and argument tokens.
- A non-positive timeout or timeout larger than Node's timer boundary.
- Repository-relative paths that escape through absolute paths, backslashes,
  empty segments, `.` segments, or `..` segments.
- A preserved-invariant manifest that omits, duplicates, renames, or adds an
  unsupported invariant.
- Policy verification against an unconfigured or invalid policy.
- A Wave 3 component resolving hooks, repository-context, or objective source.

## Allowed transitions

- Missing policy -> installed `unconfigured` policy through component addition.
- `unconfigured` -> `configured` only through an explicit project-owned edit.
- Configured policy -> another configured policy through an explicit project edit.
- Materialized runtime -> operational through the existing fixed bootstrap.
- Operational runtime source edit -> operational behavior through fixed rebuild.
- Any installed policy state -> doctor classification without mutation.
- Configured policy + selected profile -> ordered command outcomes through verify.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Policy JSON | Parsed JSON unknown | Strict configuration decoder | `RepositoryPolicyConfiguration` |
| Invariant JSON | Parsed JSON unknown | Exact manifest decoder | `RepositoryPolicyInvariantManifest` |
| Policy CLI | Argument strings | Exact operation/flag parser | `PolicyCliRequest` |
| Wrapper CLI | User arguments | Fixed operation parser | Fixed runtime CLI invocation |
| Repository root | User or wrapper path | Realpath and project-owned path checks | Authorized repository root |
| Config paths | Project strings | Portable relative-path decoder | Repository-relative paths |
| Command tokens | Project strings | Non-empty token and timeout validation | `PolicyCommand` |
| Child process | Exit, error, timeout events | One execution boundary | `PolicyCommandOutcome` |
| Context config/lock | Parsed JSON unknown | Existing Phase 3 decoders | Context installation health |
| Runtime packages | Filesystem directories/manifests | Runtime package discovery | Required source/output set |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| `UnconfiguredRepositoryPolicy` | Carries no invented project decisions | Installed baseline JSON |
| `ConfiguredRepositoryPolicy` | Complete explicit facts and resolvable profiles | Project-owned JSON |
| `RepositoryFacts` | Repository type, language, documentation, package-manager, layout, and frontend decisions are present | Configured policy |
| `PolicyCommand` | Process tokens or package-script tokens plus a timer-safe timeout | Configured policy |
| `VerificationProfile` | Ordered references to declared commands | Configured policy |
| `RepositoryInspection` | Observations only; never a configuration | Filesystem reads |
| `PolicyDoctorResult` | Exhaustive readiness classification plus diagnostics | Config/invariant/context evidence |
| `PolicyVerificationResult` | Ordered typed outcomes for one declared profile | Doctor-ready policy + execution |

## Failure semantics

- Expected outcomes: configuration required, configured path missing, command
  failure, command timeout, and non-operational materialized runtime.
- Exceptional failures: malformed JSON, unknown fields, path escape, unsupported
  invariant set, missing selected profile, process spawn failure, and corrupted
  context installation state.
- Translation boundaries: runtime policy CLI translates exceptions once into a
  stable JSON failure; installer doctor translates runtime/policy execution into
  diagnostics without mutating the project.

## Public contracts affected

- Registry source authoring declarations and built registry `runtime-workspace`
  artifacts
- `runtime-base` and `repository-policy` component graphs
- Isolated runtime build, clean, and doctor scripts
- Isolated policy package exports and CLI
- `.agent-context/policy.json`
- `.agent-context/policy-invariants.json`
- `.agent-context/policy.mjs`
- Installer doctor result and text/JSON formatting

## Decisions and rejected alternatives

- Rejected installing the entire Phase 5 runtime in Wave 3 because that would
  distribute Wave 4 hook and repository-context source before authorization.
- Rejected making `repository-policy` the shared runtime owner because future
  independently selectable Codex components must not depend on repository policy.
- Rejected optional policy fields because they permit partially decided projects.
- Rejected inferred defaults because inspection evidence is not policy authority.
- Rejected raw shell command strings because they combine parsing and execution
  authority and cannot preserve argument boundaries.
- Rejected copying host `tools/repo-policy` because its objective and
  framework-specific contracts are explicitly outside the distributable runtime.
- Rejected a second bootstrap path because Phase 5 already owns a fixed typed
  install/build operation.

## Verification evidence

- Pending implementation.
