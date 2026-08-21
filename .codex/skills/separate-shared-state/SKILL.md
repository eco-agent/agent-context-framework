---
name: separate-shared-state
description: Separate or control mutable state when concurrent actors may write the same file, key, record, branch, or in-memory object.
---

# Separate shared state

Find the shared write target before choosing a lock. Concurrent actors may be
processes, requests, jobs, agents, threads, callbacks, or machines.

## Draw the ownership map

For each actor, name what it reads, what it writes, and which operation publishes
the result. Distinguish independent facts from one canonical object.

When actors publish independent facts, give each actor its own file, key, record,
branch, or state object. Combine those facts at a read or publication boundary.
Several actors updating separate fields in one object still share a mutable
target.

Carry the separation through readers, cleanup, retries, recovery, and tests. A
new path is not separate if another path continues writing the old target.

## Serialize only a real shared invariant

Keep one shared target only when the product or storage contract requires one
canonical value. Use the repository's existing transaction, single-writer
actor, compare-and-swap, lock, atomic replacement, or sequential phase. Match
the mechanism to every writer, including retries and recovery jobs.

Instructions and naming conventions are not concurrency control. A check-then-
write sequence is not atomic merely because each individual operation succeeds.

Define lock or transaction scope, acquisition order, failure behavior, stale
owner recovery, and what readers can observe during an update. Do not invent a
locking service or distributed coordinator when the task does not authorize
that infrastructure.

## Prove the ownership boundary

Prefer a focused concurrency check that makes competing writers overlap and
asserts the stored result. Where runtime concurrency cannot be exercised, show
the ownership map and the repository mechanism that makes the write atomic or
single-owner.

If neither separation nor an existing serialization mechanism is available,
report the exact shared target and behavior that remains unsafe. Preserve
recoverable state and request the missing architecture or authority instead of
silently relying on actor cooperation.

Finish by naming the actors, write targets, chosen owner, observation, and every
unverified concurrent path.
