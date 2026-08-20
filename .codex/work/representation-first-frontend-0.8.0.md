# Representation-first frontend — registry 0.8.0

## Outcome

Codify the maintainer's observed frontend-agent failure modes as a progressively
disclosed design workflow. Preserve the observations at their proper layer:
semantic design judgment in focused skill references, inspectable stage artifacts
at handoff boundaries, and programmatic checks only where behavior is observable.

## Decisions

- `frontend-design-discipline` remains the owner of product reframing,
  representation search, mobile recomposition, attention selection, approved
  frontend specifications, reconciliation, and visual review.
- `responsive-css-architect` remains the owner of constraint-based layout and the
  rule to express relationships rather than screenshot measurements.
- `SKILL.md` is a router and operating loop. Conditional doctrine lives in
  one-level references loaded only for the active stage.
- Exploration and implementation use different artifacts. The exploration record
  preserves considered and rejected representations. The approved frontend
  specification is a deliberately lossy boundary containing only the selected
  target and evidence needed downstream.
- Existing implementation is evidence during reconciliation, not authority during
  product or representation search.
- Semantic instructions own judgments such as metaphor coherence, sufficient
  context, and meaningful design difference. Templates and tests may require
  evidence, states, and declared decisions but do not claim to prove taste.
- Registry revision `0.8.0` changes governed frontend doctrine without adding a
  component or dependency edge.

## State

- Base registry revision: `0.7.0`.
- Base component count: 30.
- The existing frontend skill moves directly from evidence to a settled
  specification and therefore exposes implementation anchors too early.
- The existing responsive skill already prefers intrinsic CSS but does not state
  the portability test or distinguish intentional physical constants from layout
  compensation as sharply as the maintainer's observation.
- Optional orchestration authoring provides bounded roles, plans, artifacts, and
  evidence. It does not currently provide hard repository/tool isolation or an
  empirical context-ablation harness.

## Topology

```text
frontend-design-discipline/SKILL.md
  -> product-reframing.md
  -> representation-search.md
  -> mobile-recomposition.md
  -> progressive-context.md
  -> implementation-reconciliation.md
  -> visual-review.md
  -> assets/design-search.md
  -> assets/frontend-spec.md

responsive-css-architect/SKILL.md
  -> existing layout-patterns and review references
```

## Slice

1. Route unsettled frontend work through the appropriate design stage before the
   durable specification.
2. Preserve subject-derived representation search, observed-state evidence,
   mobile recomposition, and first-draft destruction in focused references.
3. Separate the exploration artifact from the approved implementation artifact.
4. Reconcile the approved target with current code only after the design boundary.
5. Strengthen intrinsic CSS doctrine without duplicating the responsive skill in
   the frontend router.
6. Govern and generate the exact registry bytes at revision `0.8.0`.

## Replacements

- Replace the current linear evidence-to-specification workflow with a routed
  attention loop.
- Expand `frontend-spec.md` from implementation-only decisions to the approved,
  representation-independent handoff.
- Do not retain parallel legacy instructions for the superseded workflow.

## Non-goals

- No context controller, task envelope, scheduler, queue, database, binding
  producer, or active workflow is added.
- No claim of hard context isolation, filesystem/tool scoping, global minimum
  context, or automated design quality is made.
- No frontend product is implemented and no browser review is performed.
- No existing component dependency or installation capability changes.
- No migration, deployment, publication, or push.

## Propagation

- Update canonical skill sources and templates.
- Add a current registry decision while leaving historical decisions unchanged.
- Refresh protected source hashes and semantic governance where the new doctrine
  is safety-critical.
- Generate and check the registry, then run only focused skill, registry, and
  technical-prose verification declared by repository policy.

## Verification record

Implemented on `codex/representation-first-frontend` from registry revision
`0.7.0` at `34a3dfd`.

Verified:

- `pnpm install --frozen-lockfile` restored the worktree-local dependency graph
  without changing `package.json` or `pnpm-lock.yaml`.
- Technical prose passed for 16 changed Markdown owners.
- The system skill validator passed for `frontend-design-discipline` and
  `responsive-css-architect`.
- Registry generation and deterministic check passed at `0.8.0` with 30
  components.
- The focused registry, governance, installer, reference, and anti-dilution suite
  passed 18 of 18 tests.
- Dev-tooling TypeScript validation passed.
- Codex agent, Codex runtime, and repository-policy compatibility checks passed.
  Their combined first run had one Windows `EPERM` during a temporary staged-file
  rename. The affected two-test Codex-agent file passed on an immediate isolated
  rerun.
- `git diff --check` passed.

The generated component revision delta is limited to:

- `skill-frontend-design-discipline`
- `skill-responsive-css-architect`
- `frontend`, because its protected instruction artifact changed

Not performed:

- Broad `verify:acceptance` and downstream fixture migration.
- Browser or visual review of a product interface. This revision changes design
  instructions, templates, and governance rather than a rendered product.
- Independent behavioral forward-testing of the revised skill.
- Runtime-enforced context isolation or context-ablation evaluation.
