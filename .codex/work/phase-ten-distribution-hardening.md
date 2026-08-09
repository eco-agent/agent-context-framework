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
| License contract | A `project` license is no longer an unspecified marker. It declares `spdx`, `sourcePath`, and `noticePath`, records the exact notice hash, and the non-removable `core` owner installs those bytes as `.agent-context/LICENSE.agent-context-framework`. | Registry schema and builder |
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
- The controlled fixture is updated and committed at
  `001e4d1e9a357b221fbef6806b3ffd1e1e414bbc` with its host package and lockfile
  hashes preserved.
- The first `0.5.1` fixture materialization exposed that registry-only project
  license metadata did not retain the MIT text downstream. The license is now a
  core-owned installed artifact; no dependency edge changed.

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

- Registry `0.5.1` contains the same 28 components and dependency graph as
  `0.5.0`, with 157 artifact declarations and 156 unique source files. The one
  added artifact is the project MIT notice owned by `core`.
- All 21 project-authored component license declarations resolve to MIT source
  `LICENSE`, installed target `.agent-context/LICENSE.agent-context-framework`,
  and SHA-256
  `b80894bb43e7005a48bd77951dbd56ee1524a84badd708d57a058030e59013f3`.
  All eight third-party license entries carry exact notice hashes.
- The retained Woosal notice now matches the pinned upstream bytes at SHA-256
  `42ddcac0d383e9938dc80c93a1ce24a50b70cb37d22595cacdebda0afc9eda72`.
- Focused TypeScript 7 builds and tests passed for the registry decoder,
  dependency-adoption checker, registry builder, installer, agent, hook,
  repository-policy, and dependency-only runtime owners. `registry:check` passed
  for revision `0.5.1` with 28 components.
- The first focused command could not start because the new worktree had no
  `node_modules`; the frozen workspace lock was installed before rerunning. Two
  focused registry-builder attempts then exposed test-only error-message regexes
  that omitted the newly required `noticePath` and `sourcePath` diagnostics. The
  assertions were corrected and their focused file passed. No product behavior
  failed in either case.
- The first fixture diff/doctor command was accidentally launched from the
  downstream repository, which intentionally has no host `agent-context`
  package script. It changed no source. The same checks passed through the
  framework-owned CLI: runtime, repository policy, and Codex interface were
  ready; doctor was healthy; project MIT, Git, and shell appeared in its report.
- Tested framework revision:
  `78419436b879c70007de0c7f3aeb8c27ab465e1c`.
- Tested downstream fixture revision:
  `001e4d1e9a357b221fbef6806b3ffd1e1e414bbc`.
- The single final invocation
  `pnpm --silent verify:acceptance -- --fixture D:\dev\control-tower-clean`
  passed in `188,800 ms`: workspace `110,124 ms`, isolation `40,725 ms`, and
  downstream `25,330 ms`. Workspace typecheck, tests, checks, and registry check;
  real-materializer isolation; and downstream Codex-runtime and policy checks all
  passed.
- The downstream root `package.json` retained SHA-256
  `869b96384be085f0065f43f0d17b8e36cfdd1bc0d2a78bd11991074b5fbdfaa7`.
  Its root `pnpm-lock.yaml` retained SHA-256
  `71ea96a0b215da8002ddc8def9b0dfc1c35ee01d55f5e963f4afb0967de3d5a5`.
- Both repositories were clean after acceptance. This later change is
  documentation-only; no broad executable gate was rerun.
