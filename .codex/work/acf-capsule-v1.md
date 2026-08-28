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
- Generated application baseline: `5e0a7ff7cdb0dc51350a4f03d4db0124ff61c551`
- Generated application revision: `89e8533b6b48590951d8b55df4d1954468ecbe16`
- Generated capsule SHA-256:
  `6e3eb1dcce7aaf543108c9d1ddb21e3b03a997a84dabbc0fe7c44c8e2c8ff6e6`
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
| Changed | None in the first checkpoint. Side-by-side output does not yet replace lock v2 or tracked expanded files. | Future migration owns the change |
| Removed | None in the first checkpoint. | User approval remains required for migration |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Capsule builder | Include only the exact resolved component closure and exact registry source bytes. | Repeated build digest and entry manifest tests | Stop on missing source, hash drift, duplicate identity, or nondeterminism. |
| Capsule reader | Accept only capsule v1 with valid compressed digest, canonical payload, entry hashes, and contained relative paths. | Corruption and path-rejection tests | Reject the capsule without writing files. |
| Semantic commands | `list`, `inspect`, `diff`, and `extract` are read-only except extraction to an explicit empty directory outside the framework worktree. | CLI tests and output snapshots | Report unsupported or unsafe output without partial extraction. |
| Existing installer | Continue writing the v2 lock and expanded artifacts exactly as before. | Existing installer suite | Keep the capsule side by side until equivalence passes. |
| Downstream proof | Compare capsule entries with the selected registry sources and installed projections without modifying the committed fixture. | Fixture revision and Git status before and after | Stop and retain the mismatch report. |
| Lock migration | Do not write lock v3 in this checkpoint. | Absence of lock-schema changes | Move to lock v3 only after the side-by-side proof is durable. |

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

The test application remains the expanded-installation oracle. Materialization,
lock v3, tracked capsule attributes, and deletion of expanded files remain later
stages.

Registry `0.14.0` now owns the capsule decision and adds `*.acf binary` to the
fresh-project `.gitattributes` seed. Existing attributes remain project-owned.
The host and packaged runtime policy sources both decode the additive lock-v3
shape while all registry, config, and installation-lock v2 decoders remain at
schema version 2. No project writes lock v3 yet.

## Topology

1. Registry resolver selects components.
2. Capsule builder loads and verifies exact source bytes.
3. Canonical payload serialization produces one deterministic byte sequence.
4. Brotli produces `capsule.acf`.
5. Capsule reader verifies and decodes before exposing entries.
6. Semantic commands operate on verified payloads.
7. Generated application proof compares the capsule with expanded installation.

## Smallest complete slice

1. Settle and document the capsule v1 schema.
2. Implement deterministic build and verified read.
3. Add semantic list, inspect, diff, and safe extract operations.
4. Add focused format and corruption tests.
5. Add generated-application equivalence without changing its committed state.

## Replacements

None in this checkpoint. Lock v2, expanded skills, expanded runtime, and existing
installer writes remain the active representation.

## Non-goals for the first checkpoint

- No lock v3 projection yet.
- No ignored materialized paths yet.
- No bootstrap shim or startup runtime bundle yet.
- No `.codex/skills` to `.agents/skills` migration yet.
- No one-time downstream deletion migration yet.
- No fleet manager yet.

## Propagation paths

- Registry types and resolver to capsule manifest.
- Registry source bytes to deterministic entries.
- Dev-tooling exports and CLI to package and root commands.
- Format tests to generated application equivalence.
- Capsule decision to later lock, bootstrap, materialization, and fleet stages.

## Closure

Status, final revision, verification, and the remaining plan stages will be
recorded before this temporary work record is removed or retained for the next
active slice.

### Checkpoint evidence

- Capsule v1 checkpoint revision: `74d1db1ee0733f6659a98d16750d1fdacb698890`.
- Deterministic core capsule: 10,620 compressed bytes and 24,700 payload bytes
  in the live command proof before the full-component tree-hash correction.
- Focused capsule tests: 7 passed.
- Existing installer, installer CLI, and transaction tests: 25 passed.
- Dev-tooling TypeScript build: passed.
- Agent prose check: passed for the ADR.
- Technical prose check: passed for the ADR.
- Documentation profile: passed.
- Workflow profile: passed, including workflow tests, dependency adoption,
  boundaries, and verification cleanliness.
