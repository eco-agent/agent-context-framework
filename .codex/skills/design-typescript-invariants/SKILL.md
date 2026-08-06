---
name: design-typescript-invariants
description: Model TypeScript invariants for domain contracts, state machines, schemas, adapters, persistence, errors, or code that permits impossible states.
---

# Design TypeScript Invariants

Shape valid states before writing the execution path. Ask: **What states are valid, where does uncertainty enter, and which invalid states can the compiler exclude?**

Do not begin by accepting every plausible value and reconstructing domain rules with conditionals.

## Establish repository grammar

Read the relevant:

- compiler options and lint rules
- repository glossary and architecture decisions
- neighboring domain types and public contracts
- validators/schemas at external boundaries
- error conventions
- persistence and transport adapters
- tests that express invariants

Follow a coherent existing pattern unless it permits the invalid state causing the task. Do not introduce brands, result types, classes, schema libraries, or generics ceremonially.

Resolve fuzzy or overloaded domain terms before encoding them. If the glossary, code, and request disagree, surface the conflict instead of creating another representation.

For a substantial model change, update an existing architecture record. If none exists, copy [type-contract.md](assets/type-contract.md) to `.codex/work/types/<task-slug>.md`. Persist the state space, boundaries, conversions, invariants, and decisions so later patches do not erode them.

## Preserve cohesion when restructuring

Preserve existing null, undefined, error, ordering, and side-effect behavior unless the task intentionally changes it. Encode preserved contracts in types when possible.

Do not split a file because it is long. Keep tightly coupled workflow, validation, persistence, authority, and audit rules together when extraction would force reviewers to reconstruct one contract across several files.

Extract a module when it owns a stable boundary with independent failure behavior and a useful test seam. Common boundaries include:

- remote API calls and response normalization
- native or platform bridges
- cache and persistence adapters
- eligibility, authority, and access policy
- domain-to-view-model conversion
- telemetry emission

Read [deep-modules.md](references/deep-modules.md) before adding or extracting a module boundary.

Define the extracted module's inputs, return shape, failure mode, side effects, ordering requirements, authority boundary, and user-visible effect. If that contract is vague, improve names and internal sections before splitting the file.

Before moving generated code, public backend functions, routes, native bridges, auth, or secret-bearing code, verify discovery rules, caller compatibility, regeneration ownership, and security boundaries.

Use comments for reasoning and contracts, not narration. Use named predicates, options objects, builders, early returns, and declarative transforms only when they expose an invariant or make an existing behavioral contract easier to follow.

## Model before implementing

1. Name the domain concepts and keep unrelated concepts distinct.
2. Enumerate valid states and transitions.
3. Identify which fields exist in each state.
4. Identify external trust boundaries.
5. Distinguish transport, persistence, domain, draft, summary, and loaded representations only where their guarantees differ.
6. Choose the smallest type structure that makes illegal combinations unavailable.
7. Write representative valid and invalid examples or type tests.
8. Implement runtime behavior against the model.

Prefer discriminated unions when one field controls the availability or meaning of other fields. Prefer separate types when lifecycle stages have different guarantees. Use optional properties only when absence is itself valid in that exact representation.

Read [modeling-procedure.md](references/modeling-procedure.md) when introducing or changing domain state.

## End uncertainty at boundaries

Validate untrusted input where it enters:

- network/request input
- URL/search parameters
- user-controlled files
- environment variables
- database rows with weaker guarantees
- deserialized or third-party data

Parse once into a trusted representation. Inside the validated boundary, accept the trusted type and stop repeatedly asking whether required fields exist.

Do not cast a transport or persistence shape into a domain type. Convert it explicitly. Keep conversion logic near the boundary.

Read [boundaries-and-failures.md](references/boundaries-and-failures.md) before adding validation, adapters, or error handling.

## Control escape hatches

Do not add `Partial<T>`, a type assertion, a non-null assertion, or `Record<string, unknown>` unless all are true:

1. the uncertainty cannot be modeled more precisely at that location
2. the escape hatch is narrower than the surrounding domain
3. a boundary check or proof makes the operation safe
4. a concise comment explains the lost invariant and why it is unavoidable

Exclude generated code and third-party declarations from this rule. Do not preserve handwritten ambiguity merely because generated code contains assertions.

Do not add explicit `any` to handwritten code. If third-party interop makes it unavoidable, use the narrowest ESLint disable and attach a `type-invariant:` proof explaining the external limitation.

Use `unknown` for genuinely untrusted input, then narrow it once. Do not carry `unknown` through trusted application logic.

## Run the automated invariant gate

Read the repository instructions and manifests for its TypeScript, lint, invariant, and test commands. Run the declared invariant gate when one exists; otherwise run the repository's narrow typecheck and lint commands and perform the semantic review below. Do not assume a framework-specific application path, ESLint plugin, comparison base, or environment variable.

A repository gate may enforce low-noise rules globally and added-line heuristics separately. Treat its configured scope and comparison base as authoritative.

Treat `type-invariant:` comments as proof obligations, not suppression labels. State the boundary check or compiler limitation that makes the escape safe.

Read [lint-rules.md](references/lint-rules.md) when interpreting or configuring a repository-owned gate.

## Choose failure semantics deliberately

- Represent expected domain outcomes as typed variants when callers must branch on them.
- Throw for invariant violations, unavailable infrastructure, programmer errors, or the repository's established exceptional boundary.
- Preserve original error identity and detail when translating layers.
- Do not add catch-and-rethrow blocks that provide no context, cleanup, recovery, or semantic translation.
- Do not turn every failure into a custom `Result` if the framework or repository already has a coherent convention.

## Reconsider the model when requirements change

Do not attach each new requirement to the visible procedure with another flag, optional field, or nested branch.

Pause when a change introduces:

- a boolean parameter
- a mode flag controlling other arguments
- another optional field on a state object
- a compatibility shim
- a second validator for the same concept
- a runtime branch for a supposedly impossible case

Re-enumerate the state space and update the types first. Then simplify the runtime path.

## Review from runtime branches back to types

For every new conditional or validation branch, ask:

> Does this branch handle external uncertainty, an expected outcome, or a state the input type should forbid?

If the type should forbid it, redesign the type and remove the branch.

Run the invariant gate, repository typecheck, and focused tests. Also review public call sites, not only the implementation. Use [review-checklist.md](references/review-checklist.md) only for semantic checks the linter cannot prove.
