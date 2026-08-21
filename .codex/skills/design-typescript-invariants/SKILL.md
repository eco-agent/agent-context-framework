---
name: design-typescript-invariants
description: Design TypeScript types that exclude invalid domain states at runtime and persistence boundaries.
---

# Design valid TypeScript states

Start with the states the program permits. Then write the execution path against
those types. Do not accept every plausible value and rebuild the rules with
conditionals later.

## Learn the repository's type conventions

Read the compiler and lint settings, glossary, nearby domain types, validators,
error conventions, persistence code, transport adapters, and tests that describe
the behavior. Follow the existing approach unless it is the reason an invalid
state remains possible.

Resolve overloaded domain terms before creating another type for them. If the
request, glossary, and code disagree, report the conflict.

When an authoritative schema already defines a shape, use the repository's
generator or TypeScript derivation utilities instead of copying the fields into
another interface. Create a separate domain type only when it makes different
guarantees, and keep the conversion at the boundary where those guarantees
change.

For a substantial state-model change, update the existing architecture record.
If no record owns the decision, copy [type-contract.md](assets/type-contract.md)
to `.codex/work/types/<task-slug>.md` and record the valid states, input checks,
conversions, and behavior that must remain unchanged.

## Keep related behavior together

Preserve existing null, undefined, error, ordering, and side-effect behavior
unless the task changes it deliberately.

File length alone is not a reason to split a module. Keep workflow, validation,
persistence, access rules, and audit behavior together when they form one
contract. Extract a module when it has its own inputs, failures, side effects,
and useful test seam. Common examples are an API adapter, platform bridge, cache,
access check, view-model conversion, or telemetry writer.

Read [deep-modules.md](references/deep-modules.md) before adding or extracting a
module. Define what the new module receives, returns, changes, and reports when
it fails. Record its ordering requirements, authority boundary, and visible
effect on users. Verify discovery rules and callers before moving routes,
generated code, public backend functions, auth code, native bridges, or secrets.

## Model the state before the behavior

1. Name distinct domain concepts.
2. List valid states and transitions.
3. Identify which fields exist in each state.
4. Mark every place untrusted data enters.
5. Separate transport, stored, draft, loaded, and domain types only when their
   guarantees differ.
6. Choose the smallest type structure that makes invalid combinations
   unavailable.
7. Write representative valid and invalid examples or type tests.
8. Implement the runtime behavior against the model.

Use a discriminated union when one field controls which other fields exist or
what they mean. Use separate types when lifecycle stages make different
guarantees. Make a property optional only when its absence is valid in that
specific state.

Strengthen a type where the looser type would make an operation partial. A
function that needs a first item may require a non-empty collection, while a
function with a valid empty result should keep the ordinary collection type.
Extra precision that prevents no invalid operation adds conversion work without
adding safety.

Read [modeling-procedure.md](references/modeling-procedure.md) when changing a
domain state model.

## Validate data where it enters

Check network input, URL parameters, user-controlled files, environment values,
weakly constrained database rows, and third-party data at their entry point.
Parse them once into a trusted type. Code inside that check should accept the
trusted type without repeatedly testing required fields.

Convert transport and stored shapes explicitly. A cast is not a conversion.
Keep the conversion beside the input check.

Read [boundaries-and-failures.md](references/boundaries-and-failures.md) before
adding validation, adapters, or error handling.

## Limit type escape hatches

Add `Partial<T>`, a type assertion, a non-null assertion, or
`Record<string, unknown>` only when all four conditions hold:

1. The uncertainty cannot be represented more precisely at that location.
2. The escape hatch is narrower than the surrounding domain.
3. A boundary check or another local proof makes the operation safe.
4. A short comment names the lost guarantee and explains why TypeScript cannot
   express it there.

Generated code and third-party declarations are exempt. Handwritten code is not
exempt merely because generated code uses assertions.

Keep explicit `any` out of handwritten code. When third-party interop makes it
unavoidable, use the narrowest lint exception and a `type-invariant:` comment
that names the external limitation. Use `unknown` for untrusted input and narrow
it once before trusted application logic.

## Preserve the repository's failure behavior

Use typed variants for expected outcomes that callers must handle. Throw for
broken invariants, unavailable infrastructure, programmer errors, or the
repository's established exception cases. Preserve useful error details when
translating between layers.

Do not catch and rethrow without adding recovery, cleanup, useful context, or a
real change in meaning. Do not introduce a custom result type when the repository
already has a clear convention.

## Revisit the model as requirements change

A new flag, optional state field, compatibility path, duplicate validator, or
runtime branch for an impossible case is a sign to list the valid states again.
Update the types first, then remove branches the new model makes unnecessary.

For each new conditional, ask whether it handles external uncertainty, an
expected outcome, or a state the input type should forbid. Redesign the input
type when the branch handles the last case.

Run the repository-declared invariant check when one exists. Otherwise run the
narrow typecheck and lint commands, then perform the semantic review in
[review-checklist.md](references/review-checklist.md). Do not invent a framework
command, comparison base, or environment value.

Treat `type-invariant:` comments as proof claims, not suppression labels. Read
[lint-rules.md](references/lint-rules.md) when the repository has an invariant
check. Run the focused tests declared by repository policy and review public
call sites as well as the changed implementation.
