# Wave 1 materializer hardening

## Outcome

Harden the existing Wave 1 materializer so obsolete structured ownership can be
removed without its deleted registry source, TOML materializes only declared
tables, interrupted transactions are deterministically classified and resumed,
and promotion revalidates symbolic-link ancestors. Exercise every filesystem
mutation boundary with deterministic failure injection. Preserve registry
revision 0.2.0 and the existing clean Control Tower installation.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Obsolete structured source | Derive read and removal behavior from locked ownership metadata. Do not require or reconstruct deleted source bytes. | Artifact projection |
| TOML installation bytes | Parse the source with the existing `smol-toml` dependency, project only `ownedTables`, and serialize that projection for the marked section. | Artifact projection |
| Recovery classification | Compare every target and staged write with the journal's before/after hashes. A transaction is resumable only when every mutation is already applied or remains at its exact before state with valid staged bytes. | Context transaction |
| Recovery action | Resume only a fully classified transaction; reapply pending mutations, accept already-applied mutations, then remove staging and the journal in cleanup-last order. | Context transaction |
| Promotion path safety | Revalidate repository-relative ancestors immediately before each target mutation and again after creating write ancestors. Reject symbolic links instead of following them. | Context transaction |
| Failure injection | Expose a test-only callback at each mutating filesystem boundary and test all reported boundaries. Production callers omit it. | Context transaction tests |
| CLI scope | Keep recovery in the existing `doctor` lifecycle and materializer API unless tests show a separate Wave 1 command is necessary. Add no Wave 2 component or registry content. | Installer |
| External code | Reuse the repository's projection and transaction owners, Node filesystem primitives, and installed TOML parser/serializer. Add no dependency or vendored implementation. | Task |

## State

- Framework baseline and branch head: `0e5ca3b858345e14d31e78338165f99ca7597803` on `codex/agent-context-framework`.
- Clean Control Tower installation: registry revision 0.2.0 at commit `071a7592ac2b97f731bde467e4a04dcecbf00b1d`.
- The current journal records before/after hashes but only blocks future writes; it does not classify or resume interrupted work.
- The current TOML projection hashes declared tables but appends the complete source text.
- The current obsolete structured projection reloads the old source even though removal needs only locked ownership metadata.
- Planning rejects existing symbolic-link ancestors, but transaction promotion performs only lexical path checks.

## Topology

```text
registry + lock metadata
        |
        v
artifact projection -----> installation plan
        |                         |
        |                         v
        +----------------> staged transaction journal
                                  |
                     classify / promote / resume
                                  |
                                  v
                         project-owned files
```

## Slice

1. Add focused projection tests for undeclared TOML tables and source-free obsolete structured removal.
2. Add transaction classification, safe resumption, promotion-time ancestor checks, and injectable mutation boundaries.
3. Propagate recovery through installer doctor behavior and focused lifecycle tests.
4. Run developer-tooling tests and TypeScript 7 checks.
5. Run full framework verification, then confirm the clean Control Tower installation remains current and healthy.

## Replacements

- Replace source-dependent obsolete projection with ownership-only projection.
- Replace complete TOML source insertion with declared-table serialization.
- Replace advisory-only interrupted journal handling with deterministic classification and resumption.
- Replace lexical-only promotion paths with promotion-time ancestor validation.
- Replace spot interruption coverage with failure injection after every filesystem mutation boundary.

## Non-goals

- No Wave 2 components, runtime workspace packaging, hooks, repository-context runtime, or objective orchestration packaging.
- No frontend policy or packaged frontend source changes.
- No registry revision or clean-installation content change unless verification demonstrates a packaging defect.
- No migration, compatibility representation, push, deploy, or publication.

## Propagation

- Projection behavior propagates through install, update, remove, diff, lock hashes, and obsolete assessments.
- Transaction state propagates through mutating commands, doctor diagnostics, recovery, and CLI formatting.
- Path validation propagates to every promoted write and delete, including resumed mutations.
- Failure-boundary evidence propagates from the transaction primitive through installer lifecycle fixtures.
- Verification propagates from focused developer tooling to framework-wide checks and the pinned clean installation.
