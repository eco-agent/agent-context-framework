# Type architecture contract: Phase 7 Codex interface

## Domain concepts

- TOML owned member path
- JSON owned array item and stable identity
- Wave 4 agent profile
- Codex hook request and session binding lookup
- Authorized repository root
- Repository-context MCP request and bounded result
- Project-local Codex reference invariant
- Wave 4 component closure

## Valid states

- A `toml-members` artifact owns one or more non-overlapping scalar or table paths.
- A `json-array-items` artifact owns one or more items beneath declared array
  pointers, each with an explicit stable identity.
- A projected scope is absent, present with a deterministic hash, or malformed.
- Hook binding lookup is exactly `missing`, `valid`, or `invalid`.
- Missing hook binding produces no decision and no additional context.
- Valid hook binding evaluates through the existing scoped-session hook contract.
- Invalid, stale, or mismatched binding produces the existing fail-closed result.
- An MCP request is exactly `read` or `search`; each variant contains only the
  fields that operation accepts.
- Repository context operates only beneath one explicit real authorized root.
- Wave 4 local references point only to project paths under `.codex` or
  `.agent-context/runtime` as declared by their owning artifact.
- `codex-runtime` resolves exactly the three public Codex components plus their
  `core` and `runtime-base` dependencies.

## Invalid states to exclude

- Two artifacts owning equal, ancestor, or descendant TOML paths.
- Two artifacts owning the same JSON array item identity.
- An array item identity derived from position or mutable hook command text.
- Removal of unrelated TOML members or unrelated hook matcher entries.
- Treating a missing hook binding as invalid or authorizing an invalid binding.
- A binding filename containing an unvalidated session identifier.
- A valid binding whose repository root, session identifier, freshness, or
  source evidence does not match the current request.
- An MCP request combining read and search fields or enabling an unbounded mode.
- Absolute framework paths, root escape, symlink escape, host `tools/` paths,
  `tsx`, host package filters, user-global Codex paths, or duplicate inline hooks.
- A Wave 4 graph containing repository policy or any objective/orchestration code.

## Allowed transitions

- Absent owned member/item -> installed from canonical registry source.
- Installed unchanged member/item -> updated when its canonical source changes.
- Locally modified member/item -> preserved with provenance dropped on removal.
- Obsolete unchanged member/item -> removed while unrelated target content remains.
- Interrupted structured mutation -> recovered through the existing transaction
  journal with the same pre-mutation or complete post-mutation guarantees.
- Hook request + missing binding -> inert output.
- Hook request + valid binding -> existing scoped hook evaluation.
- Hook request + invalid binding -> fail-closed hook response.
- Authorized root + valid MCP request -> bounded content response.
- Any Wave 4 installation state -> doctor classification without mutation.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Registry artifacts | Parsed JSON unknown | Closed registry decoder plus ownership collision checks | `ContextRegistryArtifact` |
| TOML source/target | UTF-8 TOML | Existing TOML parser plus declared member-path decoder | Owned TOML member map |
| JSON source/target | UTF-8 JSON | JSON parser plus declared array-pointer and identity decoder | Owned JSON array item map |
| Agent TOMLs | Canonical registry text | Registry hashes and Wave 4 reference scan | Explicit agent profile |
| Hook stdin | Raw text | Structural event classification then strict hook decoder | Hook request or classified failure |
| Session identifier | Hook request string | Closed identifier parser | Binding filename key |
| Binding file | Parsed JSON unknown | Strict binding decoder plus root/session/freshness/source checks | Scoped-session binding |
| Repository root | CLI/config string | Absolute path, realpath, containment, and symlink checks | Authorized repository root |
| MCP stdin | JSON-RPC messages | Pinned MCP SDK and Zod schemas | Typed MCP operation request |
| Codex config source | TOML/JSON project paths | Wave 4 local-reference scanner | Project-local Codex interface |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| TOML member declaration | Closed owned paths with canonical values | Registry artifact and parsed TOML |
| JSON array item declaration | Closed array scopes and stable identities | Registry artifact and parsed JSON |
| `HookBindingLookup` | Exhaustive absence/validity state | Runtime state file plus current request |
| `AuthorizedRepositoryRoot` | Existing real root selected explicitly | MCP CLI argument |
| `RepositoryContextRequest` | Exactly one bounded read/search operation | MCP tool input |
| `RepositoryContextResult` | Bounded content, counts, and truncation/cursor state | Existing repository-context core |
| Wave 4 reference report | Exact accepted or rejected reference facts | Registry artifacts and installed project |

## Failure semantics

- Expected outcomes: absent structured scope, locally modified scope, missing hook
  binding, bounded/truncated repository result, no search matches, and project
  trust required.
- Exceptional failures: malformed structured source/target, duplicate ownership,
  invalid/stale/mismatched binding, malformed JSON, repository/root escape,
  symlink escape, invalid MCP request, unavailable `ripgrep`, invalid local
  reference, and unexpected protocol failure.
- Translation boundaries: projections convert parser failures to malformed scope;
  the hook CLI emits one Codex hook response or no output; the MCP adapter maps
  typed results and failures to MCP tool responses; installer doctor translates
  Wave 4 runtime/reference failures into diagnostics without mutation.

## Public contracts affected

- Registry and lock artifact unions and decoders
- Registry source authoring and builder
- Artifact projection and installer ownership validation
- Isolated hooks exports and Codex-facing CLI
- Isolated repository-context exports and MCP stdio CLI
- `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/*.toml`
- `codex-agents`, `codex-hooks`, `codex-repo-context`, and `codex-runtime`
- Runtime doctor, installer doctor, isolation verification, and acceptance sequence

## Decisions and rejected alternatives

- Reject complete `[agents]` ownership because it would overwrite unrelated agent
  settings and roles.
- Reject complete hook event-array ownership because it would overwrite unrelated
  matcher groups.
- Reject positional JSON identity because reorder-only edits are not ownership
  changes.
- Reject model inference from framework configuration because package selection
  must select an explicit stable profile.
- Reject a shared hook binding file because concurrent sessions require isolated
  authority and provenance.
- Reject copying the host repository-context server because it depends on Phase 8
  objective bindings, ledgers, and workflow behavior.
- Reject direct filesystem protocol handling when the isolated lockfile can reuse
  maintained pinned MCP SDK and Zod packages.
- Reject compatibility projections, inline hook duplication, global configuration,
  and non-project-local runtime references.

## Verification evidence

- Pending implementation.
