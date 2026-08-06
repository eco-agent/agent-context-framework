# Wave 1 context packaging

## Outcome

Complete phases 1 through 3 of the revised framework plan and package Wave 1
frontend discipline. Stop before Wave 2 and before isolated runtime extraction.
The installer remains a development-time bootstrap; installed context is
ordinary project-owned source.

Preserve the framework's current behavior and context bytes. Canonicalization
may add source owners, projections, hashes, and verification, but it must not
rewrite the meaning of `AGENTS.md` or any packaged skill. The only permitted
skill-content delta is one strictly necessary to keep an excluded generated
cache from becoming a broken required reference; prefer existing on-demand
cache generation when it already supplies that behavior.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Stop boundary | Complete registry ownership, provenance lifecycle, canonical governance, and Wave 1 only. Do not package Wave 2, policy, Codex runtime, or objective orchestration. | Task |
| Framework context | Preserve current root and skill bytes. Registry sources are canonical; framework files are verified projections or local overlays. | Registry |
| V1 compatibility | Replace schema v1 directly. Only the controlled clean fixture consumes it; add no migration decoder or dual representation. | Installer |
| Installed ownership | Installed content belongs to the project immediately. The lock records provenance and safe-update evidence, not overwrite authority. | Project |
| Merge authority | The installer performs only closed deterministic file, text-section, JSON-member, and TOML-table operations. A model never merges content. | Installer |
| Divergence | Preserve local modifications. Apply an upstream update only when installed content still equals its previous source. Report divergence and stop before writes. | Installer |
| Transactions | Stage every write, record one recovery journal, promote mutations, write config and lock last, and leave interrupted state for `doctor` to explain. | Materializer |
| Registry construction | Author concise component declarations, expand directories into exact per-file artifacts at build time, and commit source hashes in the built registry. | Registry builder |
| Frontend bundles | `frontend` selects seven general frontend skills and the canonical frontend instruction section. `frontend-tailwind` adds the responsive CSS skill, producing the complete eight-skill Wave 1 installation. | Frontend registry |
| Tailwind cache | Exclude `.codex/skills/responsive-css-architect/references/tailwind-docs/cache/**` from Wave 1. Preserve the existing on-demand synchronization source and manifests needed to rebuild it. | Responsive CSS component |
| Capabilities | Declare external skills and runtime needs in registry metadata. Installation reports them; it never silently assumes or installs them. | Registry |
| Licensing | Package each upstream `SOURCE.json` and `LICENSE.upstream`; project-authored skills declare project ownership. | Registry |

## Inventory evidence

The deterministic `codebase-shape-summary` scan used `--include-hidden`,
`--quiet-warnings`, and `--exclude-generated`. It observed 459 source-oriented
files, 485 directories, 46,051 lines, and 2,457,848 bytes after generated and
binary-heavy material was excluded. `.codex`, `.codex/skills`, and `tools` were
the dominant areas and therefore routed semantic inspection there.

Direct tracked-file inspection found 1,087 skill files and approximately
72.3 MiB under `.codex/skills`; the responsive CSS documentation cache accounts
for nearly all of that size. Semantic inspection confirmed that its existing
scripts can synchronize the official Tailwind cache when missing. Wave 1 must
therefore package the skill, references, scripts, and manifest but not cached
metadata or screenshots.

## Canonical sources

```text
registry/sources/instructions/
├── core.md
├── frontend.md
├── repository-work.md
├── verification.md
└── documentation.md
```

- `core.md` owns the already-installed portable core block.
- `frontend.md` is an exact projection of the current root `## Frontend`
  section and is the Wave 1 instruction artifact.
- `repository-work.md` and `verification.md` are exact root projections for
  future bundles; Wave 1 does not install them.
- `documentation.md` is an exact projection of the documentation prose rules;
  Wave 1 does not install it.
- A source map records each consumer region and exact hash. The governance
  check fails when a projection differs, a reference is missing, a registry
  revision is stale, or a protected change lacks a named decision record.

## Wave 1 component graph

```text
frontend-tailwind
├── frontend
│   ├── skill-adopt-established-product
│   ├── skill-choose-react-animation
│   ├── skill-design-accessible-interfaces
│   ├── skill-design-color-systems
│   ├── skill-design-interface-details
│   ├── skill-design-web-typography
│   └── skill-frontend-design-discipline
└── skill-responsive-css-architect
```

Every skill component owns exact `.codex/skills/<name>/**` targets. `frontend`
owns only the `AGENTS.md` frontend section and general dependency selection;
`frontend-tailwind` owns no artifacts and adds the Tailwind-specific skill.

## State

- Framework worktree baseline: `dc78076020c4ee8c5dc12c220d3307c45d4845f4`.
- Clean Control Tower baseline: `097619af6334f08b989a156439ea2ca62d5c8b3c`.
- Registry, project config, and provenance lock are schema v2. The lifecycle
  now supports `inspect`, `init`, `add`, `diff`, `update`, `remove`, and
  `doctor` without a v1 decoder or migration representation.
- The framework and clean fixture were clean before this slice.
- The responsive CSS fallback previously required generated cache paths that
  Wave 1 excludes. The permitted narrow repair now rebuilds that cache from
  the retained manifest and synchronization script before reading it.

## Topology

```text
authored component declarations
          │
          ▼ deterministic expansion + source hashes
committed registry v2
          │
          ▼ plan against config + provenance lock
typed assessments and complete transaction
          │
          ▼
project-owned AGENTS section and skill source
```

## Slice

1. Record the v2 contract and exact Wave 1 inventory.
2. Replace registry, config, and lock schemas directly.
3. Implement inspect, init, add, diff, update, remove, and doctor.
4. Implement deterministic JSON/TOML composition and transaction journaling.
5. Add canonical source projections and anti-dilution verification.
6. Build the eight frontend skill components and frontend bundle.
7. Replace the clean fixture's v1 installation, install `frontend`, and verify.
8. Audit every named gate, commit both worktrees, and stop.

## Replacements

- Replace managed ownership terms with provenance and project ownership.
- Replace v1 current/missing/update/drift/stale statuses with the revised
  lifecycle states.
- Replace hand-authored source hashes with a deterministic registry build.
- Replace sequential direct writes with staged transactions and a recovery
  journal.
- Replace duplicated unguarded frontend prose with an exact canonical source
  projection and verification.

## Non-goals

- No Wave 2 engineering bundle.
- No repository-policy installation component.
- No `.agent-context/runtime` workspace.
- No Codex agents, hooks, or repository-context packaging.
- No objective orchestration packaging.
- No npm publication or global configuration.
- No changes to frontend guidance, skill procedures, application code, or
  product behavior beyond what is strictly required to keep packaged paths
  valid.

## Propagation

- Schema v2 propagates through decoders, planner types, CLI formatters,
  fixtures, registry JSON, clean fixture config, and clean fixture lock.
- Canonical hashes propagate from source files through the registry builder,
  built registry, installed lock, diff, and governance check.
- Frontend component dependencies propagate into installed skill files,
  capability reports, license evidence, and clean-fixture validation.
- Transaction semantics propagate through all mutating commands and doctor.

## Verification gates

- Exact v2 schema decoding and rejection of v1/unknown fields.
- Registry source hashes and directory expansion are deterministic.
- Protected projections match unchanged framework context bytes.
- First install, repeated install, add, update, remove, and reinstall behavior.
- Local-only, upstream-only, diverged, untracked, obsolete unchanged, and
  obsolete modified states.
- JSON member and TOML table preservation/conflicts.
- Staging, journal creation, interrupted-state doctor output, and lock-last
  behavior.
- Traversal, symlink, BOM, malformed marker, and duplicate ownership rejection.
- Wave 1 installs exactly eight skills and one frontend section.
- Every packaged skill reference resolves; upstream notices are present.
- Tailwind cache files are absent from the installed bundle.
- Framework full typecheck/tests/check pass.
- Clean Control Tower typecheck/tests/check pass after v2 core and frontend
  installation, and a repeated diff is stable.

## Completion evidence

- Framework implementation commit: `8b41bf7`.
- Clean Control Tower installation commit: `071a759`.
- The built registry is revision `0.2.0` with 11 components: core, eight
  atomic skills, and two bundle selectors.
- `frontend-tailwind` installs exactly eight skill directories and one
  governed frontend section. The installed Tailwind cache contains zero files.
- All packaged local Markdown references resolve and every third-party notice
  is installed. Registry construction now enforces both conditions.
- Repeated `init`, `add frontend-tailwind`, and `update` write no files. `diff`
  reports current and `doctor` reports healthy while listing capabilities
  without inferring their availability.
- Framework `pnpm typecheck`, `pnpm test`, `pnpm check`, and
  `pnpm registry:check` pass. The check reports four unrelated warnings and no
  errors.
- Clean Control Tower `pnpm typecheck`, `pnpm test`, and `pnpm check` pass. The
  check reports eight unrelated warnings and no errors.
- The original `D:\dev\control-tower` worktree is clean. Root `AGENTS.md` is
  unchanged from the framework baseline. The only skill-source changes are the
  two recorded responsive CSS cache-fallback files required by cache exclusion.
- Wave 2, repository policy packaging, Codex runtime packaging, objective
  orchestration packaging, publication, push, and deployment remain untouched.
