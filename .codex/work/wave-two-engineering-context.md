# Wave 2 engineering context

## Outcome

Package the seven Wave 2 engineering skills as project-owned source, add four
independently selectable bundles, and install durable work, type-contract,
project-decision, and documentation-convention assets. Keep frontend,
TypeScript, session optimization, skill authoring, runtime extraction, and
objective orchestration independently selected.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Registry revision | Advance the governed registry from 0.2.0 to 0.3.0 with one Wave 2 decision record. | Registry |
| Skill reuse | Package the seven existing `.codex/skills` directories directly. Repair only demonstrated downstream path or command defects. | Skill source |
| Engineering bundle | Depend on codebase inventory, diagnosis, reuse, and technical prose. Own only general engineering instructions, work/decision templates, and documentation conventions. | `engineering` |
| TypeScript bundle | Depend on `engineering` and the TypeScript-invariants skill. Own the TypeScript instruction section and type-contract template. | `typescript-engineering` |
| Session bundle | Depend only on session optimization and own only its trigger section. | `session-quality` |
| Authoring bundle | Depend on writing-great-skills and technical prose and own only its trigger section. | `skill-authoring` |
| Template ownership | Use one canonical registry source for each installed template. Reuse the TypeScript skill's existing type-contract asset as the canonical type template. | Registry sources |
| Documentation conventions | Reuse the already-governed canonical documentation instruction source and install it as a marked `docs/AGENTS.md` section. | `engineering` |
| Technical-prose capability | Make repository-specific prose commands conditional and declare the deterministic technical-prose check as recommended, not silently assumed. | Skill and registry |
| TypeScript gate portability | Remove Control Tower-specific `apps/web` command assumptions. Route to a repository-declared invariant gate, lint, and typecheck. | TypeScript skill |
| Session tooling portability | Keep source-owned Node metrics scripts. Remove fallback references to framework-only compiled workflow paths and declare repository-context access as recommended. | Session skill |
| Binary fixture | Keep the codebase-inventory `.png` sentinel as a materialized fixture but use UTF-8 sentinel bytes; classification is extension-driven and the existing validator proves the behavior. | Inventory skill |
| Runtime boundary | Add no runtime workspace, policy package, hooks, agents, repo-context server, or bootstrap operation. | Task |
| Orchestration boundary | Add no objective kernel, scheduler, durable runner, loop, task-envelope, or objective fixture artifact to the distributable registry. | Task |

## State

- Framework baseline: `9e3266dec57e6e0b4d9d0954f3be1f0fff22a7ff` on `codex/agent-context-framework`.
- Registry 0.2.0 contains 8 skill components and 2 frontend bundles.
- All seven Wave 2 skill directories already exist in the framework.
- `write-technical-prose`, `writing-great-skills`, TypeScript invariant references, and session optimization contain framework- or Control Tower-specific command paths that are not valid in an arbitrary installed project.
- The codebase-inventory fixture contains an eight-byte PNG signature that the text-only Wave 1 materializer cannot package; the fixture detects binary status from `.png`, not image decoding.
- Canonical repository-work, verification, and documentation sources already exist. Core already owns portable work and verification rules, so Wave 2 will not install duplicate sections.

## Topology

```text
engineering
├── skill-codebase-inventory
├── skill-diagnose
├── skill-reuse-before-implementation
├── skill-write-technical-prose
├── engineering instructions
├── work-record template
├── project-decision template
└── documentation conventions

typescript-engineering
├── engineering
├── skill-design-typescript-invariants
├── TypeScript instructions
└── type-contract template

session-quality
└── skill-optimize-codex-sessions

skill-authoring
├── skill-writing-great-skills
└── skill-write-technical-prose
```

## Slice

1. Record registry 0.3.0 and the exact Wave 2 component graph.
2. Add canonical bundle instruction sources and templates, then project the instructions into the framework's own `AGENTS.md`.
3. Repair only the identified installed-path assumptions in Wave 2 skills and record missing third-party provenance.
4. Add seven atomic skill components and four bundle components to the source registry.
5. Extend deterministic tests for exact membership, independent resolution, licensing, references, template targets, and orchestration exclusion.
6. Build and check registry 0.3.0.
7. Install all Wave 2 bundles in clean Control Tower, verify idempotence/current health, and run focused and full checks.

## Replacements

- Replace hard-coded framework/Control Tower command paths with repository-declared gates or installed source paths.
- Replace implicit bundled concerns with four explicit bundle selections.
- Replace ad hoc future template copying with canonical registry artifacts.
- Replace the registry 0.2.0 Wave 1 decision owner with the 0.3.0 Wave 2 decision owner.

## Non-goals

- No Wave 3 repository-policy component.
- No isolated runtime workspace or bootstrap command.
- No Codex agents, hooks, repository-context server, or config integration.
- No objective orchestration packaging.
- No frontend component, instruction, skill, or policy changes.
- No product manifest or host lockfile mutation.
- No compatibility schema, migration, push, deploy, or publication.

## Propagation

- Registry revision and decision ownership propagate through the source catalog, built registry, governance manifest, clean installation lock, and verification evidence.
- Skill portability repairs propagate through framework sources and exact downstream materialization.
- Bundle instruction sources propagate into framework projections, downstream marked sections, governance hashes, and anti-dilution tests.
- Template sources propagate to `.codex/templates` targets and provenance lock entries.
- License declarations propagate from `SOURCE.json`/notice files into component metadata and installed artifacts.
- Independence propagates through dependency resolution tests and clean installation selection.
