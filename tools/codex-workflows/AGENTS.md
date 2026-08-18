# Codex workflows

## Scope

These instructions apply to `tools/codex-workflows`.

## Commands

- Run `pnpm workflow:test` after workflow changes unless a broader completed profile already included the same tests.
- Run `pnpm verify:task` only when the task also changes files outside this package.

## Constraints

- Fix workflow topology, roles, authority, and budgets before execution.
- Do not create recursive agents, dynamic roles, or quorum loops.
- Treat model output as untrusted data and decode it before transitions.
- Never execute a shell command supplied only by model output.
- Default workers to no network and repository-scoped writes.
- Use a fresh read-only thread for independent review.
- The primary role owns the complete delegated outcome and ordinary reversible decisions.
- Verification must not expand product code, architecture, or task scope.
- Use direct execution, static checks, existing affected tests, and read-only review before adding verification code.
- Persist evidence before transitions.
- Stop on acceptance, budget exhaustion, authority breach, cycles, or stagnation.
- Mock Codex calls in default tests. Live workflow runs require explicit invocation.
- Do not inject the full ledger into worker prompts.

## References

- [Reuse-before-implementation skill](../../.codex/skills/reuse-before-implementation/SKILL.md)
- [Repository policy](../repo-policy/src/index.ts)
