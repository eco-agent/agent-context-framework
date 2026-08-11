# Work record: optional orchestration authoring

## Outcome

Publish the existing bounded `orchestrate-codex-workflows` skill and its generic
TypeScript runtime template as one explicitly selected Agent Context Framework
component in registry revision `0.7.0`. Installation must remain inert: it copies
reviewable authoring source but does not install SDK dependencies, create a
workflow, start a loop, produce hook bindings, or edit the consumer's manifests
or lockfiles.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/orchestration-authoring` from clean framework head `77d9d8045076560e1e87a74034f5c7564a54a009`. | Git |
| Registry revision | Advance `0.6.0` to `0.7.0`. Preserve generated registry, project config, and lock schema version 2. | Registry governance |
| Selection | Add only the leaf component `skill-orchestrate-codex-workflows`. No existing bundle selects it transitively. | Registry topology |
| Installed source | Own the complete skill under `.codex/skills/orchestrate-codex-workflows`, including UI metadata, loop reference, generic runtime assets, and mock tests. | Skill source |
| Runtime boundary | Installation is source-only. A later explicit skill invocation may copy and adapt the template. Live SDK execution remains separately authorized. | Skill and framework instructions |
| Internal workflow system | Keep `tools/codex-workflows`, objective kernels, objective runtimes, schedulers, stores, task envelopes, binding producers, and product integrations outside the component closure. | Distribution boundary |
| Provenance | Reuse the existing maintained skill bytes. Record project MIT ownership only after repository evidence confirms authorship. Preserve the pinned SDK's Apache-2.0 dependency disclosure. | Licensing governance |
| Safety governance | Protect fixed topology, finite budgets, evidence-before-transition, least authority, decoded control data, and explicit rejection of recursive roles and quorum loops. | Context governance |

## State

- The named skill, loop catalog, UI metadata, and generic TypeScript runtime
  template have been read from the user-owned Codex skill installation.
- The repository already contains an expanded internal consumer in
  `tools/codex-workflows`. It is not the distributable owner.
- Repository policy is unconfigured because `.agent-context/policy.json` is
  absent. No project contract paths are available.
- No live Codex workflow execution, push, or deployment is authorized.

## Topology

```text
explicit selection
  skill-orchestrate-codex-workflows
    -> .codex/skills/orchestrate-codex-workflows/**

existing bundles ----------------------------------X orchestration skill
installed skill -----------------------------------X automatic execution
generic template ----------------------------------X tools/codex-workflows
generic template ----------------------------------X objective infrastructure
```

## Slice

1. Materialize the existing skill as repository-owned canonical source and
   resolve its license and dependency notices.
2. Add the explicit component and advance registry governance to `0.7.0`.
3. Replace the absolute workflow exclusion with an explicit-selection boundary
   in current documentation and the new decision record.
4. Add semantic governance and exact-closure verification.
5. Validate the skill package, copied template mock tests, registry generation,
   installer lifecycle, and operator disclosure without a live SDK run.

## Replacements

- Replace the absolute statement that no Codex SDK workflow source is
  distributable with a narrower rule: only the explicit authoring-skill
  component may distribute inert workflow template source.
- Replace user-home source ownership with repository-owned canonical bytes.
- Replace implied coupling to the expanded internal workflow tool with an
  explicit generic-template versus internal-consumer boundary.

## Non-goals

- No workflow is created or executed for the consumer.
- No SDK package is installed by framework installation.
- No objective kernel, scheduler, queue, database, task envelope, binding
  producer, adaptive hierarchy, sibling quorum, or unbounded loop is added.
- No existing component dependency changes.
- No compatibility layer, migration adapter, publication, push, or deployment.

## Propagation

- Skill source, UI metadata, runtime assets, tests, license and dependency
  records.
- Registry source, generated registry, revision decision, README, governance
  manifest, semantic checks, CODEOWNERS-covered paths, and exact closure tests.
- CLI and setup UI receive the component through the existing registry-driven
  planner. Code changes are required only if evidence shows they do not disclose
  the new component correctly.

The runtime invariants and deliberately excluded durability semantics are owned
by `.codex/work/types/orchestration-authoring-runtime.md`.

## Verification evidence

- The copied package passed its own strict build and all 30 mock tests in an
  isolated temporary installation with Node.js `24.14.0`, TypeScript `6.0.2`,
  `@types/node` `22.10.2`, and `@openai/codex-sdk` `0.145.0`.
- Skill quick validation passed after the final instruction edits.
- Registry generation and deterministic checking both reported revision
  `0.7.0` with 30 components.
- The focused registry builder suite passed 17 tests. It proves the leaf-only
  raw closure, exclusion from every existing component, governed hashes and
  semantics, license alignment, generated-directory exclusion, inert install,
  unchanged consumer manifest and lockfile, and planner/setup disclosures.
- The focused Codex-agent, Codex-runtime, repository-policy, and installer-CLI
  group passed 10 tests. The setup-server suite passed 3 tests after its
  assertion distinguished the uninitialized planner's default `core` selection
  from the explicitly requested orchestration leaf.
- Dev-tooling TypeScript checking and the setup-UI production build passed.
- The repository technical-prose check passed for the six changed Markdown
  owners.
- Live Codex execution, the broad `verify:acceptance` run, downstream migration,
  and live-browser visual review were not performed. They remain separate
  acceptance boundaries.
