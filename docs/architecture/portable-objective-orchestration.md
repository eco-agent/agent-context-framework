# Portable objective orchestration

## Purpose

The objective framework coordinates unattended and concurrent work without
making Codex, Effect, PostgreSQL, pg-boss, Git, or a work directory part of the
portable protocol. Agent Context Framework is the reference integration.

## Boundary

The durable global unit is an `Objective`. A local `PlannedTask` stays inside
one attempt unless it needs its own recovery, authority, budget, placement,
lease, retry, or observability. In that case, the coordinator creates a child
objective.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Objective kernel | Identity, states, commands, versions, authority, budgets, leases, checkpoints, evidence references | Clocks, storage, queues, agents, repositories |
| Objective store | Atomic commands, idempotency, current state, events, ready queries | Agent execution and prompt construction |
| Global scheduler | Discovery, reconciliation, leases, heartbeats, bounded concurrency, terminal commands | Domain work and hidden agent state |
| Local attempt runner | One leased objective, local plan, environment access, structured outcome | Durable state transitions outside the store port |
| Agent adapter | Prompt construction, structured decoding, runtime-specific resume token | Objective identity and persistence semantics |

The scheduler can host Promise-based runners, Effect programs through
`EffectObjectiveRunner`, or Codex through `CodexObjectiveRunner`.

## Persistence

| Adapter | Intended use | Concurrency | Durability |
| --- | --- | --- | --- |
| `MemoryObjectiveStore` | Deterministic tests | Concurrent callers in one process | None after process exit |
| `JsonlObjectiveStore` | Local unattended work | One open process per journal | Fsynced accepted-command journal with deterministic replay and interrupted-tail recovery |
| `PostgresObjectiveStore` | Shared workers and machines | Row-locked writers per objective; separate objectives advance concurrently | PostgreSQL transactions, indexed ready state, command receipts, and events |

All stores implement `ObjectiveCommandStore` and pass the same conformance
suite. A command has a UUID, expected objective version, and authenticated
actor supplied by the host. Exact replay returns the original event. Reuse of
the command UUID with changed canonical content is a conflict.

The filesystem artifact adapter stores immutable bytes by SHA-256. Objective
state stores only the hash, media type, byte count, label, and compact evidence
summary. Reads verify the content hash. Conflicting metadata for the same
content identity is an error.

## Work directories

The framework does not select, create, persist, or clean a work directory. A
runtime adapter receives the directory as execution configuration. The
objective stores exact Git, artifact, or external context references. This
keeps these valid policies outside the kernel:

- one worktree per objective;
- one worktree per worker with serialized assignment;
- an ephemeral checkout restored from a Git revision and artifact checkpoint;
- a read-only repository for inspection objectives; or
- a remote execution environment referenced by a provider key.

A work directory is disposable execution state unless a deployment chooses a
different policy. Durable resume depends on the objective envelope, exact
context references, compact checkpoint, artifacts, and runtime resume token.
It does not depend on the originating chat.

## Agent work persistence

Persist:

- the immutable objective definition and parent or dependency identities;
- authority, acceptance gates, and consumed budgets;
- the latest compact checkpoint and opaque runtime resume token;
- content-addressed artifact references;
- command receipts and per-objective events; and
- typed terminal evidence and reason.

Do not persist secrets, hidden reasoning, repository file contents, raw chat
history, or unrestricted model output. The Codex adapter projects decoded
output to compact ledger state. Its default projection records only successful
decoding. Prompt, context, and ledger-state byte limits are checked before
state is retained. Agent-reported input and output tokens are metered after
each invocation and can terminalize the objective before another attempt.

## PostgreSQL and pg-boss

`PostgresObjectiveStore` uses the `objective_runtime` schema and a portable
`storeName` namespace. It takes an advisory transaction lock for one command
identity and a row lock for one objective. It does not impose a global event
order.

pg-boss jobs contain only objective identity and version. Their stable job ID
deduplicates repeated readiness hints. Workers still query and lease through
the objective store. Periodic reconciliation scans ready state, expired
leases, and satisfied waits, so a lost job cannot strand accepted work.

## Codex integration

`CodexObjectiveRunner` builds a bounded `WorkflowObjective` from a leased
objective. Before the model starts, the Agent Context Framework launcher projects the
leased objective, attempt identity, capability authority, remaining budget,
latest compact checkpoint, task contract, strict implementation contract,
applicable implementation skills, and pinned product evidence into a
`TaskEnvelopeV2`. Typed source roles distinguish those mandatory inputs from
supplemental repository context. A reuse contract also contributes every
declared upstream source file as a complete `product_precedent_source`; prose
about a source file is not a substitute for its bytes. Mandatory sources must
fit the objective's remaining measured context and prompt capacity without
truncation. Supplemental references are admitted only while the serialized
envelope fits, so they cannot displace the contract, skills, evidence, or source
code. The launcher writes the serialized envelope to the configured
`ObjectiveArtifactStore`, reads it back, verifies its content and source hashes,
and commits only the artifact reference through the supplied checkpoint
function.

`ImplementationContractV2` belongs to the repository policy adapter, not the
objective kernel. It records exact owners to remove or rewrite, applicable skill
paths, and either a pinned external product precedent or `null`. A frontend
contract requires at least one implementation skill plus a product, immutable
Git revision, license, local evidence file, adopted behaviors, and deviations
owned by objective acceptance gates. Its implementation state is a
discriminated union. `reuse` maps named source paths to writable targets as
`copy` or `adapt` and names the retained license notice. `observe` requires a
reuse prohibition and an acceptance gate; permissive licenses such as MIT
cannot select it. No compatibility, migration, fallback, deprecation, or
dual-state selector exists in the contract.

The materializer reads license and source bytes from the declared Git object,
not the checkout's current `HEAD`. It writes those exact bytes to every target
before the worker runs and records their SHA-256 hashes and byte counts in
`ProductPrecedentMaterializationV2`. Scope verification requires copied targets
to retain the pinned hash. Adapted targets retain the receipt as provenance and
must appear in the branch change set.

`CodexObjectiveRunner` accepts the verified envelope, its artifact reference,
and an explicit execution directory. It rejects a mismatched objective, lease,
run, worker, attempt, role directory, source hash, or missing artifact before it
starts a thread. The complete envelope is initial model context and remains
inside the objective prompt and context budgets.

The runner records the Codex thread ID as an opaque checkpoint resume token.
A new process can construct a new client and resume that thread for the same
objective. The adapter records input bytes, rendered-prompt bytes, reported
input tokens, and reported output plus reasoning tokens in the durable budget.
Rendered bytes bound framework prompt assembly. Reported tokens account for
runtime context that the adapter cannot observe before the turn.

The working directory, sandbox, approval, network, model, role, delegation,
and output schema remain adapter configuration. They are not kernel fields.

The active-task file and `.git/codex/task-envelopes` are local attempt
projections. The active binding includes the objective, lease, run, worker,
attempt, execution directory, source hashes, and envelope artifact reference.
The cache contains only artifact-store bytes. Either local projection can be
deleted or replaced after a crash. The objective store, checkpoint, and
artifact store are authoritative.

The restricted live demonstration is
`tools/codex-workflows/examples/durable-objective-demo.ts`. It requires an
existing Git repository with a committed `README.md` and these environment
variables:

```text
OBJECTIVE_DEMO_ID=<lowercase UUID>
OBJECTIVE_DEMO_REPOSITORY=<absolute repository path>
OBJECTIVE_DEMO_STATE=<absolute durable state path>
```

The default demo uses a read-only, no-network Codex thread and the same verified
`TaskEnvelopeV2` path as other `CodexObjectiveRunner` attempts. Direct byte
checks verify the returned line count and SHA-256 digest. With
`OBJECTIVE_DEMO_KIND=product_precedent` and `OBJECTIVE_DEMO_REQUEST=<path>`, it
instead loads a strict frontend capability, verifies the implementation
contract, and checks a source-backed adoption result. Terminal evidence records
the pinned revision, a content-addressed structured-result artifact, and the
envelope artifact. A cold restart reads the terminal objective and performs no
model turn. `OBJECTIVE_DEMO_KIND=product_topology_ui` verifies materialized
source targets and their retained license in a read-only worker. It does not ask
the model to generate substitute HTML or CSS.

## Verification

Focused commands:

```text
pnpm --filter @agent-context/objective-kernel test
pnpm --filter @agent-context/objective-runtime test
OBJECTIVE_POSTGRES_URL=<url> pnpm --filter @agent-context/objective-runtime test:postgres
pnpm --filter @agent-context/repo-policy test
pnpm --filter @agent-context/codex-workflows test
```

PostgreSQL tests start against an external test database. They run the same
store conformance suite and a real pg-boss duplicate and lost-signal proof.

## Portability gate

A new store is compatible only when it passes
`runObjectiveStoreConformance`. A new agent runtime is compatible when it
implements `ObjectiveAttemptRunner`, returns typed outcomes, respects the
abort signal, and commits progress only through the supplied checkpoint
function. Product-specific meaning stays in the objective purpose, metadata,
context references, repository policy adapter, and runner. It does not enter the
kernel. An adopting repository can replace its implementation doctrine or
product precedent directly without changing objective persistence semantics.
