# Progressive contextualization

Use this reference when design and implementation span stages or when current code
is anchoring decisions that should remain representation-independent.

## Vary attention and granularity independently

Attention scope controls what information is visible. Reasoning granularity controls
the size of the operation. Do not operate at product, screen, interaction, component,
layout, CSS, and line resolution simultaneously.

Examples:

- Narrow context, coarse operation: establish a product or visual thesis from intent,
  user tasks, representative states, and selected references.
- Narrow context, fine operation: repair one component using its real containers and
  responsive doctrine.
- Broader context, coarse operation: evaluate navigation, continuity, and hierarchy
  across a completed flow.

The controller unit is not a model alone. It is the model, subject of attention,
context packet, reasoning granularity, authority, and stopping condition.

## Minimize context subject to sufficiency

Do not retrieve everything relevant. Start with the smallest plausible packet from
which the current decision can be made well. Expand it only when evaluation identifies
a missing evidence class.

A stage packet should declare:

```text
subject
decision
granularity
allowed context sources
explicit exclusions
input artifact
required output artifact
authority
stopping condition
```

Design workers should not receive current component trees, CSS, framework choices,
or schema labels unless the active decision requires them. Reconciliation workers
may receive the approved target and current implementation after the design boundary.

## Use artifacts as lossy interfaces

Exploration may consider many ideas and encounter irrelevant implementation facts.
Its approved output should contain only the selected thesis, evidence, behavior,
states, and unresolved feasibility questions. Do not pass discarded concepts or the
whole conversation downstream by default.

If implementation reveals a real constraint, return that constraint and its evidence
to the owning design stage. Do not silently rewrite the approved thesis downstream.

## Separate control from empirical judgment

Hard isolation is a control property. It requires a fresh worker without inherited
conversation, exact context manifests, scoped repository/retrieval/tool authority,
and an exposure audit. A fresh conversation with unrestricted repository access is
not isolated. Skill instructions alone cannot provide this guarantee.

Minimum sufficient context is an empirical target, not a mechanically provable
global property:

```text
start with the smallest plausible packet
-> perform the stage
-> evaluate stage-specific outcomes
-> attribute failure to missing evidence
-> add only that evidence class
-> repeat
-> ablate inputs that appear unnecessary
```

The operational target is the smallest packet that passes representative and
adversarial evaluations with acceptable stability. When no enforcing controller or
evaluation harness exists, record contextualization as best-effort and do not claim
hard isolation or minimality.
