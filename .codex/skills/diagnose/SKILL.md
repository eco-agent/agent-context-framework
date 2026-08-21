---
name: diagnose
description: Diagnose bugs and regressions with uncertain causes by reproducing, minimizing, instrumenting, and fixing them when targeted inspection cannot establish the cause.
---

# Diagnose uncertain bugs

Use this skill when a reported failure has more than one plausible cause and
reading the nearby code cannot settle which one is responsible. A diagnosis
request authorizes investigation. Apply a fix only when the user also asks for
one.

Read the repository glossary and relevant architecture records before tracing a
cross-module failure.

## Decide whether the full loop is needed

Use the full loop for wrong output, exceptions, hangs, flakes, slowdowns, and
regressions with an uncertain cause.

A source audit may expose a specific risk without a live failure. In that case,
build the smallest proof you can and label the result as suspected. Stop after
establishing the risk unless the user requested a fix.

Ordinary implementation and refactoring do not need this workflow. Neither does
a local mismatch whose cause is already clear from the code.

Skip a phase only when you record why it cannot improve the diagnosis.

## Build a repeatable check

Start with a command that makes the failure visible. A useful check is fast
enough to run repeatedly and specific enough to distinguish the reported bug
from nearby failures.

Use the narrowest method that reaches the real behavior:

1. A focused unit or integration test.
2. A CLI or HTTP request with fixed input and an expected result.
3. A browser script that checks the relevant DOM, console, or network state.
4. A captured request, trace, event, or data fixture replayed through the code.
5. A small program that starts only the service or module involved.
6. A seeded property test or stress loop for intermittent failures.
7. `git bisect run` when two revisions bound the regression.
8. A comparison between the working and failing version or configuration.

If a person must perform an action, give them a short script and record the
result. Do not treat an informal description of what they saw as a repeatable
check.

Improve a weak check before debugging against it. Narrow the assertion, remove
unrelated setup, pin time and randomness, and isolate filesystem or network
state where the bug permits it. For intermittent failures, measure the failure
rate and raise it enough to compare probes.

When no usable check can be built, report what you tried and what is missing.
Ask for the specific environment access, trace, log, dump, recording, or
permission needed to continue. Do not guess at a cause without a signal that can
test the guess.

Describe the strongest result the check provides:

- `source-backed` means code and tests prove a mismatch without running the
  affected system.
- `unit repro` runs one module or function.
- `integration repro` crosses local module or service boundaries.
- `e2e repro` drives the real browser, desktop, CLI, or HTTP path.
- `live repro` observes the failure in the deployed or user environment.

## Reproduce the reported failure

Run the check more than once. Confirm that it produces the symptom the user
described, not merely an adjacent error. Record the exact output, exception,
timing, or state that the eventual fix must change.

Do not proceed to cause testing until the reported failure is reproduced. If a
source audit can prove only a risk, keep the result labelled as suspected.

## Test competing causes

List three to five plausible causes when the failure is still ambiguous. Rank
them using the code path and the reproduction result. For each cause, state a
prediction that a probe can disprove.

Share the ranking before testing it because the user may know which conditions
have already been ruled out. Continue with safe local probes without waiting for
a reply. Wait for permission before an expensive, destructive, or
production-facing probe.

A small source-backed mismatch does not need a formal hypothesis list. Cross-
service failures, live incidents, flakes, and expensive probes do.

## Instrument one distinction at a time

Choose each probe to separate named causes. Prefer a debugger or direct state
inspection when available. Otherwise add a small log at the handoff where the
predictions differ.

Give temporary logs one unique marker such as `[DEBUG-a4f2]`. Search for that
marker during cleanup. Avoid broad logging that creates more output without
distinguishing causes.

For performance regressions, measure a baseline before changing the code. Use a
profiler, query plan, timing program, or bisection rather than adding general
logs.

When the path crosses a browser, native bridge, HTTP service, database, auth
layer, or external system, check both sides of each handoff. Compare the caller's
request with the callee's route, validation, configuration, response, and visible
result. The first place the symptom appears may not contain the cause.

## Fix the proved cause

If a fix is authorized and the repository has a test seam that reproduces the
real failure, turn the reduced reproduction into a failing test before changing
the implementation. Watch it fail, apply the fix, watch it pass, then rerun the
original check.

Do not add a shallow test that cannot exercise the failure. Report the missing
test seam instead. That is a useful architecture finding, but it is not regression
coverage.

## Clean up and report

Before finishing:

- Rerun the original check and record its result.
- Run the focused regression test when one was possible.
- Remove every temporary log and debug marker.
- Delete throwaway programs unless the repository should retain one as a test.
- Stop processes started during diagnosis, or report any process that remains.
- State which cause was proved and which observation ruled out its alternatives.
- State the proved cause in the checkpoint commit or pull request message.

Recommend follow-up architecture work only when the diagnosis exposed a missing
test seam, hidden coupling, or another concrete condition that could reproduce
the bug. Name the evidence, the boundary that should change, and the verification
seam the follow-up should create.
