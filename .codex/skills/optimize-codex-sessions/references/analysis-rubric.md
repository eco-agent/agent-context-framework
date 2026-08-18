# Session analysis rubric

Use this rubric to compare task quality and consumption without rewarding shallow completion.

## Outcome quality

Score each dimension with evidence, not an averaged number:

- **Scope fidelity**: delivered only authorized work and stopped at real authority gaps.
- **Correctness**: invariants, failure paths, and integration behavior match the objective.
- **Evidence quality**: checks exercise claimed behavior and distinguish happy paths from recovery paths.
- **Maintainability**: code reuses repository patterns and leaves clear ownership.
- **Residual honesty**: unverified behavior and limitations are stated accurately.

## Cost classification

### Necessary execution

Examples:

- frozen dependency installation in a new worktree;
- compiler or policy build required by repository bootstrap;
- one cold live-runtime lifecycle needed for acceptance;
- database or browser evidence that static checks cannot replace.

Optimization target: cache, reuse, or expose progress. Do not delete the proof.

### Quality investment

Examples:

- a focused review that finds a real durability defect;
- a regression test for a reproduced failure;
- inspecting a dependency's retained-source behavior instead of reimplementing it;
- stopping at a missing authorization boundary.

Optimization target: move the finding earlier or encode it mechanically.

### Avoidable churn

Examples:

- repeating repository discovery already available from a deterministic inventory;
- broad verification after a documentation-only change;
- retries caused by a known timeout being mistaken for process failure;
- creating an abstraction before checking an existing dependency;
- editing the same boundary repeatedly because its state model was not established;
- generating handoffs that only repeat Git history and test output.

Optimization target: eliminate an action, narrow a gate, or make the prerequisite fail before implementation.

## Git metric interpretation

`git-session-metrics.mjs` reports:

- **final changes**: additions and deletions visible at the final range;
- **cumulative changes**: additions and deletions across non-merge commits;
- **estimated rework**: cumulative minus final changes, floored at zero;
- **change amplification**: cumulative divided by final changes;
- **repeat-touched files**: files changed in more than one non-merge commit.

These are directional indicators. Renames, merge commits, binary files, formatting, and generated code can distort them. Inspect hotspots before calling them waste.

High repeat touches can indicate:

- healthy incremental tests and repairs;
- an unstable contract;
- premature implementation;
- generated-file refreshes;
- review-driven correction.

Use session evidence to distinguish them.

## Recommendation ranking

Rank by:

1. demonstrated defect or repeated cost;
2. frequency across tasks;
3. eliminated model/tool actions;
4. enforcement reliability;
5. maintenance cost and false-positive risk.

Good recommendation:

> Add a preflight check that validates deployment environment variables before the 3-minute runtime start. It removes one failed cold start per affected worktree and preserves the live acceptance test.

Weak recommendation:

> Add a longer planning template so the model thinks more carefully.

The second adds usage without executable enforcement or measured benefit.

## Comparison baseline

Record a small baseline for the next comparable task:

- completed objective and review defects;
- elapsed task duration when available;
- cold runtime lifecycle count;
- failed commands grouped by root cause;
- commits, final changes, amplification, and repeat-touched hotspots;
- full and focused verification runs;
- recommendations adopted.

Compare like with like. A database-backed trust boundary should not be benchmarked against a documentation edit.
