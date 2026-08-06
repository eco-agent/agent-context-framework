# Type-invariant lint rules

## Repository-wide rules

Inspect the repository's actual TypeScript and lint configuration. Useful low-noise rules commonly reject:

- explicit `any`
- unnecessary type assertions
- non-exhaustive switches
- redundant catch and rethrow blocks

Do not claim these rules are active until the repository configuration proves it.

## Changed-line gates

Some repositories add a wrapper that reports heuristic findings only on added lines. When such a gate is declared, inspect its command, comparison base, untracked-file behavior, exclusions, and supported overrides before running it.

Useful heuristic checks include:

- broad `Partial<T>` domain models
- open-ended `Record<string, unknown | any>` away from parsing boundaries
- object types whose fields are all optional
- positional boolean arguments
- assertions or non-null assertions without a proof comment

Do not invent a changed-line gate or assume the framework's implementation is installed.

## Resolve findings

Prefer, in order:

1. make the input type exclude the invalid state
2. narrow or parse at the trust boundary
3. create an exact representation or named variant
4. prove the assertion with the repository's established justification convention

Do not add a proof comment merely to silence a gate. A proof must name the validation, control-flow fact, or external typing limitation that establishes safety.

## What lint cannot prove

Continue semantic review for:

- whether the enumerated domain states are complete
- whether an optional field is genuinely optional
- whether two representations have meaningfully different guarantees
- whether an expected failure should be a typed outcome
- whether a new requirement should reshape the model
- whether a runtime branch exists only because the model is weak
