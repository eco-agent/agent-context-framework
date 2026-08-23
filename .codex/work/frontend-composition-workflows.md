# Frontend composition workflows

## Intended outcome

Add two optional, executable Codex workflows that carry an approved frontend
representation into rendered visual evidence and bounded composition repair.
Install and prove them in `D:\dev\convex-instantiator` without depending on the
Agent Context Framework source checkout.

## Git ownership

- Framework baseline: `68072476a29c86d2cd6a792ed81d8fb20a0f39be`
- Framework branch: `codex/frontend-composition-workflow`
- Framework checkout: `D:\dev\agent-context-framework`
- Fixture baseline: `f44a67757e9e2be3db6375902d9b8a248607258a`
- Fixture branch before workflow execution: `codex/clean-downstream-fixture`
- Fixture checkout: `D:\dev\convex-instantiator`
- Writer rule: the live workflow will create and own a new fixture task branch.
  No other role may write that branch or index while the workflow runs.

Both repositories were clean when this stream started. The framework policy is
configured and declares no project contract paths. The fixture policy is
configured and the installed ACF runtime is operational.

## Decisions

### Workflow split

`frontend-representation` owns unsettled product representation. It produces two
materially different candidates, compares them against the same tasks and states,
and returns a content-addressed draft for human approval. It does not edit product
code.

`frontend-compose-and-refine` starts only from the approved specification. It
implements one bounded slice, captures rendered evidence, sends that evidence to
a fresh read-only composition reviewer, permits at most two returns to the primary
implementer, runs repository policy checks, and returns `ready_for_human_review`.
It cannot accept its own visual result.

Both workflows use `runAuthorityLadder` as their only workflow loop. The fixed
stage graph needs named returns between owners. Render process readiness belongs
to the render adapter, so a nested autonomous-environment loop would add state
without adding an authority boundary.

### Canonical code and installation

Create one portable `packages/codex-frontend-workflows` package. It owns the two
controllers, decoded contracts, role prompts, ledger events, and CLI. It consumes
`packages/codex-workflow-runtime`; it does not copy its loops.

Add one optional registry leaf, `workflow-frontend-composition`. Its closure will
include the frontend design skill, orchestration authoring skill, repository
policy, Codex project runtime, and the two executable runtime packages. The leaf
will materialize packages under `.agent-context/runtime/packages/` and will not
change the host repository's package manifest or lockfile.

Before implementing that package, prove in an isolated installer fixture that
the fixed runtime lock accepts optional workspace importers which are absent when
the leaf is not selected. If pnpm rejects that shape, keep the same canonical
source and project it into one self-contained installed runtime package. Do not
create a second editable runtime owner.

### Evidence and authority

`FrontendSpecificationBundleV1` binds the existing human-readable Markdown
specification to one decoded composition manifest. The bundle hash covers both,
so the prose and machine-readable fields cannot drift independently. The
composition manifest adds:

- semantic owner, spatial group, layout owner, containment choice, and reason;
- each visual surface, whether it is primary or additional, its interaction
  reason, and its relevant states;
- the density source, spacing and control defaults, and allowed exceptions;
- the required render matrix and destructive comparison.

`RenderEvidenceV1` records the Git revision, route or fixture, state, viewport,
screenshot hash and reference, console or runtime failures, observed layout
facts, capture adapter identity, and capture time. Layout facts may locate and
count likely visual containers, nesting, repeated padding, and alignments. They
do not decide whether the composition is good.

`CompositionReviewV1` records typed findings for hierarchy, grouping, alignment,
density, containment, omission, responsive behavior, and state legibility. Every
finding cites render evidence. A source reference is optional and may be added
only after a visual finding needs implementation evidence.

Every JSON schema must encode the exact IDs, task-owned evidence kind, and enum
limits that its runtime decoder later enforces. The decoder remains the final
trust boundary. It must not be the first place a live role discovers a narrower
contract than the schema and prompt supplied to that role.

The human owner approves the representation and the final rendered result.
Repository policy owns deterministic code verification. The controller owns
schema validation, hashes, transition limits, role permissions, and stopping.

### Budgets and stopping

The representation workflow has four forward stages and one possible return to
the destructive-alternative stage. Six transitions cover the full pass plus
that correction.
Each role gets a fresh thread because no stage needs conversation history.

The compose workflow allows one implementation plus two repairs. The two-repair
limit reuses the repository's existing `CapabilityRequest` boundary. Visual and
repository failures share this budget. A successful path uses five transitions.
Each repair can repeat implementation, render, review, and verification. Thirteen
transitions cover the largest useful run with two verification returns. The human
handoff is an outer terminal outcome and does not consume another transition.

Each model turn has an explicit timeout and the outer process has a deadline.
The initial live fixture values will be set after the mock run measures prompt
bytes and capture duration. The controller must reject missing or unlimited
values. It stops on acceptance, human wait, render failure, authority breach,
budget exhaustion, repeated revision or screenshot hashes after a requested
repair, invalid model output, cancellation, or deadline.

## Preservation map

| Existing behavior | Treatment | Owner |
| --- | --- | --- |
| Representation precedes implementation | Retain and execute | `frontend-design-discipline` and `frontend-representation` |
| One primary surface and no card-based hierarchy | Retain | Global frontend instruction |
| Semantic code boundaries do not dictate layout | Add as the short universal invariant | Global frontend instruction |
| Conditional composition rules and negative component guidance | Add | New composition grammar reference |
| Existing component library keeps behavior and accessibility | Retain | Frontend skill and product implementation |
| Human judgment owns visual quality | Retain and enforce as a wait result | Human acceptance stage |
| Primary agent owns implementation | Retain | Compose workflow role registry |
| Independent review is fresh and read-only | Retain | Compose workflow role registry |
| Repository profiles own deterministic verification | Retain | Repository policy adapter |
| Installed orchestration authoring source remains inert | Retain | Existing skill component |
| Live frontend workflow is separately selected | Add | New registry leaf |
| Workflow runtime has one canonical source | Retain | `packages/codex-workflow-runtime` and projection governance |

No existing behavior is removed or weakened.

## Boundaries

| Boundary | Owner | Observation | Grace path |
| --- | --- | --- | --- |
| No product code before representation approval | Representation controller | Approved specification hash is required by the compose decoder | Return `awaiting_representation_approval` |
| Model output cannot choose commands | Controller and adapters | Commands come from typed project configuration, never role output | Stop with an invalid configuration result |
| Structured output and runtime decoding must agree | Workflow contract owner | Mock tests inspect dynamic schema enums and prompts; live validation records rejected mismatches | Correct the schema and prompt, retain the failed ledger, then start a new one-attempt run |
| Evidence-only roles must not inherit target repository context | Run input builder | Copy the decoded request and allowlisted evidence into an owned temporary directory outside the target Git checkout | Stop before session creation if the evidence packet cannot be copied exactly |
| Reviewer sees rendered evidence before source | Review input builder | Ledger records the initial evidence references and excluded source | Add a narrow source reference only for a cited visual finding |
| Only the primary implementer writes product code | Role registry and Git transaction | Thread permissions, branch identity, and commits in the ledger | Stop on an unexpected writer or dirty index |
| Automated layout facts do not judge quality | Evidence schema | Facts and review decisions are separate records | Wait for the visual reviewer or human owner |
| Rendering is mandatory | Compose controller | Every reviewed revision has complete `RenderEvidenceV1` coverage | Stop or wait when capture is unavailable; TSX is not a substitute |
| Repairs are finite | Compose controller | Shared repair count and transition count in the ledger | Return exhausted with the latest usable evidence |
| Cleanup must not hide the workflow result | CLI | Retry removal of the exact owned temporary directory and report a remaining cleanup failure separately | Preserve the original model, transport, or controller error in the ledger and process result |
| Visual acceptance remains human | Controller | External acceptance names the selected render hashes and Git revision | Return `ready_for_human_review` |
| Live execution is optional | Registry selection | Component closure and activation disclosure | Keep ordinary frontend verification unchanged |

## Current state

- The generic runtime and all eight loop helpers are canonical in
  `packages/codex-workflow-runtime`.
- `runCapabilityWorkflow` already composes implementation, repository policy,
  independent review, and bounded repair.
- Frontend guidance already owns representation search, a lossy approved
  specification, rendered review, and human judgment.
- The ordinary `frontend` profile does not render UI and should remain that way.
- The fixture has a copied representation workflow test package built from the
  distributable runtime. Its 37 runtime and workflow tests pass.
- The fixture's `qa:ui` Playwright script already provides deterministic states,
  viewport facts, console errors, and screenshots. Its full capture matrix passes
  after adding the missing `iisCompanionSites` field to the test adapter.
- A repository-subdirectory working directory inherited the fixture's required
  project MCP server and failed before model startup. Moving the allowlisted
  evidence packet outside the Git checkout allowed Codex session creation.
- The isolated live run then stopped on the account usage limit before Candidate
  A returned. The fixture retains both JSONL failure records. No composition was
  produced or approved.
- After the usage reset, two one-attempt runs exposed schema-to-decoder gaps for
  evidence references and evidence kinds. Both failed closed. The fixture now
  encodes the allowlisted evidence IDs and task-owned kinds in the service schema,
  prompt, decoder, and mock test.
- Live run `acfd0f62-2a11-4200-9425-743b84b968d0` then completed all three
  tasks with 12 ordered ledger events and three content-addressed artifacts. The
  fresh reviewer recommends Candidate A, `Quiet operational flow`. The terminal
  state is `awaiting_human_approval`; no product source changed.

## Smallest complete slice

1. Add the composition grammar and `FrontendSpecificationBundleV1` fields.
2. Add decoders for the specification, render evidence, composition review,
   workflow request, and terminal outcomes.
3. Add the two port-based controllers with mock roles, mock capture, fixed
   transitions, shared repair accounting, stagnation checks, and JSONL evidence.
4. Add an installed CLI with `validate`, `representation`, `compose`, and
   `accept` commands. The CLI reads project-owned configuration and emits JSON.
5. Add the optional registry leaf, projection governance, installer tests, and
   authenticated-execution disclosure.
6. Install the leaf into `convex-instantiator`, bootstrap the isolated runtime,
   and run the installed mock suite.
7. Run the representation workflow against the existing instance workspace.
   Preserve its content, actions, accessibility, and state ownership. Ask only
   how composition can become quieter and clearer.
8. After human selection, run compose and refine on a workflow-owned fixture
   branch, capture the existing QA matrix, run the declared frontend checks, and
   return the selected revision and screenshots for human acceptance.

## Fixture test contract

The fixture task is: recompose the existing instance workspace without adding or
removing product content, actions, navigation, or states. The workflow may change
layout, spacing, type roles, alignment, and justified visual boundaries.

The initial render matrix is the existing `qa:ui` matrix:

- 1440 by 900 light instance index and workspace states;
- 1024 by 768 light layout, settings, and backend failure;
- 1440 by 900 dark layout;
- create validation, unreachable endpoints, logs, connect, settings, and delete
  confirmation states;
- console and page errors plus viewport fit observations.

The fixture will add a typed command entry for the existing QA capture and a
machine-readable capture manifest. The workflow will start or attach to the Vite
server through project-owned code. It will not accept a process command from a
model response.

## Replacements

- Replace ad hoc prose-only composition reminders with one grammar reference and
  structured specification fields.
- Replace source-first visual review with screenshot-and-facts-first review.
- Replace manual workflow copying with a registry-owned executable projection.

Reuse the existing artifact mechanism by moving the generic artifact identity,
contract, and filesystem implementation into a lightweight shared package.
`objective-kernel`, `objective-runtime`, and the frontend workflow will consume
that owner directly. Do not copy the filesystem store or install PostgreSQL and
queue dependencies with the frontend workflow.

## Non-goals

- Do not add visual pass or fail rules based only on card counts or CSS classes.
- Do not make live orchestration part of the ordinary `frontend` bundle.
- Do not add recursive roles, dynamic role discovery, voting, or unlimited retries.
- Do not generalize browser capture beyond the port required for this first test.
- Do not merge, push, deploy, or accept the fixture's visual result for the user.

## Propagation paths

- Frontend instruction to generated `AGENTS.md` sections and governance hashes.
- Frontend skill to registry artifacts, installed skill files, and prose checks.
- Frontend specification schema to role inputs, controller validation, fixtures,
  and human acceptance records.
- Workflow package to runtime workspace projection, lockfile, registry component,
  activation disclosure, installer tests, doctor, and downstream verification.
- Render evidence to ledger records, reviewer prompts, terminal output, and the
  final human review handoff.

## Verification plan

- Narrow contract and controller unit tests with mock Codex and mock capture.
- Negative tests for missing approval, incomplete render coverage, source leaked
  into initial review, repeated hashes, budget exhaustion, invalid return targets,
  model-supplied commands, and revision mismatch.
- `pnpm workflow:test` while changing workflow owners.
- Repository-declared prose and registry checks for model-facing and distributed
  files.
- Installer isolation test for selected and unselected runtime packages.
- Installed mock test in `D:\dev\convex-instantiator`.
- One bounded live representation run, followed by human approval.
- One bounded live compose run, declared fixture checks, rendered evidence review,
  and human acceptance.

The downstream browser capture, installed mock workflow, and three-turn live
representation workflow have run. All 37 runtime and workflow tests pass. The
successful ledger has one accepted transition for Candidate A, Candidate B, and
the independent comparison. Artifact hashes match their stored bytes, and no
source path appears in the role evidence. Candidate A still needs human approval;
rendered implementation and the compose-and-refine workflow remain unverified.
