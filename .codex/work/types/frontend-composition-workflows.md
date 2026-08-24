# Type architecture contract

## Domain concepts

- `FrontendSpecificationBundleV1` binds one Markdown specification, one decoded
  composition manifest, and their content hashes.
- `RepresentationCandidateV1` is one candidate tied to the same product tasks,
  representative states, and content boundary as its sibling candidate.
- `RepresentationComparisonV1` names the major choice replaced in the second
  candidate and compares both candidates without approving either.
- `RepresentationApprovalV1` is an external human decision bound to the complete
  specification bundle hash.
- `RenderEvidenceV1` binds one Git revision, fixture state, viewport, screenshot,
  observed layout facts, and runtime failures.
- `RenderEvidenceSetV1` proves exact coverage of the specification's render
  matrix for one Git revision.
- `CompositionReviewV1` is a fresh review of one render evidence set. It either
  accepts that stage, requests bounded repair with cited findings, or escalates.
- `VisualAcceptanceV1` is an external human decision bound to the final Git
  revision and the complete render evidence set hash.
- `WorkflowRunId`, `SpecificationBundleHash`, `RenderEvidenceSetHash`, and full
  Git commit IDs are decoded identities. Plain strings cannot substitute for
  them inside the controller.

## Valid states

The representation controller permits:

```text
brief_ready
candidate_a_ready
candidate_b_ready
comparison_ready
awaiting_human_approval
```

The comparison stage may return once to `candidate_b_ready`. It cannot return to
the brief or silently mutate candidate A.

The compose controller permits:

```text
approved_specification
implemented
rendered
composition_accepted
repository_verified
ready_for_human_review
```

Composition review or repository verification may return to `implemented` while
the shared repair budget remains. Each return creates a new commit and invalidates
all render and review evidence from the prior revision.

Both controllers may finish with one of these explicit outcomes:

```text
awaiting_human_approval
ready_for_human_review
accepted
exhausted
blocked
cancelled
failed
```

Only the external acceptance command creates `accepted`. `failed` contains a
recorded infrastructure failure identifier. Expected boundary outcomes use
`exhausted`, `blocked`, or `cancelled` instead of exceptions.

## Invalid states to exclude

- An implementation request without a human-approved specification bundle.
- Approval that names only the Markdown file or only the composition manifest.
- Render evidence that mixes revisions, omits a required state or viewport, or
  has screenshot references without verified hashes.
- A composition review without a complete render evidence set.
- Initial composition review input containing source files.
- A repair request without findings, a prior revision, and remaining budget.
- Repository verification attached to a different revision.
- Human visual acceptance attached to stale screenshots or a stale revision.
- A completed or accepted result with unresolved render or repository failures.
- A model-generated process command entering an execution adapter.
- More than one mutable writer for the fixture branch.

## Allowed transitions

```text
brief_ready -> candidate_a_ready
candidate_a_ready -> candidate_b_ready
candidate_b_ready -> comparison_ready
comparison_ready -> candidate_b_ready | awaiting_human_approval
awaiting_human_approval -> accepted

approved_specification -> implemented
implemented -> rendered
rendered -> composition_accepted | implemented
composition_accepted -> repository_verified | implemented
repository_verified -> ready_for_human_review
ready_for_human_review -> accepted
```

Budget exhaustion, cancellation, an authority breach, missing render capability,
stagnation, or an infrastructure failure may terminate any active state with the
matching outcome. Terminal states have no transition except exact idempotent
replay of the same acceptance command.

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Workflow request file | JSON value | Exact-key request decoder, path containment, Git identity parser, budget parser | Representation or compose request |
| Frontend specification | Markdown bytes and JSON value | Bundle manifest decoder plus SHA-256 verification | `FrontendSpecificationBundleV1` |
| Model response | Response text | Per-role exact schema decoder | Candidate, comparison, implementation report, or composition review |
| Capture adapter | Paths, JSON, process exit, console output | Render matrix coverage, hash, revision, viewport, and failure decoder | `RenderEvidenceSetV1` |
| Repository policy | Process result JSON | Existing policy decoder and revision check | Verified repository result |
| Human signal | JSON value | Run, artifact, revision, owner, and exact-decision decoder | Representation or visual acceptance |
| Stored artifact | Bytes and metadata | Existing hash and metadata verification | Content artifact reference and bytes |
| Git checkout | Filesystem and refs | Cleanliness, full commit, branch, worktree, and expected-ref checks | Workflow Git transaction |

## Representations and conversions

| Representation | Guarantee | Converts to or from |
| --- | --- | --- |
| Markdown frontend specification | Human-readable approved decisions | One member of the specification bundle |
| Composition manifest JSON | Exact spatial groups, containment reasons, density source, and render matrix | One member of the specification bundle |
| Stored bundle manifest | Names both content hashes and schema version | Validated specification bundle |
| Raw capture manifest | Project adapter output | Validated render evidence set |
| Review response JSON | Schema-valid but not yet authority-checked | Composition stage decision |
| JSONL events | Append-only audit observations | Never reconstructed into authoritative process state |
| Terminal outcome JSON | Complete caller decision | CLI exit status and human handoff |

The frontend workflow package owns its content-addressed evidence store. The
Objective packages keep their existing store because this work does not change
their persistence contract. A later consolidation must replace both owners
directly if their contracts converge.

## Failure semantics

- Expected outcomes include human wait, unavailable capture, rejected review,
  repair exhaustion, transition exhaustion, stagnation, cancellation, authority
  refusal, and stale acceptance.
- Exceptional failures include corrupt stored bytes, impossible internal state,
  failed atomic writes, SDK transport failure after the outer runner records it,
  and Git identity changes outside the recorded transaction.
- The CLI translates input failures to `invalid_request`, expected workflow
  outcomes to typed JSON with a non-success status where appropriate, and
  recorded infrastructure failures to `failed`. It does not expose secrets,
  hidden reasoning, or full model conversations.

## Public contracts affected

- Content artifact identity, reference, store, and filesystem implementation.
- Strict composition manifest and specification bundle.
- Frontend specification template and composition manifest schema.
- Representation and compose workflow request decoders.
- Render adapter and repository verifier ports.
- Role response schemas and prompt builders.
- Workflow terminal outcome and external acceptance command.
- Installed CLI command and JSON output contract.

## Decisions and rejected alternatives

- Use discriminated states rather than an object with optional specification,
  revision, render, review, verification, and acceptance fields.
- Bind Markdown and structured composition data into one hashed bundle rather
  than maintain two independently editable specifications.
- Keep the small frontend evidence store in the frontend package. Do not install
  the Objective runtime to obtain a product-specific persistence contract.
- Use one authority ladder per workflow rather than nested workflow loops.
- Keep render execution behind one production and one mock adapter. Do not expose
  process execution as a generic model-controlled port.
- Keep JSONL as evidence only. It does not become workflow recovery state in the
  first slice.

## Verification evidence

- Controller tests cover both forward paths, one reviewer return, repair
  exhaustion, incomplete verification, path escape, and cosmetic candidate
  rejection.
- Specification and acceptance tests cover complete spatial-pass enforcement,
  stale evidence, conflicting replay, and exact idempotent acceptance.
- Artifact tests prove content identity, idempotent writes, and read verification.
- An installed-project test proves the optional component can bootstrap, build,
  and pass the five-check zero-model preflight outside this workspace.
- Installed Convex Instantiator run
  `0604f8b5-747c-47e4-86b8-97135016574f` proves the live repair transition.
  `implement` and `repair-1` both bound thread
  `01a032d7-69c1-7320-a35e-0ca800086f05`. Review 1 returned one cited
  containment finding, repair 1 produced revision
  `124cf35e2940acd271a425c1d775e9da01725d1c`, and a fresh review 2 thread
  accepted it after all project checks and renders passed.
