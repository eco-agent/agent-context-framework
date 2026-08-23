# Choose a loop helper

Use one helper as the main workflow. Add another only when it handles a named
return path that the first helper cannot express. Every helper needs a finite
limit and must record its stage changes.

| Need | Runtime helper | Required limit |
| --- | --- | --- |
| Move one result through fixed stages | `runRelayChain` | stages and repairs |
| Send varied requests to fixed roles | `runMembraneRouting` | routes and confidence threshold |
| Alternate implementation and independent review | `runReviewerRepair` | review passes and repairs |
| Act on observed system changes | `runAutonomousEnvironment` | steps and unchanged observations |
| Move through a known scope tree | `runScopeReconciliation` | hops and cycle detection |
| Ask a broader role only after a local role fails | `runSubsidiarityEscalation` | ascents and cycle detection |
| Combine attributed partial results | `runSharedArtifactConvergence` | rounds and concurrency |
| Give different checks to different roles | `runAuthorityLadder` | stages and return targets |

## `runRelayChain`

Pass one result through fixed stages. A stage may accept it, request a repair
from the current or previous stage, or stop. Give each stage only the result and
facts it needs.

## `runMembraneRouting`

Let one fixed router choose from a fixed role registry using capability, scope,
and permission. Record failed routes. The router may not invent roles, change
models, or retry without a limit.

## `runReviewerRepair`

Let an implementer produce the result and a separate reviewer inspect it. Give
the reviewer repair permission only when the workflow says it may edit. Otherwise
return the findings to the implementer. Set `maxReviewPasses` and `maxRepairs`
separately. A zero repair budget permits inspection without any edit.

## `runAutonomousEnvironment`

Observe the system, choose an action, run it, and observe again. Measure the
relevant change. Stop when repeated actions leave that state unchanged, the role
lacks permission, or the step limit ends.

## `runScopeReconciliation`

Walk a scope tree declared before execution. Move to a parent or named sibling
through the nearest parent decision. Detect cycles. This helper does not discover
new levels or create roles.

## `runSubsidiarityEscalation`

Start with the narrowest role that should be able to solve the problem. If it
cannot, pass its attempted actions, returned facts, unfinished work, and missing
permission to a broader known role.

## `runSharedArtifactConvergence`

Assign missing parts of one stored result. Record who contributed each part,
combine them, and reopen work only for a specific missing dependency or
contradiction. This is bounded work distribution, not voting or repeated sampling
of the same claim.

## `runAuthorityLadder`

Assign progress, user-flow, code-quality, and release checks to roles with
different permissions. A later stage may return to a named earlier stage. It may
not perform that earlier role's decision itself.

Do not use these helpers to build recursive role discovery or majority voting.
If the work cannot fit a fixed plan without either behavior, ask for a different
plan.
