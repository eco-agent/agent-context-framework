# Work record: Phase 5 isolated runtime

## Outcome

Create a source-owned `.agent-context/runtime` workspace that builds and runs without the host package graph, accepts the target repository root explicitly, keeps generated output under its own directory, and can be bootstrapped through one fixed typed installer operation. Extract only reusable repository inspection, instruction and registry checks, bounded repository-context operations, Codex hook behavior, and shared decoding/filesystem boundaries. Exclude all objective orchestration.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Execution mechanism | Use the primary agent and ordinary deterministic tests. Do not copy or run the orchestration skill's SDK workflow runtime because Phase 5 explicitly excludes Codex orchestration and long-horizon loops. | Task |
| Worktree | Implement on `codex/phase-five-isolated-runtime` in `D:\dev\agent-context-framework-phase5`, based on `4a7a29503500faf553c0ac95af33ad877b6997a1`. | Git |
| Runtime root | Own all source, package metadata, dependency state, lock state, and generated output below `.agent-context/runtime`. | Runtime workspace |
| Package topology | Use four fixed packages: `shared`, `policy`, `repo-context`, and `hooks`. Package relationships are static and declared before execution. | Runtime workspace |
| Package manager | Pin the same proven toolchain versions as the framework initially, but own them in the nested runtime manifest and lockfile. The host manifest and lockfile are not dependencies or mutation targets. | Runtime workspace |
| Reuse | Copy the proven registry decoder, filesystem traversal, instruction checks, workspace inspection, bounded repository-context tool, CLI parsing, and hook scope behavior first; remove objective-specific portions as direct diffs. | Source packages |
| Repository context | Extract only bounded read/search operations and their direct CLI. Exclude objective ledgers, cumulative objective budgets, SDK clients, MCP server wiring, and orchestration runtime. | `repo-context` |
| Hook boundary | Preserve fail-closed input decoding, repository/path validation, writable-scope matching, source hashing, and compact-session context as a generic scoped-session hook contract. Exclude leases, runs, task envelopes, objective IDs, and scheduler state. | `hooks` |
| Policy boundary | Extract strict registry/config/lock decoding, deterministic dependency resolution, repository workspace inspection, and canonical instruction checks. Phase 6 will own project policy configuration and verification profiles. | `policy` |
| Bootstrap | Add one typed `bootstrapRuntime` operation whose only modes are install-and-build and no-install. Commands and arguments are fixed in source and never supplied by registry data. | Development installer |
| Operational status | Represent materialized-but-unbootstrapped, dependencies-missing, build-missing, operational, and invalid states explicitly. `--no-install` succeeds with a visible non-operational status. | Runtime doctor |

## State

- Framework baseline: `4a7a29503500faf553c0ac95af33ad877b6997a1`.
- `tools/repo-policy` contains reusable registry decoding, instruction checks, filesystem traversal, and workspace discovery, but its package also depends on objective-kernel contracts and contains task/orchestration policy that must not be copied wholesale.
- `tools/codex-workflows/src/repository-context.ts` combines a reusable bounded read/search tool with objective-ledger accounting. Only the former is in scope.
- `tools/dev-tooling/src/codex-hook-cli.ts` combines reusable hook/path behavior with objective task bindings. The hook behavior must be extracted behind a new generic scoped-session boundary, not carry objective representations into the runtime.
- The host is a pnpm TypeScript workspace. The nested runtime does not yet exist.

## Topology

```text
development installer
└── bootstrapRuntime(fixed mode, explicit project root)
    └── .agent-context/runtime
        ├── shared: strict decoding and filesystem/path authority
        ├── policy: registry/instruction/repository inspection
        ├── repo-context: bounded read/search plus direct CLI
        └── hooks: scoped-session hook evaluation plus stdin CLI
```

`policy`, `repo-context`, and `hooks` may depend on `shared`. No runtime package may depend on the host workspace, objective packages, Codex SDK, scheduler, queue, database, or test-fixture package.

## Slice

1. Create the independently installable and buildable runtime root with pinned versions and ignored generated output.
2. Extract shared boundaries and the smallest policy, repository-context, and hook modules with package-local tests.
3. Add fixed build and doctor scripts, then prove source editability and non-Node host operation in a temporary fixture.
4. Add the typed bootstrap operation and `--no-install` result to the development installer without adding a registry component.
5. Verify package dependency isolation, host manifest/lock immutability, and explicit-root behavior.

## Replacements

- Replace future runtime dependence on `tools/repo-policy`, `tools/codex-workflows`, and `tools/dev-tooling` with source-owned nested packages.
- Replace objective-bound hook input state with the generic scoped-session contract required by hook behavior.
- Replace host-workspace build assumptions with a nested manifest, lockfile, TypeScript configuration, and fixed scripts.

## Non-goals

- No Wave 3 `repository-policy` registry component or project policy configuration.
- No Wave 4 Codex agents, hooks configuration, MCP server configuration, or convenience bundle.
- No objective kernel, objective runtime, leases, schedulers, queues, PostgreSQL, pg-boss, SDK workflow client, task envelope, agent loop, or objective fixture.
- No frontend changes, host product dependency changes, registry revision, deployment, publication, or push.
- No live Codex workflow execution.

## Propagation

- Package boundaries propagate through nested manifests, TypeScript references, imports, tests, build output, doctor classification, and dependency-isolation checks.
- Explicit repository-root authority propagates through policy, repository-context, hook, bootstrap, and test entry points.
- The fixed bootstrap contract propagates through the installer API, CLI parsing, subprocess arguments, `--no-install` reporting, and mutation tests.
- Source editability propagates through tracked TypeScript, ignored generated output, rebuild behavior, and an isolation fixture.
- Objective exclusion propagates through package manifests, imports, file inventory assertions, and full repository checks.

## Verification evidence

- Implementation commit `7ec982312ea7b157f43322ef0388b6972495dd10` contains the four fixed runtime packages, nested manifest and lockfile, TypeScript configuration, build/clean/doctor scripts, bootstrap API/CLI, and host-inspection exclusion.
- `pnpm --dir .agent-context/runtime test` builds only the nested workspace and passes eight package-local tests covering strict decoding, non-Node inspection, registry resolution, writable hook scope, compact context, bounded reads, path escape, cursors, and no-match semantics.
- The real `bootstrap-runtime --no-install` command reports `dependencies-missing` for a Git-archived runtime with no dependencies. The real install-and-build mode then reports `operational` using pnpm 10.22.0 resolved outside the target workspace.
- A temporary non-Node repository proved the isolation sequence: archive only tracked runtime source, bootstrap it, inspect policy, read repository context, execute a scoped hook, edit TypeScript source, rebuild, observe the edited behavior, and confirm the host lock hash is unchanged and no host `package.json` is created.
- Static dependency tests prove the exact four-package graph and reject Codex SDK, objective kernel/runtime, scheduler/queue, PostgreSQL, pg-boss, host-tool, and objective-package references. Git reports no tracked `node_modules` or `dist` output.
- The framework host `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `tsconfig.json` are byte-identical to baseline. The nested runtime is ignored by host workspace discovery rather than added to the host graph.
- Full framework verification passed: `pnpm typecheck`, the complete `pnpm test` workspace suite, `pnpm check` with zero errors and four pre-existing warnings, and `pnpm registry:check` reporting unchanged registry 0.3.0 with 22 components.
- Runtime verification passed: nested build, eight tests, doctor `operational`, real no-install/bootstrap execution, and the non-Node source-editability proof.
