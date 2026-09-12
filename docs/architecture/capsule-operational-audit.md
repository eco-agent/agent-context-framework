# Capsule operational audit

## Outcome

Capsule v1 preserves and reconstructs its payload correctly, but it is not a
complete installation lifecycle. A project can build, verify, materialize, and
migrate a capsule. After migration, the ordinary installer and the capsule
verifier reject the lock that migration produced. There is no active update
command to take over. This is a release-blocking break, not a missing
convenience.

The capsule format is worth keeping. The surrounding split between lock v2,
lock v3, tracked activation files, ignored projections, migration, and the old
installer is where most of the complexity lives.

## Fixture and method

The audit used a disposable generated application at
`D:/dev/acf-capsule-operational-fixture-20260912`. The framework baseline was
`b51183c913979e002cab2f57072778be3da587b7` on branch
`codex/capsule-operational-audit`. No worktree, push, pull request, or merge was
used.

The fixture selected four direct components:

- `core`
- `skill-diagnose`
- `codex-runtime`
- `repository-policy`

That resolved to eight components. Before capsule creation, `.agent-context`
contained 55 files and 744,572 bytes. The built capsule contained 64 source
entries and occupied 231,169 bytes.

The fixture has three checkpoints:

| State | Revision |
| --- | --- |
| Expanded installation | `7c5be60ba546f181408fffbbd04420e939a771cf` |
| Capsule added | `7ec06db` |
| Lock v3 migration | `71cc1c093845926bfa6fb78cc09169ce4dd7fdca` |

## Public command results

| Path | Result | Operational note |
| --- | --- | --- |
| `build` | Passed | Produced deterministic verified bytes and refused to replace an existing capsule. |
| `list` | Passed | Read-only, but took about 6 seconds. |
| `inspect` | Passed | Returned about 14.5 KB and took about 8 seconds for 64 entries. |
| `verify` before migration | Passed | Verified the expanded v2 installation without writing. |
| `materialize` | Passed | Wrote ignored runtime and skill projections with a receipt. |
| repeated `materialize` | Passed | Returned `current` and wrote nothing, but still emitted about 28.5 KB of JSON. |
| materialize edited file | Blocked correctly | Named the changed generated skill file and did not replace it. |
| materialize missing file | Blocked correctly | Named the missing generated skill file and recovered after exact restoration. |
| `migrate` | Passed | Replaced lock v2 with lock v3 and removed verified tracked skill files. |
| repeated `migrate` | Passed | Returned `current` and wrote nothing, but emitted about 24.5 KB of JSON. |
| `diff`, equal capsules | Passed | Returned exit code 0 and no restart requirement. |
| `diff`, unequal capsules | Reported the change | Found the added component, twelve entries, and a restart requirement. It returned exit code 1 even though the comparison was valid. |
| `extract` | Passed | Wrote verified source paths to a new directory and refused an existing target. |
| corrupt capsule | Rejected correctly | A one-bit payload change named the exact entry hash mismatch. |
| plain Node bootstrap | Passed | Materialized a fresh state, returned `current` on repeat, and failed closed on a missing generated file. |
| packaged policy | Passed | `inspect` and `doctor` ran through the capsule runtime. |
| packaged hook | Passed | Remained inert when no session binding existed. |
| packaged repo-context MCP | Passed | Completed initialize, tool listing, README read, and search. |

The top-level `agent-context --help` output omits `capsule migrate`. Capsule help
includes it. Calling bootstrap with `--help` prints usage but returns exit code
1.

## Lifecycle breaks

### Migration strands the installer

After migration, this command fails before it can produce a plan:

```text
agent-context plan skill-codebase-inventory
```

The installer reports:

```text
Context installation lock contains unknown fields: frameworkRevision, capsule, activation, materialization.
```

The installer always decodes `.agent-context/lock.json` as schema 2. Migration
writes schema 3. The active command set has no `capsule update` operation, so a
migrated project cannot add, remove, or update a component through a supported
path.

### Migration also strands capsule verification

`capsule verify` succeeds against lock v2, then rejects lock v3 with the same
unknown-field error. The CLI calls the v2 verification function without first
checking the lock schema. A separate v3 verifier exists and the bootstrap uses
it, which explains why bootstrap succeeds while the public verifier fails.

This gap is not covered by the capsule tests. The migration test proves that a
second migration is a no-op, but it does not run installer planning or the
public verifier against the migrated fixture.

### Successful output is too large

Build, materialize, and migrate JSON repeat complete entry or path inventories.
A successful no-op should return identity, status, counts, and changed paths.
The caller should have to request the full manifest. The current output makes
automation logs hard to read and costs context every time an agent checks an
already-current project.

Migration also lists many generated paths in both `writtenPaths` and
`removedPaths`. Those are transaction actions, but the result looks
contradictory. The command should report the final state first and expose a
transaction trace only when requested.

### The current build direction differs from the desired one

Today, `capsule build` resolves a component selection from the framework
registry and packs registry source files. It does not treat ignored project ACF
directories as editable input. Materialization goes in the opposite direction:
it expands the capsule into ignored directories and blocks edits there.

If ignored ACF directories are meant to be the author's input and the capsule
is the only persisted framework payload, the owner direction must change. That
is a replacement of the current installation model, not a smaller migration.

## Proposed simpler model

Keep the binary format and its strict reader. Remove the side-by-side installer
eras and make one capsule the tracked ACF payload.

The target repository shape should be:

```text
AGENTS.md                         project-owned startup instruction
.codex/acf/capsule.acf           tracked ACF payload
.gitignore                       ignores generated projections and task state
.gitattributes                   marks the capsule as binary

.codex/acf/runtime/<tree>/       ignored generated runtime
.codex/acf/receipt.json          ignored generated ownership receipt
.codex/acf/state/                ignored bounded recovery state
.agents/skills/acf--*/           ignored generated skills required by Codex discovery
```

`AGENTS.md` remains outside the capsule because Codex reads it before repository
tools run. The same startup problem applies to `.codex/config.toml` and
`.codex/hooks.json`. A literal one-file installation needs a trusted host-level
`acf` launcher that reads `.codex/acf/capsule.acf` before Codex loads repository
configuration. Without that host integration, the repository still needs small
tracked activation files. Hiding this constraint would recreate the bootstrap
problem under a new path.

Moving ACF-owned files from `.agent-context` to `.codex/acf` is sensible. It
removes an extra root namespace and puts Codex integration beside Codex
configuration. `.agents/skills` is the exception because Codex discovers
repository skills there.

The command model can shrink to three operations:

- `acf pack` verifies ignored authoring input and atomically replaces the
  tracked capsule. It emits a short semantic summary.
- `acf sync` verifies the tracked capsule and reconciles ignored projections.
  It blocks local edits unless the capsule and receipt prove ownership.
- `acf diff` compares two capsules for review and restart requirements.

There should be one lock schema, preferably embedded in the capsule manifest.
The ignored receipt records only generated-file ownership and recovery state.
Fresh installations and updates use the same reconciliation transaction. Once
the old format has one explicit conversion release, routine operation should
not retain v2 and v3 branches.

The packed source direction needs one firm rule. If ignored directories are
authoring input, `pack` owns them and `sync` must never overwrite them in the
same checkout. If they are generated output, edits are conflicts and the
registry remains the source. Mixing both roles caused much of the current
machinery.

## Branch and pull request policy

Remote branches and pull requests can replace local worktree creation for this
project if writers are serial. A remote branch does not isolate two writers in
one checkout.

The proposed workflow is:

1. A maintainer or automation keeps `development` current with the repository's
   default branch.
2. An agent fetches and starts `codex/<task>` from `origin/development`.
3. Read-only scouts may run concurrently. Only one agent writes in a checkout.
4. The agent checkpoints its branch, pushes it when the task authorizes remote
   delivery, and opens a pull request into `development`.
5. The agent never merges the pull request. A human owns review and merge.

The current protected framework policy requires explicit user approval before
every push. Making push and pull request creation the default delivery path
requires a maintainer-reviewed policy change. This audit does not make that
change.

## Replace mandatory work records

Mandatory `.codex/work/<task>.md` files create a second narrative beside Git,
the conversation, and the pull request. They are especially wasteful for short
serial work.

Remove the blanket requirement. Use an ignored generated state record only when
a task must survive interruption, coordinates more than one writer, or performs
a recoverable destructive transaction. Store identifiers, ownership, revision,
pending transition, and recovery data. Do not store a prose diary.

Git commits own implementation checkpoints. Pull request text owns delivery
context. ADRs own lasting architecture decisions. The ACF runtime should remove
its exact generated task-state record after completion. It must not delete
human-authored notes or use a broad cleanup rule.

## Recommended implementation order

1. Add regression tests for public verification and installer planning after
   migration. Repair those paths if the current release must remain usable.
2. Decide whether ignored ACF directories are authoring input or generated
   output. Give them one role.
3. Specify the one-capsule layout under `.codex/acf` and the required host
   bootstrap contract.
4. Replace the dual installer with one pack and sync transaction.
5. Change branch, pull request, merge, and work-record policy in the canonical
   framework sources. Treat generated instructions as projections.
6. Convert one fixture, clone it fresh, start Codex through the intended host
   path, update its capsule, and prove that no tracked ACF expansion returns.

## Verification

Manual fixture operations covered every public capsule command and the main
success, no-op, drift, missing-file, existing-target, semantic-change, and
corrupt-input outcomes. The focused capsule suite also passed 19 of 19 tests in
163 seconds, including symlink rejection, transaction-safe writes, bootstrap
replacement, invalid payloads, restart classification, and dirty-fixture
preservation.

No repository implementation changed in this audit. Broad acceptance was not
run. The two post-migration failures were reproduced manually and remain open.
