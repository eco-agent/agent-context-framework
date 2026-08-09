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

- Registry `0.5.1` contains 28 components and 157 artifact declarations.
- The four waves, isolated runtime, repository policy, Codex interface, MIT
  licensing, external capability declarations, and orchestration exclusion have
  passed the existing acceptance sequence.
- Remaining gaps are bounded to per-component revisions, explicit overwrite,
  repository-local review ownership, missing installer/project fixture variants,
  and semantic anti-dilution assertions.

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

