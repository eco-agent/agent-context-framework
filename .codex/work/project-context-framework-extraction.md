# Project context framework extraction

## Outcome

Produce two independently useful repositories from Control Tower commit
`abd50a48938525d174066f337d2eb7389927f38c`:

- `codex/control-tower-clean` retains the Control Tower product and removes the
  project context framework so it can serve as an integration fixture.
- `codex/agent-context-framework` retains the reusable context, policy,
  orchestration, and objective tooling while removing Control Tower product
  implementation and product documentation.

The framework repository will own a project-local installation path, similar
to shadcn: installed artifacts become ordinary project files, project choices
are explicit, and no global Codex configuration is required.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Source baseline | Both worktrees start at `abd50a48938525d174066f337d2eb7389927f38c`. | Extraction |
| Product boundary | Control Tower applications, domain packages, product tests, BRD/PRD/ADR material, and runtime-specific dependency records stay only in the clean product worktree. | Control Tower |
| Framework boundary | Agent instructions, skills, repository policy, bounded repository context, task envelopes, objective orchestration, and their direct tooling dependencies stay only in the framework worktree. | Framework |
| Mixed code | Extract and rename reusable behavior; do not retain Control Tower branding or product-specific policy as hidden defaults. | Framework |
| Distribution | Copy project-owned artifacts from a versioned registry through a project-local CLI and record an installation manifest. | Framework CLI |
| Integration fixture | Install into `D:/dev/control-tower-clean` and verify the resulting files and applicable narrow checks there. | Integration test |
| Recovery | Git commits in each worktree are the recovery mechanism. No compatibility tree or duplicate representation will be added. | Git |

## State

- Source worktree is clean.
- Both target paths were absent before creation.
- Both branches and worktrees now exist at the same source commit.
- Inventory found 344 non-generated visible source files and 55,656 lines;
  `tools`, `.codex`, and framework-linked packages require semantic splitting.
- Classification and extraction are in progress.

## Topology

```text
agent-context-framework
├── project-local CLI and registry
├── reusable AGENTS.md baseline
├── .codex skills and work conventions
├── repository policy
├── bounded repository context and task envelopes
└── objective kernel/runtime and Codex orchestration

control-tower-clean
├── apps
├── product/domain packages
├── product tests
├── product documentation
└── ordinary build configuration
```

The integration flow is one-way: the framework CLI materializes selected,
versioned artifacts into the clean product repository. The clean baseline must
not depend on framework packages before that installation.

## Slice

1. Remove framework-owned artifacts and framework-only dependencies from the
   clean Control Tower worktree while retaining a coherent product workspace.
2. Remove product-owned artifacts from the framework worktree and neutralize
   names, package metadata, policy configuration, and examples.
3. Add one project-local initialization command with a versioned registry and
   manifest.
4. Install the framework into the clean Control Tower worktree.
5. Verify framework unit behavior and the installed Control Tower integration.

## Replacements

- Replace the Control Tower-specific root instruction document in the
  framework repository with a reusable baseline plus explicit project slots.
- Replace hard-coded `@control-tower/*` framework package identities with a
  neutral namespace.
- Replace Control Tower-specific policy assumptions with configuration owned
  by the installing project.
- Replace direct repository coupling with registry artifacts and an installation
  manifest.

## Non-goals

- Publishing an npm package or global Codex configuration.
- Preserving old package names or compatibility adapters.
- Reworking Control Tower product behavior.
- Pushing branches, deploying, or changing the original `main` worktree.
- General-purpose recursive agent spawning.

## Propagation

- Package names propagate through imports, workspace dependencies, TypeScript
  references, scripts, tests, examples, and the lockfile.
- Removing framework tooling from Control Tower propagates through root scripts,
  TypeScript project references, dependency adoptions, CI, and nested
  `AGENTS.md` references.
- Registry installation propagates into `AGENTS.md`, `.codex/skills`, policy
  configuration, package scripts, and the framework manifest.
- Every intentional gap or skipped verification will be recorded here before
  handoff.
