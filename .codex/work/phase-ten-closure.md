# Work record: Phase 10 closure

## Outcome

Close the remaining contract and validation gaps in the revised framework plan
without adding components, changing the four-wave topology, or distributing any
objective orchestration. The result must make component revisions content-bound,
provide an explicit and scoped overwrite action for diverged owned content, record
human review ownership, and turn the remaining validation matrix claims into
deterministic repository-owned evidence.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/phase-ten-closure` in `D:\dev\agent-context-framework-phase10-closure`, based on clean canonical head `ac0122b4c0a01bcaa0df21ca3d89bf97dda78e5f`. | Git |
| Registry revision | Advance the governed registry from `0.5.1` to `0.5.2`; retain schema version 2 and the exact 28-component dependency graph. | Registry governance |
| Component revision | Every generated component declares `revision: sha256:<digest>`. The builder derives the digest from the complete normalized component contract after artifact and notice hashes are resolved, so canonical bytes or contract changes necessarily change the component revision. | Registry builder |
| Divergence overwrite | `agent-context update [COMPONENT] --overwrite` is the sole force action. It replaces only selected, registry-declared ownership scopes and preserves unrelated project content. Normal update remains preservation-first and blocks divergence. | Installer planner and CLI |
| Human review ownership | Add repository-local CODEOWNERS coverage for canonical context, registry, installer, runtime, and governance surfaces using the verified repository owner `@bet01`. | Repository governance |
| Matrix evidence | Extend existing projection, installer, decoder, repository-policy, runtime-isolation, registry-governance, and acceptance owners. Do not create a second harness or parser. | Verification |
| Final gate | After focused checks and clean commits, run the existing single acceptance invocation once against `D:\dev\control-tower-clean`; record revisions in a documentation-only commit and do not rerun broad gates. | Acceptance sequencer |

## State

- Registry `0.5.2` contains the unchanged 28-component topology with a required
  content-addressed revision on every component.
- Explicit overwrite, repository-local review ownership, installer and project
  matrices, CRLF behavior, and semantic anti-dilution checks are implemented.
- The controlled fixture is committed at registry `0.5.2` while its host package
  manifest, host lockfile, Codex configuration, hooks, and local repository policy
  remain unchanged.

## Topology

```text
canonical sources
      |
      v
existing registry builder --content digest--> component revision
      |                                      |
      v                                      v
strict registry decoder                governance checks
      |
      v
existing installer planner --typed update mode--> projection + transaction
      |
      v
existing focused tests + one acceptance sequencer
```

## Slice

1. Make component revision a required decoded field and derive it in the existing
   builder from normalized component content.
2. Add repository ownership and anti-dilution checks that bind canonical bytes,
   intended skill triggers, frontend prohibitions, and component revisions.
3. Model update behavior as preservation or explicit overwrite, propagate it from
   CLI parsing through planning, and prove that only owned scopes are replaced.
4. Add missing installer fixtures for line endings, order, multiple sections,
   modified skills, future schemas, and recovery/collision boundaries.
5. Add project-shape fixtures for TypeScript, non-Node, Codex-configured,
   monorepo, single-package, frontend, and optional Tailwind selection.
6. Strengthen the existing isolation report so the checkout-independent proof is
   explicit, then run the single acceptance sequence from clean commits.

## Replacements

- Replace registry components without revisions with content-addressed component
  contracts.
- Replace the implicit “manual force” gap with one explicit typed update mode.
- Replace prose-only matrix claims with deterministic tests in their current
  owners.
- Replace unevidenced human ownership with repository-local CODEOWNERS rules.

## Non-goals

- No component additions, dependency-edge changes, schema compatibility layer,
  migration path, model-authored merge, objective kernel, scheduler, queue,
  database, task envelope, agent loop, publication, deployment, or push.
- No changes to the host product graph or to `D:\dev\control-tower-clean` before
  the controlled fixture installation step.
- No broad gate repetition after the final evidence-only commit.

## Propagation

- Registry source revision, decision record, builder, generated registry, strict
  decoder, isolated decoder copy, locks and doctor output where applicable.
- Installer public API, CLI grammar, planning intent, projection application,
  transactions, recovery, help text, and focused tests.
- CODEOWNERS, governance manifest/checker, component and skill semantic checks.
- Installer contract fixtures, repository-policy project shapes, isolation result,
  acceptance sequencing, and durable evidence.

## Verification evidence

Focused verification passed before the final gate:

- Repository-policy tests: 29 passed.
- Dev-tooling tests: 68 passed when run as the focused owner suite.
- Isolated policy tests: 7 passed, including the declared project-shape matrix.
- Projection tests: 7 passed; installer tests: 15 passed; registry builder tests:
  11 passed.
- Registry governance validated revision `0.5.2` with 28 components.
- Runtime isolation reported policy, project matrix, repository context, hooks,
  installed entrypoints, and host hashes as valid.
- The fixture doctor reported healthy, operational, policy-ready, and Codex-ready.

The first acceptance process was externally terminated by the command wrapper at
120 seconds before it produced a result. The next two completed attempts stopped
in the workspace stage on test-only 30-second and 40-second integration deadlines.
Those tests passed alone in 15.1 and 16.4 seconds, while the concurrent workspace
run measured 40.5 seconds for the MCP smoke. Their test-only ceilings were raised
to 90 seconds; production MCP timeouts were not changed.

The completed acceptance sequence passed on 2026-08-09 with these immutable
inputs:

- Framework revision: `8d32a2811c4948a9ac6bc2c1166131fc60fe2e6a`.
- Downstream fixture revision: `9454d473bfb0bdc9e6b806156dda030c5bc99b24`.
- Workspace stage: passed in 134,501 ms. Typecheck, tests, repository checks, and
  registry checks all passed.
- Isolation stage: passed in 48,763 ms.
- Downstream stage: passed in 41,103 ms. Codex runtime verification and repository
  policy verification both passed.

This evidence update is documentation-only. Broad verification was not rerun after
it.
