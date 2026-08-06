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
  precedent materialization, installation, and handoff commands.
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

## Project-local installation

The v1 registry contains one `core` component. It installs a marked section in
the target repository's `AGENTS.md`, while leaving any project-authored text
outside that section untouched. Desired components live in
`.agent-context/config.json`; exact installed hashes and ownership live in
`.agent-context/lock.json`.

Run the CLI from this repository and point it at the project to configure:

```powershell
pnpm agent-context init --cwd D:\path\to\project
pnpm agent-context diff --cwd D:\path\to\project
pnpm agent-context add core --cwd D:\path\to\project
pnpm agent-context doctor --cwd D:\path\to\project
pnpm agent-context recover --cwd D:\path\to\project
```

`init` installs `core` and is idempotent. `add` resolves component dependencies
and is ready for further registry components. `diff` is read-only and exits
non-zero when files are missing, upstream bytes need installation, local drift
blocks an update, or the deterministic lock needs refreshing. The installer
never rewrites context with a model and refuses to overwrite locally edited
managed content or adopt an existing whole-file target. `doctor` classifies an
interrupted transaction as discardable, safely resumable, or blocked by drift.
`recover` discards only pre-journal staging or resumes mutations whose current
and staged hashes still match the journal boundaries.

## Extraction state

The reusable implementation is isolated and neutrally named. The first
installation slice is implemented and installed into the clean Control Tower
worktree at `D:\dev\control-tower-clean`; later slices can expand the registry
without changing the ownership or drift contract.

The extraction decisions and verification record live in
`.codex/work/project-context-framework-extraction.md`.
