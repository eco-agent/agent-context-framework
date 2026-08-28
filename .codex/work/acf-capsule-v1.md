# ACF capsule v1

## Intended outcome

Implement the compressed ACF capsule plan against the generated downstream test
application. The first durable checkpoint defines capsule v1, builds and reads a
deterministic selected-component capsule, exposes semantic inspection, and proves
that its entries match the current expanded installation. Expanded installation
remains authoritative until that proof passes.

## Baseline and ownership

- Baseline revision: `4b98e31a38e911e1d825456350a5f463abe16aea`
- Task branch: `codex/acf-capsule-v1`
- Generated application: `D:/dev/acf-fixture-command-check`
- Generated application baseline: `7d5ff44a46eeb1541b507601c77509f4b0bfccd8`
- Generated application revision: `492415f9dcecf7648150d14a0e09f2e436077076`
- Generated capsule SHA-256:
  `eb788c0187ac42e866754c54c72010c757aca77d7a493acac87018c4b7b0fcfd`
- Generated capsule framework revision:
  `055407057c0bf1aa89a072e24023e93e1fdb87f6`
- Runtime generated application: `D:/dev/acf-fixture-runtime-capsule`
- Runtime application baseline: `b9cee5f525206f39339452cf8c54945f277cc471`
- Runtime application revision: `89da6216a12769067a68bab53f266f193c2d96d7`
- Runtime capsule SHA-256:
  `f580e6d935f3840982a83ed7a818789167828973bff76013530bdcacc1fe5943`
- Runtime capsule tree SHA-256:
  `1a6c3ec88c034c5e91f383c52a63204d17606c3b3b0b820062caf4ef8789953c`
- Active writer: primary Sol agent in the current worktree
- Canonical registry owner: `registry/registry.json` and its source builder
- Capsule implementation owner: `tools/dev-tooling`

No project contracts are declared in `.agent-context/policy.json`.

## Preservation map

| Classification | Behaviour | Owner |
| --- | --- | --- |
| Retained | Project component selection and dependency closure remain explicit. | Context config and registry resolver |
| Retained | The current expanded installer, lock v2, local-edit detection, structured projection, and recovery remain unchanged during side-by-side proof. | Context installer and transaction |
| Retained | Project policy and shared activation files remain expanded and project-reviewable. | Project files and artifact projections |
| Retained | Source hashes, component revisions, licences, notices, and attribution stay verifiable. | Registry and capsule manifest |
| Added | One deterministic Brotli capsule represents the selected closure. | Capsule builder |
| Added | Capsule inspection, extraction, and semantic comparison operate without installation writes. | Capsule reader and CLI |
| Added | The generated application proves capsule entries against the real expanded core installation. | Fixture proof test |
| Added | Selected whole-file skills and runtime files materialize to ignored content-addressed directories. | Capsule materializer and receipt |
| Added | One tracked plain-Node bootstrap verifies the capsule, recovers context transactions, materializes ignored files, and starts packaged runtimes. | Core registry component and bootstrap entry |
| Changed | The context transaction claims staging exclusively so concurrent writers cannot share or remove each other's staged bytes. | Context transaction |
| Removed | Verified whole-file `.codex/skills` and `.agent-context/runtime` projections leave Git after migration. | Capsule migration planner |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Capsule builder | Include only the exact resolved component closure and exact registry source bytes. | Repeated build digest and entry manifest tests | Stop on missing source, hash drift, duplicate identity, or nondeterminism. |
| Capsule reader | Accept only capsule v1 with valid compressed digest, canonical payload, entry hashes, and contained relative paths. | Corruption and path-rejection tests | Reject the capsule without writing files. |
| Semantic commands | `list`, `inspect`, `diff`, and `extract` are read-only except extraction to an explicit empty directory outside the framework worktree. | CLI tests and output snapshots | Report unsupported or unsafe output without partial extraction. |
| Existing installer | Continue writing the v2 lock and expanded artifacts exactly as before. | Existing installer suite | Keep the capsule side by side until equivalence passes. |
| Downstream proof | Compare capsule entries with the selected registry sources and installed projections without modifying the committed fixture. | Fixture revision and Git status before and after | Stop and retain the mismatch report. |
| Lock migration | Replace a verified v2 lock and exact tracked skill and runtime projection. | Migration plan, transaction recovery, and current rerun | Block before writes on drift. Resume an interrupted transaction before retrying. |

## Current state

Capsule v1 now builds deterministic canonical JSON and compresses it with fixed
Brotli parameters. The reader verifies the header, canonical payload, selected
closure, full component metadata, source bytes, and tree digest before exposing
entries. The command line can build, list, inspect, verify, compare, and extract
capsules. Build uses exclusive hard-link publication, and extraction claims a
new directory before writing. Neither path replaces existing output.

The existing lock v2 installer remains unchanged. The generated clean core app
passes read-only verification. A second clean app installed from capsule source
bytes matches all five artifact targets, project config, and lock byte for byte.
The dirty core variant also verifies without changing its commit or unrelated
working files.

The test application retains the expanded-installation oracle in its
`materialized` state. Its `migrated` state starts from that proof, writes lock
v3, and removes the two tracked `skill-diagnose` files. Clean and dirty migrated
fixtures rematerialize the ignored projection without adding ACF paths to Git
status.

Registry `0.14.0` now owns the capsule decision and adds `*.acf binary` to the
fresh-project `.gitattributes` seed. Existing attributes remain project-owned.
The host and packaged runtime policy sources both decode the additive lock-v3
shape while all registry, config, and installation-lock v2 decoders remain at
schema version 2. Generated `migrated` and `runtime-migrated` applications now
write lock v3.

The generated application now has a committed `materialized` state. Its v2 lock
and expanded targets remain authoritative, while the on-disk capsule verifies
from committed bytes and Git reports the path as binary. The ignored receipt
records two exact `skill-diagnose` files below a content-addressed direct child
of `.agents/skills`. A command rerun reports `current` and writes nothing.

Core now owns a reproducible plain-Node bootstrap bundle at
`.agent-context/bootstrap.mjs`. A fresh generated clone runs it with plain Node
and no project dependencies or expanded runtime. The bootstrap requires lock
v3, checks its capsule binding, config selection, and every tracked activation
scope, then materializes an absent projection. It writes nothing on repeat,
discards pre-journal staging, and fails closed on modified output. Git ignore
inspection runs before every materialization attempt. Fresh clones must run
`node .agent-context/bootstrap.mjs materialize` before Codex starts. Git cannot
make that portable and automatic. Launcher integration remains a convenience.

The runtime slice now maps the complete selected runtime closure below
`.agent-context/runtime/materialized/<capsule-tree-digest>`. The receipt schema
is version 2 and records skill and runtime files as separate entry shapes.
Repository-context and Codex hook configuration call the tracked bootstrap with
`exec repo-context` or `exec hook`. Bootstrap verifies lock v3 and tracked
activation, repairs or verifies the ignored projection, then starts the exact
packaged entrypoint. It emits no status text on a protocol child process's
standard output. Lock-v2 projects use the same launcher but start the existing
tracked runtime path until migration removes it.

The generated `runtime-migrated` application selects `codex-runtime` and
`skill-diagnose`. Clean and dirty variants remove every tracked skill and runtime
file after lock-v3 publication. Their configured repo-context server and hook
command recreate deleted ignored files through plain Node and leave Git status
unchanged. The committed repo-context bundle includes its MCP SDK and Zod code;
the capsule carries their exact licence texts and source attribution.

Lock v3 now separates tracked expanded activation from ignored materialization
ownership. The capsule derives the expected skill and activation sets. The
bootstrap verifies activation bytes from capsule source and the current project,
not by comparing caller-supplied lock records with themselves.

## Topology

1. Registry resolver selects components.
2. Capsule builder loads and verifies exact source bytes.
3. Canonical payload serialization produces one deterministic byte sequence.
4. Brotli produces `capsule.acf`.
5. Capsule reader verifies and decodes before exposing entries.
6. Semantic commands operate on verified payloads.
7. Generated application proof compares the capsule with expanded installation.
8. The plain-Node bootstrap recovers a safe context transaction.
9. Materialization verifies Git ignore rules, then writes absent
   content-addressed skill and runtime output with its receipt, or verifies an
   exact repeat. Different capsule content blocks.
10. Migration proves v2 and ignored outputs, writes lock v3, and deletes the old
    tracked whole-file skill and runtime targets last.

## Completed skill migration slice

The `materialized` fixture selects `skill-diagnose`, builds its capsule, writes
the ignored copy and receipt, and keeps `.codex/skills` as the v2 oracle. The
`migrated` fixture then replaces lock v2 and removes those tracked skill files.

Each generated skill directory carries an explicit ACF prefix, skill name, and
the component's full content digest. The receipt re-states those fields and must
preserve the skill-relative source mapping. Materialization supports an absent
destination and an exact repeat. Modified generated files, malformed receipts,
and unexplained target paths block replacement. A different capsule also blocks
unless the current tracked lock v3 authorizes it.

The ignored receipt does not authorize deletion. The migration proves ownership
from lock v2 and current projections before constructing lock v3. It publishes
lock v3 before deleting old skills, and the stable bootstrap recovers an
interrupted transaction before Codex discovers repository skills.

The existing context transaction becomes the project-local concurrency owner by
claiming its stage directory exclusively. A losing process must not remove the
winning process's staging directory.

Reuse assessment:

- `context-transaction.ts` already owns staged writes, exact before and after
  hashes, crash inspection, and resume. Extending its exclusive claim is smaller
  than adding a second transaction system.
- The product precedent receipt supplies a useful receipt pattern, but its
  direct multi-file writes do not meet this recovery boundary.
- `write-file-atomic` handles one replacement file, not an immutable multi-file
  projection plus receipt. `proper-lockfile` adds dependencies and stale-lock
  policy to a bootstrap that must eventually run from packaged Node code.
- Official OpenAI documentation confirms that repository skills belong under
  `.agents/skills` and that Codex scans that path from the working directory to
  the repository root.
- The pinned `vite-plus` packer bundles the existing verifier and materializer
  into one ESM file with no external package dependency.

### Materialization boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Capsule skill mapper | Only whole-file artifacts already owned below `.codex/skills` may map to `.agents/skills`. | Receipt decoder and mapping tests | Reject unsupported operations or escaping paths without writing. |
| Materialization receipt | Record the capsule and every generated target with its source and installed digest. | Exact receipt and file verification | Report missing, malformed, or modified output and retain it for inspection. |
| Skill materializer | Create an absent ACF-owned content-addressed root or reuse an exact receipt. Never delete from the ignored receipt alone. | Clean, repeat, different-capsule, unexplained-target, and dirty-output tests | Recover before starting Codex, or continue using the expanded tracked installation. |
| Context transaction | One process owns staging and publication. | Concurrent stage-claim test and recovery suite | The losing process stops; doctor resumes or discards the winning transaction. |
| Generated fixture | Ignore materialized files while keeping capsule, config, lock v2, and expanded projections tracked. | Git status and `check-ignore` assertions | Fail fixture generation when an expected generated path is not ignored. |

## Smallest complete capsule slice

1. Settle and document the capsule v1 schema.
2. Implement deterministic build and verified read.
3. Add semantic list, inspect, diff, and safe extract operations.
4. Add focused format and corruption tests.
5. Add generated-application equivalence without changing its committed state.

## Replacements

Migrated projects replace lock v2 with lock v3 and remove verified tracked
`.codex/skills` and `.agent-context/runtime` files. The existing v2 installer
remains in place for projects that have not migrated.

## Remaining work

- No optional host launcher automates the explicit pre-Codex bootstrap command.
- The current migration requires capsule and materialization prerequisites.
  It does not yet convert an ordinary v2 project in one command.
- No fleet manager yet.

## Completed repo-context runtime slice

The previous Codex configuration launched a generated `dist` file that a fresh
clone did not contain. The capsule now carries packaged repository-context and
hook entrypoints. Bootstrap materializes the selected runtime tree under the
ignored `.agent-context/runtime/materialized` directory and owns the stable
`exec repo-context` and `exec hook` entrypoints.

Runtime ownership stays distinct even if lock v3 stores skill and runtime file
records in the same materialization list. The runtime receipt owns only
`.agent-context/runtime/**`. The skill receipt owns only `.agents/skills/**`.
Neither ignored receipt can grant replacement permission without matching
tracked lock-v3 records.

The runtime fixture selects `codex-runtime` and `skill-diagnose` while still on
lock v2. It proves the complete runtime projection, migrates all verified
runtime-workspace and skill files out of Git, and starts repo-context with plain
Node after deleting every ignored runtime and skill output.

The standalone repo-context bundle includes `@modelcontextprotocol/server`,
`@modelcontextprotocol/core`, and Zod. All three package manifests declare MIT.
The registry records their exact versions, source revisions, copied distributed
licence texts, and attribution. The selected capsule carries those files with
the bundle.

## Propagation paths

- Registry types and resolver to capsule manifest.
- Registry source bytes to deterministic entries.
- Dev-tooling exports and CLI to package and root commands.
- Format tests to generated application equivalence.
- Capsule decision to lock, bootstrap, materialization, and fleet stages.

## Active semantic update slice

The current tracked lock is the authority for the desired capsule after a branch
switch or committed update. A valid prior receipt identifies the old generated
paths, but it cannot authorize deletion alone. Replacement requires both the
current lock-v3 binding to the desired capsule and exact verification of every
file in the prior receipt. A modified or missing prior file blocks before any
write.

The replacement transaction writes the new content-addressed files first,
publishes the new receipt, then deletes old receipt-owned files that are not part
of the desired projection. Before receipt publication, the old projection and
receipt remain valid. After publication, the new projection is authoritative.
Transaction recovery completes either interrupted phase before another
materialization attempt.

Restart classification belongs to semantic capsule comparison, not raw Git
diffs. Changes to startup activation, repository skills, or packaged runtime
require a Codex restart when applied to an active session. Licence, attribution,
tests, and other inspectable source changes remain visible in semantic diff but
do not claim a restart by themselves.

An experimental capsule update planner synthesizes prior activation ownership
from lock v3 and the verified previous capsule, then passes it through the
existing v2 structured projection planner. Its focused transaction and recovery
test passes, but the planner is not safe to release. The v2 planner validates
ownership inside one desired artifact set. It does not validate overlaps between
removed ownership from the old capsule and added ownership from the new capsule.
On a shared target, an old removal could therefore delete content installed for
the new identity.

The next implementation must extract a shared owned-artifact transition planner
from the projection, virtual-target, ownership-validation, and mutation code.
That planner must receive verified old and new capsule artifacts together. It
must validate ownership across both versions before it creates any mutation.
The current update command and its documentation remain an experimental draft
until that replacement exists.

## Closure

The user stopped this work stream on 2026-08-28 after nearly five hours. The last
safe completed revision is
`3a55b70e4a53478ba5c20a1d3bb291bcfe8aed7c`. The following checkpoint preserves
the experimental updater draft and this evidence. It does not mark the capsule
program complete.

The completed work reaches lock-v3 migration, ignored skill and runtime
materialization, packaged launchers, lock-v2 compatibility, branch-switch
reconciliation, and semantic restart classification. The atomic update command
is unfinished for the cross-version ownership reason above. The fleet manager,
optional host launcher, and one-command migration of an ordinary v2 project were
not started or completed.

The experimental draft passed the dev-tooling TypeScript build and its focused
update transaction test. No documentation or workflow profile ran after the
draft. The broader profiles listed below apply only through their named tested
revisions.

### Checkpoint evidence

- Capsule v1 checkpoint revision: `74d1db1ee0733f6659a98d16750d1fdacb698890`.
- Initial receipt-backed materialization revision:
  `d83f0e82986015d28feb35980bb4f821f27ac138`.
- Content-addressed materialization revision:
  `8edc44f71c25a76763de23e0f9233e9dd2f40f64`.
- Receipt ownership safety revision:
  `332ad3b6069a71817aa3af27f900626b1ccae0dd`.
- Standalone bootstrap and lock-v3 ownership revision:
  `9315c38f9b2674f7eb638e09822bdb276816149f`.
- Explicit materialization command revision:
  `055407057c0bf1aa89a072e24023e93e1fdb87f6`.
- Deterministic core capsule: 10,620 compressed bytes and 24,700 payload bytes
  in the live command proof before the full-component tree-hash correction.
- Focused capsule tests: 7 passed.
- Combined policy, capsule, bootstrap, materialization, transaction, and fixture
  tests: 33 passed.
- Reproducible bundle and plain-Node fresh-clone bootstrap tests: 2 passed.
- Committed bootstrap bundle: 40,406 bytes. The generated fixture marks both the
  bootstrap and capsule as binary Git paths.
- Lock-v3 activation verification increased the bootstrap bundle to 93,889
  bytes because it now carries the structured projection reader. The bundle
  remains a single reproducible plain-Node file.
- Migration, capsule, materialization, bootstrap, transaction, and fixture
  tests: 28 passed after the lock-v3 migration slice.
- Clean and dirty `migrated` fixture states passed fresh materialization with no
  ACF Git-status entries.
- An injected failure after lock-v3 publication resumed the old skill deletions;
  the next migration run wrote nothing.
- Direct agent-prose checks passed for the ADR, registry decision, and work
  record. Direct technical-prose checks passed for the ADR and registry decision.
- Documentation and workflow profiles passed after the migration slice.
- Different-capsule proof retains the exact prior materialized skill and reports
  that lock v3 must establish tracked ownership before replacement.
- Existing installer, installer CLI, and transaction tests: 25 passed.
- Dev-tooling TypeScript build: passed.
- Root TypeScript build: passed.
- Forged receipt mapping and stale unowned `SKILL.md` checks: passed.
- Agent prose check: passed for the ADR, decision, and work record.
- Technical prose check: passed for the ADR and decision.
- Documentation profile: passed.
- Workflow profile: passed, including workflow tests, dependency adoption,
  boundaries, and verification cleanliness.
- Latest documentation and workflow profiles passed at standalone bootstrap
  revision `9315c38f9b2674f7eb638e09822bdb276816149f`.
- Packaged runtime checkpoint revision:
  `e1c587dc06babb07a0812ca9067e9091cede0170`.
- Deterministic bundle-normalization revision and tested revision:
  `4b194863a485e47ab234aaf007583a96f2f40092`.
- The tracked bootstrap, hook, and repo-context bundles are 97,596 bytes, 5,903
  bytes, and 381,939 bytes. All three rebuilt byte for byte after normalization.
- The configured lock-v2 hook and repo-context launch paths passed through the
  tracked bootstrap. Lock v2 kept using its tracked runtime. Lock v3 recreated
  deleted ignored runtime files before starting the same protocols.
- The runtime-specific repository-context suite passed 4 tests. The hook suite
  passed 4 tests. Modified generated repo-context bytes blocked bootstrap.
- The migration, bootstrap, materialization, and lock decoder suites passed 13
  tests. Migration preserved custom `.gitattributes` content, added
  `*.acf binary`, published lock v3 first, and recovered the remaining writes and
  deletions after an injected interruption.
- The clean and dirty `runtime-migrated` fixture test passed with 35 ignored
  materialized files and no tracked skill or runtime paths. The durable clean
  fixture remained Git-clean, reported the capsule as binary, and returned
  `current` with no writes from plain-Node bootstrap.
- Direct agent-prose checks passed for the ADR, registry decision, and work
  record. Direct technical-prose checks passed for the ADR and registry decision.
- The documentation profile passed after the runtime evidence update. The
  workflow profile passed at `4b194863a485e47ab234aaf007583a96f2f40092`, including
  workflow tests, dependency adoption, boundary checks, and verification
  cleanliness.
