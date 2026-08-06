# Context registry v2 type contract

## Domain concepts

- `Registry`: immutable versioned component catalog with exact source identity.
- `Component`: named dependency node with capabilities, licenses, and artifacts.
- `Artifact`: one closed deterministic projection into a project target.
- `ProjectConfig`: explicit selected top-level components.
- `ProvenanceLock`: prior source identity and exact installed ownership scope.
- `Assessment`: comparison of previous source, current project, and next source.
- `Mutation`: one planned write, deletion, or structural replacement.
- `Transaction`: staged complete mutation set with a recovery journal.

## Valid states

```text
uninstalled          no lock; target ownership scope absent
unchanged            current project equals previous source equals next source
locally-modified     current project differs; previous source equals next source
upstream-changed     current project equals previous source; next source differs
diverged             current project and next source both differ from previous
untracked-conflict   no lock; target ownership scope already exists
obsolete-unchanged   locked scope no longer desired; project equals previous source
obsolete-modified    locked scope no longer desired; project differs from previous source
```

An assessment includes hashes and a bounded textual difference where content
exists. It never includes an optional combination that contradicts its status.

## Invalid states to exclude

- A component with duplicate dependencies or artifact identities.
- An artifact without a source hash, target, component owner, or operation.
- A whole-file owner sharing a target with any other artifact.
- Two structural artifacts owning the same JSON pointer or TOML key path.
- A lock artifact without its prior source hash.
- A ready update containing a diverged or untracked-conflict assessment.
- A transaction without a complete next config and lock.
- Registry bytes that do not match their declared source hash.
- Arbitrary commands or model-produced patches in registry data.

## Allowed transitions

```text
inspect -> report only
init -> install core when absent; otherwise assess without implicit update
add -> expand selected dependency graph and install only uninstalled scopes
diff -> report every assessment without writes
update -> apply upstream-changed and obsolete-unchanged mutations only
remove -> remove selected component; delete unchanged scopes and retain modified source
doctor -> report schema, transaction, reference, capability, and installation health
```

`remove` converts modified owned sections/files into ordinary project source and
drops their provenance. It deletes only content still equal to its previous
registry source.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Registry | JSON plus source files | Exact v2 decoder, hash and path verifier | `ContextRegistryV2` |
| Project config | Project JSON | Exact v2 decoder | `ContextProjectConfigV2` |
| Provenance lock | Project JSON | Exact v2 decoder and ownership uniqueness | `ContextInstallationLockV2` |
| JSON target/source | UTF-8 JSON | Native parser plus closed member declarations | Structural JSON value |
| TOML target/source | UTF-8 TOML | Maintained TOML parser plus closed table paths | Structural TOML value |
| Filesystem paths | Portable relative strings | Root containment and symlink rejection | Resolved safe paths |
| Staged transaction | Project JSON and staged files | Exact journal decoder plus staged hashes | Recoverable pending transaction |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| Registry source declaration | Concise authoring input; may contain directory selections | Registry builder only |
| Built registry | Exact per-file artifacts and hashes | Decoder to trusted registry |
| Desired artifact | Verified source bytes plus resolved component | Built registry |
| Locked artifact | Previous source and ownership identity | Persisted provenance lock |
| Assessment | Exhaustive three-way state | Desired + locked + project target |
| Ready plan | Complete mutations and next metadata; no blocking state | Assessments |
| Blocked plan | Conflicts and no mutations | Assessments |
| Transaction journal | Intended mutations and staged hashes | Ready plan |

## Failure semantics

- Expected outcomes: all eight assessment states, missing declared capabilities,
  dirty installation, and an interrupted transaction reported by doctor.
- Exceptional failures: schema corruption, source hash mismatch, escaping or
  symlinked path, invalid UTF-8, invalid JSON/TOML, duplicate ownership,
  dependency cycle, and filesystem I/O.
- Translation boundaries: CLI maps dirty read-only results and blocked mutation
  plans to non-zero exit status; library callers branch on typed variants.

## Public contracts affected

- `tools/repo-policy/src/context-installation.ts`
- `tools/dev-tooling/src/context-installer.ts`
- `tools/dev-tooling/src/context-installer-cli.ts`
- `registry/registry.json`
- `.agent-context/config.json`
- `.agent-context/lock.json`

## Decisions and rejected alternatives

- Directly replace v1; compatibility would create two meanings for ownership.
- Keep one deep installer module until stable independent structural and
  transaction boundaries justify extraction.
- Use maintained diff and TOML packages rather than reconstructing established
  parsing and line-diff algorithms.
- Preserve formatting outside owned text/TOML regions. JSON is reserialized
  deterministically because JSON has no comments or standard section syntax.
- Do not store model judgments, inferred project facts, or arbitrary commands.

## Verification evidence

- Pending implementation and focused contract tests.

