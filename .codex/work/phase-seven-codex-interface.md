# Work record: Phase 7 Codex interface

## Outcome

Package Wave 4 as three independently selectable Codex interface components and
one dependency-only convenience bundle. Install project-local agent profiles,
hook declarations, and repository-context MCP configuration that point only into
the installed project. Preserve unrelated project configuration and keep all
objective orchestration outside the distributable graph.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/phase-seven-codex-interface` in `D:\dev\agent-context-framework-phase7`, based on clean Phase 6 head `c74f0b0b618e91186c3509f43e9ecf938bc66eaa`. | Git |
| Registry revision | Advance the governed registry from `0.4.0` to `0.5.0` with the Wave 4 decision in `registry/decisions/0.5.0-wave-four.md`. | Registry governance |
| Component graph | `codex-agents` depends on `core`; `codex-hooks` depends on `core` and `runtime-base`; `codex-repo-context` depends on `core` and `runtime-base`; `codex-runtime` depends on those three components and owns no artifacts. | Registry |
| Structured ownership | Add `toml-members` for declared scalar or table paths and `json-array-items` for declared array items with stable identities. Install, update, remove, drift, rollback, collision checks, and modified-source preservation remain limited to those scopes. | Registry and installer |
| Agent profile | Package one explicit Wave 4 profile: `default` uses `gpt-5.6-sol` at `high`; `scout` and `worker` use `gpt-5.6-luna` at `max`; concurrent spawned threads are capped at `2`. | `codex-agents` |
| Agent configuration | Own the concurrency scalar and declared role tables under `[agents]`; role config paths resolve to project `.codex/agents/*.toml`. Do not infer models or effort from the framework root configuration. | `codex-agents` |
| Hook adapter | Reuse the isolated hooks core behind a Codex-facing adapter. Missing session binding is inert; a valid binding enforces the existing scope contract; malformed, stale, or mismatched bindings fail closed; invalid JSON remains an unclassified `PreToolUse` denial. | Isolated hooks package |
| Hook binding state | Read validated session-ID-keyed bindings from ignored runtime state. Phase 7 consumes bindings but does not produce them. | Isolated hooks package |
| Hook launch | Own matcher items only in `.codex/hooks.json`. Resolve the Git root from the session working directory and provide stable Unix and Windows commands through `commandWindows`. Do not add inline `[hooks]`. | `codex-hooks` |
| Repository context | Reuse the isolated bounded read/search implementation. Add one thin MCP stdio adapter exposing a read-only `repo_context` tool with `read` and fixed-string `search`. | Isolated repo-context package |
| MCP authority | Require an explicit authorized repository root, reject root and symlink escape, expose no `--all`, preserve normal limits of 200 lines, 50 matches, 10 context lines, and 10,000 bytes, and declare `ripgrep` as required. | `codex-repo-context` |
| MCP configuration | Own only `[mcp_servers.repo_context]`, using `node`, project-local generated output under `.agent-context/runtime`, explicit `cwd`, `required`, `enabled_tools`, startup timeout, and tool timeout. | `codex-repo-context` |
| Local references | Registry validation and doctor reject absolute framework paths, host `tools/` entrypoints, `tsx`, host workspace package filters, runtime path escape, user-global `~/.codex` configuration, and duplicate inline hooks. Project trust is a documented prerequisite. | Registry governance and doctor |
| Verification | During implementation run only focused changed-owner tests. After framework and fixture commits are clean, run the single acceptance command once; record its revisions in a documentation-only commit without rerunning broad suites. | Acceptance sequencer |

## State

- Phase 6 is complete at `c74f0b0b618e91186c3509f43e9ecf938bc66eaa`.
- Registry `0.4.0` contains 24 components, including internal `runtime-base` and
  independent `repository-policy`.
- `toml-tables` can own complete tables but not a scalar beside independently
  owned role tables. `json-members` can own event arrays but not individual
  matcher entries.
- The isolated runtime already owns hook evaluation and bounded repository
  read/search. Neither package is yet exposed through project Codex configuration.
- The existing host MCP server is coupled to objective bindings and ledgers and
  is not a reusable Wave 4 entrypoint.
- The existing acceptance sequencer runs one workspace, one isolation, and one
  downstream stage; Phase 7 will extend the latter two without adding another
  broad command.

## Topology

```text
codex-runtime
├── codex-agents
│   └── core
├── codex-hooks
│   ├── core
│   └── runtime-base
└── codex-repo-context
    ├── core
    └── runtime-base
```

`repository-policy` remains independently selectable and is not a dependency of
`codex-runtime`.

## Slice

1. Add the two closed structured projections and prove their complete lifecycle.
2. Add canonical project agent files and precise `[agents]` ownership.
3. Add the dormant-without-binding Codex hook adapter and item-level hook config.
4. Add the repository-context MCP stdio adapter, isolated dependencies, protocol
   smoke tests, root authorization, and precise MCP table ownership.
5. Add the dependency-only bundle, Wave 4 governance and doctor reference checks,
   and exact closure tests.
6. Install the bundle in the controlled downstream fixture without changing its
   host manifest or application graph; run the one acceptance sequence once.

## Replacements

- Replace complete-table or complete-array ownership where Wave 4 needs a smaller
  scope with explicit member and identified-array-item ownership.
- Replace any framework-local Codex references in the downstream fixture with
  installed project-local runtime and agent references.
- Extend the isolated hook and repository-context packages through their public
  boundaries; do not create parallel implementations.

## Non-goals

- No `repository-policy` dependency in `codex-runtime`.
- No session-binding producer.
- No objective kernel, ledger, scheduler, lease, queue, database, runner, task
  envelope, Codex SDK workflow, long-running agent loop, or objective fixture.
- No user-global Codex configuration, inline hooks, host package graph change,
  frontend change, deployment, publication, or push.
- No compatibility operation, migration, dual ownership representation, or
  fallback from the new structured projections.

## Propagation

- Built registry types, decoders, source builder, artifact identities, ownership
  collision checks, projections, lock entries, installer planning, recovery, and
  governance hashes.
- Agent source TOMLs, `.codex/config.toml`, component resolution, lock provenance,
  install/update/remove, and doctor output.
- Hook request parsing, binding lookup, Git-root launchers, runtime ignore state,
  `.codex/hooks.json`, root/nested working-directory tests, and Windows/Unix forms.
- Repository-context package manifest and lockfile, MCP adapter and CLI, stdio
  protocol tests, config table, runtime capabilities, and doctor reporting.
- Acceptance isolation fixture, downstream Wave 4 fixture, host-file hashes, exact
  resolved closure, and revision-bound final evidence.

## Verification evidence

- Pending implementation.
