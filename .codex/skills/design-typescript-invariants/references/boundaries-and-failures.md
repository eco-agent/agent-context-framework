# Boundaries and failures

## Parse, then trust

At an external boundary:

1. accept the framework's untrusted representation
2. validate structure and domain constraints
3. normalize once
4. construct the trusted domain type
5. pass only that trusted type inward

Use the repository's existing schema/validator system. Avoid parallel handwritten `isValidX`, `validateX`, and `normalizeX` layers unless they express genuinely separate steps.

Runtime validation is required because TypeScript disappears at runtime. Its purpose is to end uncertainty, not distribute uncertainty through every function.

## Convert representations explicitly

Adapters should make guarantee changes visible:

```ts
function toDomain(record: UserRecord): User
function toRecord(user: User): UserRecord
```

Conversion may parse dates, establish branded identifiers, reject legacy rows, or map nullable storage fields into domain variants.

Do not solve mismatch with:

```ts
record as User
```

An assertion transfers proof responsibility to the programmer without performing proof.

## Distinguish outcomes from exceptions

Use a typed outcome when absence, denial, conflict, or rejection is a normal result a caller must handle:

```ts
type FindUserResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_found' | 'unauthorized' }
```

Use exceptions for invariant corruption, dependency failure, impossible program states, or the established outer framework boundary.

Do not force typed results through every infrastructure API. Translate at a deliberate boundary:

- domain result to HTTP/Convex response
- database exception to repository error
- schema failure to input-validation outcome

## Catch only with a job to do

A catch block must:

- recover
- clean up
- attach meaningful context while preserving the cause
- translate to a different layer's error contract
- report at the one observability boundary that owns reporting

Otherwise, let the error propagate. Avoid logging and rethrowing the same error at multiple layers.

## Keep orchestration typed

An orchestration function may coordinate steps, but its intermediate values should become more trusted and specific as execution proceeds.

Stop when orchestration accumulates mode booleans, optional context, broad catches, or helpers that only relocate lines. Reconsider commands, state variants, and responsibility boundaries instead of extending the procedure.
