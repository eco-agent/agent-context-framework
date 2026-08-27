# Frontend stages

Use this reference to choose the unit of completion. The current task should own
one stage unless the user has approved a broader program. A stage is complete when
its decisions and evidence can be trusted by the next owner. It does not need to
reach a deployable user path.

## Choose the current stage

| Stage | Decisions owned here | Required output |
| --- | --- | --- |
| Visual thesis | Product character, visual precedent, accepted and rejected lessons | Durable visual evidence record and one approved thesis |
| Foundations | Type roles, color roles, spacing rhythm, density, elevation, material, themes, and motion principles | Named tokens or contracts plus rendered samples where values interact |
| Component contract | Component roles, variants, states, accessibility, content limits, and supported placements | Component lab contract with representative fixtures |
| Interaction recipe | Trigger, feedback, state transition, interruption, recovery, focus, keyboard behavior, motion, and reduced motion | Runnable study or settled behavior contract |
| Application shell | Navigation, persistent regions, route families, responsive topology, and shared product chrome | Approved shell specification and representative renders |
| Failure system | Failure scopes, degraded states, retry, cancellation, stale data, permission denial, and reporting | Failure-state contract and rendered examples for applicable scopes |
| Product assembly | Real task flow, data integration, reverse actions, and complete state ownership | One complete user path using approved earlier contracts |
| Rendered acceptance | Required fixtures, viewports, themes, assistive modes, comparisons, and human judgment | Immutable evidence set bound to a Git revision and human decision |

The names describe decision ownership, not a mandatory calendar. Combine stages
when one bounded task can complete them without hiding unresolved choices. Skip a
stage only when the project already has an approved owner or the stage does not
apply. Record which case applies.

## Write the stage contract

Record these fields before implementation or generation begins:

```text
stage
subject
input evidence
decisions owned here
decisions excluded until later
required output
authority
promotion gate
stopping condition
```

The promotion gate names what the next owner may trust. A foundation may promote
named roles and rendered samples. It must not claim that a full task flow works.
A component contract may promote keyboard and state behavior. It must not choose
the application shell.

If later work discovers a false assumption, return the evidence to the stage that
owns the decision. Do not rewrite the earlier contract inside assembly code.

## Apply the general slice rule correctly

Ordinary implementation should still complete a cross-layer slice. In a staged
frontend program, the approved stage is the complete slice until product assembly
begins. Do not add placeholder routes, fake APIs, premature shells, or arbitrary
product copy merely to make foundations or a component lab look cross-layer.

Once the work reaches product assembly, complete one real path through its entry,
action, state transition, result, applicable states, and reverse actions.
