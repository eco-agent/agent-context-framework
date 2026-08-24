# Productize frontend composition workflows

## Intended outcome

Turn the accepted Convex Instantiator proof into one optional ACF workflow
package. The package will own generic representation, compose and review,
preflight, and external acceptance contracts. Project repositories will keep
their Git, browser, package-manager, and fixture adapters.

## Git ownership

- Baseline: `de95d1e1113b8a45222dae2bfe4049fcbd4ea576`.
- Branch: `codex/frontend-workflow-productization`.
- Checkout: `D:\dev\agent-context-framework`.
- Writer: the primary agent owns this branch and index.
- Project contracts: repository policy is configured and declares none.
- Push and merge remain prohibited without a new user request.

## Reuse decision

Reuse the accepted fixture controllers and tests from
`D:\dev\convex-instantiator\.codex\workflows\frontend-representation`.
Reuse `packages/codex-workflow-runtime` for plans, role calls, evidence, and
`runReviewerRepair`. Reuse registry directory projection instead of creating a
second package owner. No external package matches the product-specific
representation, rendered review, and human acceptance contract closely enough
to replace these proven sources. New code is limited to extraction, generic
ports, preflight observations, acceptance state, and ACF distribution.

## Preservation map

| Behavior | Treatment | Owner |
| --- | --- | --- |
| One canonical generic workflow runtime | Retain | `packages/codex-workflow-runtime` |
| Objective-specific durability and continuation | Retain | `tools/codex-workflows` |
| Representation before implementation | Retain and make executable | `frontend-design-discipline` and new package |
| Semantic decomposition does not imply visual containment | Add as routed composition guidance | `composition-grammar.md` |
| Existing frontend specification decisions | Retain and extend | `frontend-spec.md` |
| Two materially different candidates | Retain | Representation controller |
| Fresh evidence-first composition review | Retain | Compose controller |
| One primary implementer across repair | Retain | Compose controller |
| Human ownership of representation and final visual acceptance | Retain and type | Acceptance transition |
| Git, browser, package manager, and fixture execution | Keep project-owned | Consumer adapters |
| Ordinary `frontend` bundle stays inert | Retain | Registry selection |
| Live orchestration needs explicit component selection | Add | `workflow-frontend-composition` |
| Existing component-library behavior and accessibility ownership | Retain | Consumer implementation |

No behavior is removed or weakened.

## Boundaries

| Boundary | Owner | Observation | Grace path |
| --- | --- | --- | --- |
| Composition judgment is semantic | Skill reference and reviewer | Specification, render evidence, cited finding | Stop for human judgment when evidence cannot decide |
| Model output cannot choose commands | Project adapter | Typed adapter input and decoder test | Return `invalid_request` |
| Mechanical readiness precedes model use | Preflight controller | One structured report covers process launch, the supported local schema subset, streams, evidence, and cleanup | Stop with `preflight_failed`; do not start Codex |
| Reviewer repair is finite | Compose controller | Review pass and repair counters in ledger | Return `exhausted` with latest evidence |
| Only complete render evidence can be reviewed | Compose decoder | Exact state coverage and revision checks | Return `blocked` when capture is unavailable |
| Human acceptance binds immutable evidence | Acceptance decoder | Run, revision, artifact, review, aggregate hash, and state hashes | Reject stale or conflicting replay |
| Adapters remain outside the generic package | Package exports and dependency graph | Boundary and package tests | Consumer supplies a conforming port or stops unsupported |
| Optional workflow remains inert unless selected | Registry component | Closure and installed fixture tests | Ordinary frontend bundle remains unchanged |
| Generated projections have one owner | Registry builder | Exact-byte and inventory check | Run `pnpm registry:build` from canonical sources |

## Type model

The existing
`.codex/work/types/frontend-composition-workflows.md` owns valid states,
transitions, trust boundaries, and failure semantics. Update that owner before
changing a decision. Do not create another state record.

## Smallest complete slice

1. Add the composition grammar and fields required to record spatial groups,
   layout owners, visual containment, surface reasons, density, and render states.
2. Extract the two generic controllers and strict decoders into a workspace
   package that imports the canonical workflow runtime.
3. Add one preflight API whose Windows implementation observes process launch,
   structured-output schema compatibility, stdout and stderr separation,
   content-addressed evidence replay, and owned temporary cleanup without a
   model call.
4. Add a typed, idempotent external acceptance transition.
5. Project the package through one optional registry component.
6. Prove mocks and installation, then run one live defective fixture that must
   return a cited finding to the same implementer before acceptance.

## Non-goals

- Do not put Git, Playwright, Vite, pnpm, or a product fixture inside the generic
  controller package.
- Do not add the live workflow to the ordinary frontend bundle.
- Do not add recursive roles, voting, dynamic tasks, unlimited retries, or model
  generated process commands.
- Do not change the accepted Convex Instantiator product UI.
- Do not deploy, merge, or push.

## Propagation paths

- Composition grammar to the frontend skill, registry artifacts, generated
  registry data, governance, and installed skill projection.
- Frontend specification fields to the template and workflow request decoders.
- Package source to workspace configuration, TypeScript references, lockfile,
  optional registry materialization, and installed package tests.
- Preflight report to CLI outcome and the live-call gate.
- Acceptance transition to artifact storage, terminal output, and replay tests.

## Current state

- Commit `388c4fb` adds the routed composition grammar and the specification
  fields for spatial grouping, surface budget, density, negative component
  decisions, and the spatial pass.
- `packages/codex-frontend-workflows` now owns the extracted representation and
  compose controllers. Their only mutation boundaries are artifact and revision
  ports supplied by the host project.
- The package also owns a strict composition manifest and bundle, an idempotent
  content-addressed evidence store, and an exact human acceptance transition.
- The Windows preflight passed all five checks on 2026-08-24. It started zero
  model turns and removed its temporary directory.
- Package typecheck and 13 focused tests pass.
- Registry revision `0.11.0` adds the optional
  `workflow-frontend-composition` component. It is absent from the ordinary
  `frontend` bundle.
- A clean installed-project test selected the component, bootstrapped the
  isolated runtime, built both packages, and passed the same zero-model
  preflight.
- The first upgrade install in Convex Instantiator exposed an installer fault.
  `add` materialized the new runtime package but retained an older lock owned by
  `runtime-base`. The installer now refreshes unchanged upstream artifacts in a
  runtime workspace whenever it installs a new package into that workspace.
  A focused upgrade regression and the clean installed-project proof both pass.
- Convex Instantiator run `0604f8b5-747c-47e4-86b8-97135016574f` proved the
  installed live path. Review 1 cited the injected pair of bordered, rounded
  Overview containers. Repair 1 resumed the original implementer thread and
  removed them. A fresh review 2 thread accepted revision
  `124cf35e2940acd271a425c1d775e9da01725d1c` after typecheck, tests, build, and
  all three renders passed.
- Human visual acceptance remains external. The controller stopped at
  `ready_for_human_review` and did not write an acceptance decision.
- Final acceptance at ACF revision `b052e8d` reached the workspace test stage
  and exposed stale dev-tooling assumptions about registry revision `0.10.0`,
  the former 35-component total, the single workflow package fixture, and an
  SDK-free aggregate runtime lock. The registry and runtime were correct. The
  five affected tests now describe registry revision `0.11.0`, all 36
  components, both workflow packages, the authorized optional workflow
  consumer, and the distinction between an SDK-free runtime base and the
  aggregate lock that installs optional workflow dependencies.
- The focused acceptance-repair suite passes 41 of 41 tests. The complete
  `@agent-context/dev-tooling` suite passes 103 of 103 tests.

## Verification plan

- Package typecheck and focused tests while changing contracts.
- Skill quick validation and direct agent-prose check on edited model-facing
  sources.
- Registry build and read-only drift check.
- Repository `workflow` profile.
- Installed optional-component fixture test outside the workspace.
- One zero-model preflight run on Windows.
- One bounded live repair run after every mechanical preflight observation
  passes.
- Final acceptance from a clean committed ACF revision.

## Closure

The requested package, grammar, preflight, optional component, human-acceptance
transition, and live reviewer-repair proof are complete. The final successful
live attempt had no mechanical failure after its first model turn. Earlier live
attempts exposed and fixed four project or contract faults: request files counted
as product edits, trimmed Git porcelain prefixes, an unstated review placeholder
rule, and unstable fixture screenshot positioning. Their ledgers remain in the
Convex fixture branch instead of being hidden.

The first final-acceptance attempt stopped on stale test expectations before
isolation or the downstream fixture ran. Final ACF revision and the repaired
repository acceptance result are recorded after the last checkpoint commit.
