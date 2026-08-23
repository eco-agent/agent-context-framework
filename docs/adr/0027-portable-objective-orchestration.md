# ADR-0027 — Portable objective orchestration

**Status:** Accepted

**Date:** 2026-08-02

**Decision owner:** Platform owner

## Context

Agent Context Framework uses bounded Codex workflows to experiment with context control,
authority, evidence, repair, and completion. Unattended workflows and
concurrent agents now require accepted work to survive process loss, worker
loss, and machine changes. The framework must remain replicable outside this
repository and must not inherit Agent Context Framework product, database, queue, model,
or filesystem semantics.

The current workflow runtime owns static roles, bounded loop topology,
structured model output, prompt and repository-context budgets, and JSONL
evidence. It does not own a durable objective lifecycle, shared leases,
optimistic concurrency, child objectives, globally unique identity, or
cross-process recovery.

ADR-0011 makes Effect the application runtime but prohibits using in-memory
fibers and queues as durable state. ADR-0019 accepts PostgreSQL and pg-boss for
bounded data-plane orchestration but explicitly rejects a universal workflow
language. Objective orchestration is a separate developer-control plane and
must not reuse data-run product semantics.

## Decision

Create a portable objective kernel and storage conformance contract.

The kernel is pure TypeScript and has no dependency on Codex, Effect,
PostgreSQL, pg-boss, Git, object storage, or Agent Context Framework applications. It
owns:

- globally unique objective identity and human-readable keys;
- immutable objective envelopes;
- authority, acceptance gates, budgets, context references, parents, and
  dependencies;
- ready, leased, waiting, and terminal state variants;
- idempotent commands and optimistic versions;
- exclusive expiring leases;
- compact checkpoints and immutable artifact references;
- per-objective event sequence and terminal outcomes; and
- typed expected rejections and exceptional corruption boundaries.

Store implementations must pass one adapter-neutral conformance suite. The
first adapters are memory, local JSONL, and PostgreSQL. The first immutable
artifact adapter is a content-addressed local filesystem store. Its port is
provider-neutral.

PostgreSQL is Agent Context Framework's reference shared objective store. pg-boss is the
reference ready-work notification adapter. A notification is not durable
objective acceptance or claim authority. Workers always reconcile against and
lease through the objective store, so lost and duplicate messages are safe.

Effect owns the lifecycle of one local executor attempt. It does not own
durable objective state. Codex is the first agent-runtime adapter and is not a
kernel dependency.

## Local and global orchestration

`PlannedTask` remains an in-process local execution unit. Promote work to a
durable child `Objective` only when it needs independent recovery, placement,
authority, budget, writer lease, retry, or global observability.

The global scheduler owns ready-objective discovery, leases, heartbeats,
cross-objective concurrency, dependency readiness, worker placement,
stagnation detection, and terminalization. The local executor owns one leased
objective, one static validated plan, bounded roles and loops, repository and
environment interaction, checkpoints, and the terminal result.

The boundary is a validated execution envelope containing the objective,
lease, exact context references, remaining budgets, latest checkpoint, and
accepted dependency results. The executor returns typed commands. It cannot
mutate store records directly.

## Ordering and replication

Require monotonic ordering only within one objective. Do not require a global
total event order.

One authoritative writer lease exists per objective. Deployments may run
workers in any region, but each objective has one authoritative transition
stream. Read replicas and projections may lag. Commands use globally unique
IDs, expected versions, idempotent replay, and content-addressed evidence so
retries and failover do not duplicate transitions.

Active-active mutation of one objective is not supported. Global concurrency
uses separate objective identities and parent-child aggregation.

## Persistence and context

Persist decoded structured state:

- objective envelope and current state;
- decisions and authority;
- lease and budget consumption;
- latest compact checkpoint;
- accepted child results;
- exact repository and artifact references; and
- transition evidence and terminal reason.

Do not require raw conversations, hidden reasoning, repository file contents,
secrets, or full ledgers for resume. Large logs and evidence remain immutable
artifacts referenced by hash. A prompt is rendered only at invocation time and
remains subject to the objective prompt budget. Agent adapters also record
reported input and output token use against durable objective limits. A store
terminalizes the objective when a completed invocation crosses either limit.

## Failure and recovery

- Duplicate commands replay their original result only when the normalized
  command is identical.
- A changed command with a reused ID is a conflict.
- Version and lease conflicts are typed expected outcomes.
- Corrupt state, failed durable writes, and artifact verification failures are
  exceptional infrastructure failures.
- Expired leases return to ready state through authoritative reconciliation.
- Queue loss is repaired by scanning ready state.
- A store outage stops new mutations; workers do not continue unledgered
  repository writes beyond their last durable checkpoint.
- Terminal state is immutable except for exact command replay.

## Package ownership

| Concern | Owner |
| --- | --- |
| Pure identities, states, commands, transitions, and ports | `packages/objective-kernel` |
| Adapter-neutral store conformance | `packages/objective-test-fixtures` |
| Memory, JSONL, PostgreSQL, artifact, scheduler, and queue adapters | `tools/objective-runtime` |
| Generic plan validation, bounded loops, evidence ledger, and Codex turn transport | `packages/codex-workflow-runtime` |
| Objective-bound Codex adapter, durable continuation, and local attempt runner | `tools/codex-workflows` |
| Product and data-run orchestration | Existing owning applications; not this framework |

## Alternatives rejected

- Keep session history as durable state: stale, model-specific, and not
  transactionally enforceable.
- Commit all agent state to Git: reviewable but unsuitable for leases,
  concurrent writers, heartbeats, and high-volume evidence.
- Adopt PostgreSQL types as the protocol: fast for the first adapter but not
  portable.
- Use Effect Workflow as the protocol: couples the framework to one runtime and
  is not accepted by ADR-0011.
- Use Temporal immediately: adds an operated service and makes its workflow
  model the first contract before the portable state semantics are proven.
- Let agents create roles or objective graphs recursively: violates bounded
  authority and makes cost and completion non-deterministic.

## Acceptance evidence

Implementation is accepted only when:

1. memory, JSONL, and PostgreSQL pass the same store conformance suite;
2. concurrent workers cannot both lease one objective;
3. independent child objectives execute concurrently and unblock a parent;
4. an expired lease resumes from the last committed checkpoint;
5. exact command replay is idempotent and changed replay conflicts;
6. lost and duplicate ready signals reconcile without duplicate execution;
7. artifact publication detects content and identity conflicts;
8. the Codex adapter executes one restricted real objective without requiring
   the originating conversation; and
9. terminal evidence binds the accepted Git revision and contains no secrets
   or raw reasoning.

## Related decisions

- [ADR-0011 — Effect as the TypeScript application runtime](0011-effect-application-runtime.md)
- [ADR-0016 — Package ownership and dependency boundaries](0016-package-ownership-and-dependency-boundaries.md)
- [ADR-0019 — PostgreSQL-backed durable data orchestration](0019-postgresql-backed-durable-data-orchestration.md)
- [ADR-0024 — Dependency-first runtime adoption](0024-dependency-first-runtime-adoption.md)

## 2026-08-03 launcher integration

The pre-model launcher is a Agent Context Framework adapter to this decision. It does not
add a second durable task system.

- `Objective` remains the durable identity and lifecycle owner.
- `TaskEnvelopeV2` is an immutable projection of one leased attempt.
- Repository-owned `ImplementationContractV2` records direct replacements,
  required skill sources, and an optional pinned product precedent. Reusable
  precedents map pinned Git files to owned targets and retain the license. It is
  not durable objective state.
- Frontend launch fails before model execution unless its contract, applicable
  skills, external precedent evidence, and declared upstream source bodies are
  complete, readable, untruncated, and hash-fenced.
- Envelope bytes belong to the objective artifact store. A checkpoint retains
  only the artifact reference.
- The active-task binding and `.git/codex/task-envelopes` are disposable local
  projections.
- `CodexObjectiveRunner` verifies the artifact, attempt identity, source hashes,
  and execution directory before model execution.
- The scheduler remains the only owner of retries, lease recovery, budgets, and
  terminal transitions.
- Model session IDs remain opaque checkpoint resume tokens.

This adapter preserves the kernel boundary. Capability files, Git paths,
execution directories, local caches, and Codex types do not enter the portable
kernel. Neither do product precedents or implementation policy. The adapter
projects those repository-owned decisions into the attempt envelope, and the
artifact store preserves the exact bytes used.
