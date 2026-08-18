# Type-invariant lint rules

## Repository-wide errors

The application ESLint config loads `apps/web/eslint/type-invariants/eslint-plugin.mjs` and enforces:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unnecessary-type-assertion`
- `@typescript-eslint/switch-exhaustiveness-check`
- `type-invariants/no-redundant-catch`

These rules have low false-positive risk and run through the normal repository lint command.

## Changed-line gate

Run:

```powershell
node apps/web/eslint/type-invariants/lint-changed-invariants.mjs apps/web
```

The wrapper:

1. reads added ranges from `git diff <base>`
2. treats untracked files as entirely new
3. runs ESLint with the invariant rules enabled
4. reports only findings whose source line was added

Use `--base origin/main` or `TYPE_INVARIANT_BASE=origin/main` when `HEAD` is not the intended comparison.

The additional rules are:

- `no-partial-domain-model`: replace broad `Partial<T>` with an exact draft/patch type.
- `no-open-ended-record`: keep `Record<string, unknown|any>` at explicit parsing boundaries.
- `no-optional-property-bag`: reconsider object types with at least three fields that are all optional.
- `no-positional-boolean-arguments`: name modes instead of passing opaque boolean literals.
- `require-escape-justification`: require a nearby `type-invariant:` proof for assertions and non-null assertions; `as const` is exempt.

## Resolve findings

Prefer, in order:

1. make the input type exclude the invalid state
2. narrow or parse at the trust boundary
3. create an exact representation or named variant
4. prove the assertion with a concise `type-invariant:` comment

Do not add a proof comment merely to silence the gate. A proof must name the validation, control-flow fact, or external typing limitation that establishes safety.

## What lint cannot prove

Continue semantic review for:

- whether the enumerated domain states are complete
- whether an optional field is genuinely optional
- whether two representations have meaningfully different guarantees
- whether an expected failure should be a typed outcome
- whether a new requirement should reshape the model
- whether a runtime branch exists only because the model is weak
