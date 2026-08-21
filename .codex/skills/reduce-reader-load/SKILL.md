---
name: reduce-reader-load
description: Reduce unnecessary indirection and hidden mutable state during a refactor or when changing code whose origin and mutation paths are hard to trace.
---

# Reduce reader load

Make the changed behavior easier to trace without replacing useful boundaries or
turning a focused task into a broad cleanup.

## Trace the questions the change creates

For each important value or effect, find where it originates, who may change it,
and where its invariant is established. Follow the real caller and state paths.
Do not judge a layer by its name or file count.

Record the shortest current path from the public entry point to the owning
decision. Name mutable state that a reader must remember while following that
path.

## Remove indirection that hides no decision

Collapse a wrapper, adapter, interface, or forwarding module when it repeats the
same inputs and outputs and owns no distinct guarantee. One caller or one
implementation is evidence to inspect, not an automatic deletion rule.

Retain a boundary when it owns validation, authorization, persistence,
platform-specific behavior, side effects, failure translation, a stable public
contract, or a demonstrated second implementation. Name that ownership in the
code structure rather than preserving a vague future extension point.

Keep adjacent layers only when each changes the abstraction or hides a decision
the caller no longer needs to understand.

## Shrink state scope

Prefer values returned from a function over mutation observed elsewhere. Move
state toward the narrowest owner that serves every real reader. Derive a value
from one source when the alternative requires synchronized copies.

Do not move state merely to reduce a metric. Preserve lifecycle, performance,
framework, and persistence requirements established by the repository.

## Show the result

Compare the before-and-after call path and state owner. Explain each removed or
retained layer by the decision it owns. Use focused behavior checks to show that
the simplification preserved required behavior.

If the task cannot remove the indirection without changing a public contract or
crossing its authority, leave the boundary intact and report the remaining trace
cost. Do not conceal an unsupported cleanup behind a compatibility wrapper.
