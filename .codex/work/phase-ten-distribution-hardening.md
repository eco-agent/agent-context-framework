# Work record: Phase 10 distribution hardening

## Outcome

Make registry `0.5.1` release-auditable. Project-authored distributable components
must carry explicit MIT terms; every third-party and package adoption must identify
an immutable source revision and required notice; declared external capabilities
must cover the executables used by the installed component. Preserve the Phase 7
component topology and host-manifest neutrality.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/phase-ten-distribution-hardening` in `D:\dev\agent-context-framework-phase10`, based on clean Phase 7 evidence head `d37697611e9b0e4cf3496bc33c0e00eaefa2b14d`. | Git |
| Project license | License project-authored distributable components under MIT, using the repository-root `LICENSE` text and `Agent Context Framework contributors` as the copyright holder. | Project licensing |
| Registry revision | Advance the governed registry from `0.5.0` to `0.5.1`; retain the exact Phase 7 dependency graph. | Registry governance |
| License contract | A `project` license is no longer an unspecified marker. It declares `spdx` and `noticePath`, and validation requires the installed component closure to contain the exact notice. | Registry schema and builder |
| Source revisions | Dependency adoption records use immutable Git commit URLs when upstream exposes a source revision. The MCP, Zod, and TypeScript records are corrected to their verified package revisions; the declaration-only Node types package records the strongest reproducible upstream identity available. | Dependency adoption policy |
| Third-party notices | Required notices retain the exact verified upstream bytes. The Woosal notice is restored to its pinned upstream form. | Registry sources |
| Capabilities | Components declare every external executable they invoke. Git and shell requirements are explicit for Codex hooks and session optimization; dependency bundles inherit them through the existing closure. | Registry capabilities |
| Verification | Run focused owner checks during implementation. After framework and fixture commits are clean, run the single acceptance command once and record the tested revisions in a documentation-only commit. | Acceptance sequencer |

## State

- Phase 7 is complete at `d37697611e9b0e4cf3496bc33c0e00eaefa2b14d`.
- The Phase 9 audit verified all 156 registry artifact hashes and all seven
  third-party component revisions, but found unspecified project licensing, one
  incorrect MCP source commit, mutable or absent package source revisions, a
  non-byte-exact Woosal notice, and undeclared Git/shell capabilities.
- The controlled fixture remains at
  `dd76c19bad1d81bf0301dbbb41753239fecb1032` with its host package and lockfile
  hashes preserved.

## Topology

```text
registry source + project LICENSE
        |
        v
registry decoder -> builder governance -> generated registry
        |                                  |
        v                                  v
dependency adoption checks              installer / doctor
        |                                  |
        +----------------> acceptance <----+
```

The four Wave 4 components and their dependency relationships do not change.

## Slice

1. Close the project-license contract through schema, source catalog, generated
   registry, notice installation, installer/doctor visibility, and focused tests.
2. Correct immutable dependency provenance and exact third-party notice bytes.
3. Close executable capability declarations and add validation against the known
   distributable launch surfaces.
4. Materialize the unchanged-topology registry into the controlled fixture and
   prove host neutrality through the one final acceptance sequence.

## Replacements

- Replace `{ "kind": "project" }` with explicit MIT SPDX and notice ownership.
- Replace mutable, missing, or incorrect dependency source references with verified
  immutable identities.
- Replace the edited Woosal license copy with the pinned upstream bytes.
- Replace implicit Git and shell assumptions with registry capabilities.

## Non-goals

- No new distributable component, dependency edge, orchestration topology, agent
  loop, objective runtime, host package dependency, deployment, publication, or
  push.
- No legal interpretation beyond recording and mechanically validating the chosen
  license and upstream evidence.
- No compatibility representation for unspecified project licenses.

## Propagation

- Root license text, registry types and decoder, source catalog, generated
  registry, notice coverage, installer ownership/collision behavior, installation
  locks, doctor reporting, focused fixtures, and governance decision.
- Dependency adoption records and checks for immutable revisions and notices.
- Codex hook and session-quality capabilities, resolution tests, fixture install,
  and acceptance evidence.

## Verification evidence

- Pending implementation.
