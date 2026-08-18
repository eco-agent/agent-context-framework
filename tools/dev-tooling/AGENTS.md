# Developer tooling

## Scope

These instructions apply to `tools/dev-tooling`.

## Constraints

- Keep commands deterministic and repository-owned. Do not call an AI model.
- Keep registry facts separate from reviewed dependency-adoption decisions.
- Prefer Node built-ins and existing repository/runtime tools over new
  dependencies.
- Keep preflight output compact and derived from current repository state.

## Verification

- Run `pnpm --filter @agent-context/dev-tooling test`.
- Run `pnpm --filter @agent-context/dev-tooling typecheck`.
- Exercise the command changed. Run `task:doctor` only for task diagnostics.
