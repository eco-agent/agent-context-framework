# Modeling procedure

## Start from the state space

Write valid examples before the interface:

```ts
type Job =
  | { status: 'pending' }
  | { status: 'completed'; result: JobResult }
  | { status: 'failed'; error: JobError }
```

The discriminant is useful because `status` determines which data exists. A single object with `status: string`, `result?`, and `error?` permits contradictory and incomplete states.

Use a union when variants have different guarantees or behavior. Do not use a union merely to replace an enum if every variant has the same shape.

## Separate lifecycle representations

Avoid one universal type spanning construction, transport, persistence, validation, and UI.

Create distinct representations when they make different promises:

- `UserDraft`: fields may be absent during construction
- `CreateUserInput`: caller-supplied command
- `UserRecord`: persisted fields
- `User`: validated domain object
- `UserSummary`: intentionally reduced projection
- `LoadedUser`: relation/data availability is guaranteed

Do not duplicate types mechanically. If two layers have identical guarantees and change together, one type may be correct. The conversion boundary—not the number of interfaces—is the architectural point.

## Model absence precisely

Distinguish:

- not loaded
- not found
- loaded without an optional relationship
- partially constructed
- invalid external input
- explicitly cleared

Do not collapse these into optional properties plus optional chaining. Consider a state union, result union, nullable field, or separate draft only when it matches the domain meaning.

## Model transitions, not only snapshots

When only some transitions are legal, represent the command and source state explicitly. Keep mutation logic exhaustive over the current variant.

```ts
type SubmitOrderResult =
  | { ok: true; order: SubmittedOrder }
  | { ok: false; reason: 'empty' | 'already_submitted' }
```

Use exhaustive switches. Prefer a repository-standard `assertNever` only when compiler exhaustiveness is not otherwise evident.

## Use nominal distinctions selectively

Use branded/opaque IDs or bounded scalar types when structurally identical primitives are frequently confused across boundaries:

```ts
type WorkspaceId = Brand<string, 'WorkspaceId'>
type ProfileId = Brand<string, 'ProfileId'>
```

Do not brand every string. A brand must prevent a demonstrated category error and have a trustworthy constructor/parser.

## Design APIs from caller decisions

Avoid positional booleans and all-optional option bags:

```ts
createUser(data, true, false, true)
```

Prefer named commands or variants that expose meaningful modes:

```ts
type CreateUserCommand =
  | { mode: 'invite'; user: NewUser; sendEmail: boolean }
  | { mode: 'provision'; user: NewUser; source: ProvisioningSource }
```

Split functions when modes have unrelated prerequisites or effects.

## Preserve inference

Annotate public contracts, exported boundaries, recursive definitions, and locations where widening would lose meaning. Let clear local expressions infer their types.

Use `satisfies` to check a value without discarding useful literal inference. Use `as const` only to preserve intentional literal/readonly semantics, not as a reflex.

Generics must express a caller-visible relationship between types. Remove a generic when it only renames `unknown` or appears once without constraining anything.
