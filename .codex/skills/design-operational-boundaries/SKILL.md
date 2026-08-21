---
name: design-operational-boundaries
description: Define failure, recovery, and reporting behavior when changing a network, persistence, process, queue, background-work, or service boundary.
---

# Design operational behavior

Settle what the system does when the boundary fails before treating the success
path as complete. Follow the repository's established error, cancellation,
retry, cleanup, and reporting conventions unless the task changes them.

## Find the existing owners

Read the boundary implementation, its callers, error types, timeouts,
cancellation signals, retry policy, persistence semantics, logger or telemetry
adapter, redaction rules, and focused tests. Absence is a fact to report. It is
not permission to introduce infrastructure.

Name the operation and record:

- expected outcomes callers must handle;
- exceptional failures that propagate;
- timeout and cancellation behavior;
- retry eligibility, stopping condition, and required idempotency;
- cleanup or partial state left after interruption;
- the one layer that reports the final outcome;
- what the user or operator can observe.

Use only the entries that apply to this boundary. Do not invent retries,
timeouts, cancellation, or operator signals for a mechanism that does not have
them.

## Keep failure ownership singular

A catch block must recover, clean up, translate the error contract, attach
useful context while preserving the cause, or report at the boundary that owns
reporting. Otherwise, let the failure propagate.

Report one failure once. Intermediate layers may add typed context, but they
should not each emit the same error. Preserve the original error identity or
cause when translating it.

Do not retry unless the operation is safe to repeat or has a repository-owned
idempotency mechanism. Bound retries with the existing policy. When no policy
exists, report the unsupported retry path instead of choosing a number from
habit.

## Make reporting useful and safe

Use the repository's structured logger, trace, metric, or event contract. Keep
field names consistent with nearby code. A request or job lifecycle event often
benefits from:

- operation and outcome;
- duration and status;
- correlation or trace identity;
- service, version, and deployment identity already supplied by the runtime;
- stable error type or code with the preserved cause;
- retry count or terminal reason when retries exist.

Include personal, customer, financial, or business context only when repository
policy classifies the field as permitted for that destination. Never emit
secrets, credentials, authorization headers, session material, or unchecked
payloads. Respect declared event-size, cardinality, sampling, and retention
limits.

A context-rich completion event can replace scattered progress messages for a
request or job when the existing backend supports that pattern. It does not
replace diagnostics needed before process termination, nor does it require one
logger instance, one event shape, or a fixed set of log levels across every
runtime.

## Use the grace path when observation is missing

If the project has no logger or telemetry backend, preserve error context and
report the missing observer. Do not add an observability dependency, deployment,
collector, or account merely because this skill was selected.

If a focused failure path cannot run in the available environment, report the
exact behavior that remains unverified and the check or environment that would
observe it. Do not describe compilation or a success-path test as failure-path
evidence.

## Finish with evidence

Run the repository-declared focused checks for the boundary. Exercise applicable
failure, timeout, cancellation, retry, cleanup, and reporting behavior. Confirm
that the reporting owner emits once and that disallowed data is absent.

Handoff the boundary contract, the reporting owner, the evidence observed, and
each unverified behavior with its allowed next action.
