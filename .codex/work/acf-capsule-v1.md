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
| Added | Selected whole-file skills materialize to ignored content-addressed directories under `.agents/skills`. | Capsule materializer and receipt |
| Added | One tracked plain-Node bootstrap verifies the capsule, recovers context transactions, and materializes skills. | Core registry component and bootstrap entry |
| Changed | The context transaction claims staging exclusively so concurrent writers cannot share or remove each other's staged bytes. | Context transaction |
| Removed | Verified whole-file `.codex/skills` projections leave Git after migration. | Capsule migration planner |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Capsule builder | Include only the exact resolved component closure and exact registry source bytes. | Repeated build digest and entry manifest tests | Stop on missing source, hash drift, duplicate identity, or nondeterminism. |
| Capsule reader | Accept only capsule v1 with valid compressed digest, canonical payload, entry hashes, and contained relative paths. | Corruption and path-rejection tests | Reject the capsule without writing files. |
| Semantic commands | `list`, `inspect`, `diff`, and `extract` are read-only except extraction to an explicit empty directory outside the framework worktree. | CLI tests and output snapshots | Report unsupported or unsafe output without partial extraction. |
| Existing installer | Continue writing the v2 lock and expanded artifacts exactly as before. | Existing installer suite | Keep the capsule side by side until equivalence passes. |
| Downstream proof | Compare capsule entries with the selected registry sources and installed projections without modifying the committed fixture. | Fixture revision and Git status before and after | Stop and retain the mismatch report. |
| Lock migration | Replace a verified v2 lock and exact tracked skill projection. | Migration plan, transaction recovery, and current rerun | Block before writes on drift. Resume an interrupted transaction before retrying. |

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
schema version 2. No project writes lock v3 yet.

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
9. Skill materialization verifies Git ignore rules, then writes an absent
   content-addressed output and receipt, or verifies an exact repeat. Different
   capsule content blocks.
10. Migration proves v2 and ignored outputs, writes lock v3, and deletes the old
    tracked whole-file skill targets last.

## Completed skill migration slice

The `materialized` fixture selects `skill-diagnose`, builds its capsule, writes
the ignored copy and receipt, and keeps `.codex/skills` as the v2 oracle. The
`migrated` fixture then replaces lock v2 and removes those tracked skill files.

Each generated skill directory carries an explicit ACF prefix, skill name, and
the component's full content digest. The receipt re-states those fields and must
preserve the skill-relative source mapping. Materialization supports an absent
destination and an exact repeat. Modified generated files, malformed receipts,
unexplained target paths, and a different capsule block replacement.

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
`.codex/skills` files. Expanded runtime and the existing v2 installer remain in
place for projects that have not migrated.

## Remaining work

- No automatic bootstrap launcher or packaged runtime materialization yet.
- No optional host launcher automates the explicit pre-Codex bootstrap command.
- No ignored runtime materialization yet.
- The current migration requires capsule and skill materialization prerequisites.
  It does not yet convert an ordinary v2 project in one command.
- No fleet manager yet.

## Propagation paths

- Registry types and resolver to capsule manifest.
- Registry source bytes to deterministic entries.
- Dev-tooling exports and CLI to package and root commands.
- Format tests to generated application equivalence.
- Capsule decision to lock, bootstrap, materialization, and fleet stages.

## Closure

Status, final revision, verification, and the remaining plan stages will be
recorded before this temporary work record is removed or retained for the next
active slice.

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
