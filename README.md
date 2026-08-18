# Agent Context Framework

This repository extracts the project-local agent context, policy, and durable
workflow system originally developed inside Control Tower. It deliberately
contains no Control Tower product applications, domain packages, product tests,
or product planning documents.

The intended distribution model is project-local and source-owned, similar to
shadcn: a project selects framework capabilities, materializes ordinary files
into its repository, records what was installed, and can review every change in
Git. Global Codex configuration is not required.

## Current layers

- `AGENTS.md` defines the reusable working and frontend baseline.
- `.codex/skills` contains selective workflows and their source material.
- `tools/repo-policy` enforces repository contracts and verification profiles.
- `tools/codex-workflows` provides bounded repository context, task envelopes,
  structured Codex adapters, and controlled workflow loops.
- `packages/objective-kernel` owns portable objective identities, transitions,
  authority, budgets, leases, checkpoints, and evidence references.
- `tools/objective-runtime` provides memory, JSONL, PostgreSQL, artifact,
  scheduler, and queue adapters.
- `tools/dev-tooling` provides project-local task activation, preflight,
  precedent materialization, and handoff commands.
- `packages/objective-test-fixtures` provides store conformance shared by the
  runtime adapters.

## Development

Use Node.js `24.14.0` and pnpm `10.22.0`.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Useful narrow commands:

```powershell
pnpm workflow:test
pnpm --filter @agent-context/repo-policy test
pnpm --filter @agent-context/objective-kernel test
pnpm --filter @agent-context/objective-runtime test
pnpm --filter @agent-context/dev-tooling test
```

## Extraction state

The reusable implementation is isolated and neutrally named. The next slice is
the project-local registry and installer, followed by an installation into the
clean Control Tower worktree at `D:\dev\control-tower-clean`.

The extraction decisions and verification record live in
`.codex/work/project-context-framework-extraction.md`.
