# Capsule runtime reproducibility repair

## Intended outcome

Repair the packaged hook and repository-context runtime so their committed
bundles rebuild byte for byte in an isolated worktree. Prove that a fresh Codex
worktree can start the required `repo_context` MCP server through the tracked
bootstrap without installing project packages. Stop at the repository-owned
acceptance boundary or after 60 minutes.

## Baseline and ownership

- Baseline revision: `3eefd58cf6e4dd38338023272f8d99b64f3a35c5`
- Failed acceptance revision: `c4ac555b571e2602a3ad8af696e1fa53a19033d5`
- Branch: `codex/acf-capsule-runtime-repro`
- Worktree: `D:/dev/agent-context-framework-capsule-runtime-repro`
- Writer: primary Sol agent
- Read-only scouts: bundle mismatch, launcher timeouts, and environment coupling
- Durable fixture: `D:/dev/acf-fixture-runtime-capsule`
- Project contracts: none declared in `.agent-context/policy.json`

## Preservation map

| Classification | Behaviour | Owner |
| --- | --- | --- |
| Retained | Capsule v1, lock v3, verified migration, ignored materialization, branch-switch reconciliation, semantic restart classification, and current activation ownership remain unchanged. | ADR-0028 and registry decision 0.14.0 |
| Retained | Bootstrap uses Node and Git without a project package install, rematerializes missing packaged runtime before launch, keeps protocol output off standard output, and preserves lock-v2 launch compatibility. | ADR-0028, registry decision 0.14.0, and focused tests |
| Changed | Runtime bundle production and launcher lifecycle may change only where evidence proves nondeterminism or startup failure. | Primary Sol agent after focused diagnosis |
| Added | Focused regression evidence for the proved byte mismatch and startup blocker. | Dev-tooling tests and exact reproduction commands |
| Removed | Nothing unless an obsolete build input or process-lifetime path is the proved cause and its removal preserves the contracts above. | Primary Sol agent with focused test evidence |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Capsule runtime builder | Rebuild committed hook and repository-context bundles byte for byte across worktree paths. | Exact byte comparison and focused reproducibility tests | Stop and report the remaining varying input if the pinned toolchain cannot make the output path-independent. |
| Bootstrap launcher | Start the selected packaged protocol after verification and materialization without leaking bootstrap text to standard output or leaving child processes alive. | Focused migrated hook and repository-context launch tests, child exit, and cleanup evidence | Report the exact process boundary if the host prevents a reliable focused reproduction. |
| Codex startup | Initialize required `repo_context` from a fresh worktree with no project package install. | Fresh-worktree launch or the closest repository-owned integration check | Report any host-owned trust or task-creation condition separately from repository code. |
| Scope owner | Exclude updater, one-command v2 migration, fleet manager, central configuration, and optional host launcher work. | Branch diff from the baseline | Preserve the updater experiment at `d44cd444056c91211164e06a43829a24e7c8860b`; do not reuse it. |
| Verification owner | Run narrow owner checks first. Run final acceptance once from a clean committed candidate. | Commands, exact revision, elapsed time, and Git status | Stop at the first failed stage and report skipped later stages. |

## Current state

The earlier acceptance run passed workspace type checking, then failed in the
dev-tooling test suite. Both tracked runtime bundle reproducibility tests found
different rebuilt bytes. Four integration tests reached their own timeout. The
later workspace, registry, isolation, and downstream stages did not run. Five
focused capsule tests passed before that run. The durable fixture remains clean
at `89da6216a12769067a68bab53f266f193c2d96d7`.

Focused probes established two direct causes before implementation:

- With only the root lock installed, the packer left
  `@agent-context-runtime/shared`, `@modelcontextprotocol/server`, and `zod`
  as imports. The rebuilt hook was 5,145 bytes instead of 5,903 bytes. The
  rebuilt repository-context bundle was 10,658 bytes instead of 381,939 bytes.
- Installing the isolated runtime lock made the repository-context bundle match
  SHA-256 `1359fc...aaa7` exactly. Building that runtime made the shared package
  export resolvable and made the hook bundle match SHA-256 `539f4c...40ff`
  exactly. These observations rule out absolute paths, line endings, timestamps,
  source maps, and output normalization.
- A clean detached worktree at the baseline had no `node_modules`. The exact
  `.codex/config.toml` pnpm command failed in 3.7 seconds because `tsx` was not
  installed. The tracked package-free repository-context bundle initialized,
  listed `repo_context`, and exited cleanly in 1.6 seconds in the same worktree.

The isolated check worktree is
`D:/dev/agent-context-framework-capsule-runtime-fresh-repro` at
`3eefd58cf6e4dd38338023272f8d99b64f3a35c5`. It is read-only evidence and will
be removed after its clean tip is recorded.

## Competing causes

1. The bundle embeds an absolute source path or worktree-dependent identifier.
2. The build uses a toolchain version or configuration that differs from the
   version used for the committed artifact.
3. Line endings, path separators, source-map paths, entry ordering, or another
   normalized input changes the bytes.
4. A launched protocol child keeps an inherited handle, open stream, or watcher
   alive after the assertion completes.
5. Bootstrap resolves the repository root or packaged runtime through the
   framework checkout, installed packages, or another environment-specific path.

Each probe must distinguish one of these causes from the others before code
changes begin.

The launcher probes ruled out a deterministic protocol deadlock. The two
migrated protocol tests passed together in 48.7 seconds. The two
install-and-build tests completed together in about 36 seconds when Node test
file concurrency was capped at two. The full dev-tooling run disproved that cap:
the migrated hook still reached 90 seconds while one other file ran. The command
now runs one test file at a time. This matches the only measured condition where
all four expensive tests finish below their existing timeouts. It does not
change MCP readiness or protocol lifetime.

One timed-out test exposed a second packaged-runtime conflict. TypeScript source
builds overwrite the installed bundled hook and repository-context entrypoints,
so doctor reports exact managed-file drift after a successful bootstrap. Runtime
bootstrap now snapshots those two package-owned files, runs the source build,
and restores them on both success and caught failure. Doctor remains strict.

## Topology

1. Compare rebuilt and committed bundle bytes and locate the first differing
   input or output region.
2. Trace bootstrap launch, readiness, exit, and cleanup for both protocols.
3. Trace fresh-worktree path and package assumptions for `repo_context`.
4. Add the smallest regression seam that reproduces the proved cause.
5. Repair the canonical build or launch owner, then rebuild direct projections.
6. Run focused owner tests, commit a checkpoint, and confirm a clean worktree.
7. Run the repository final-acceptance sequence once.

## Smallest complete slice

The slice is complete when both tracked runtime bundles rebuild byte for byte in
this isolated worktree, the repository-context launcher starts through bootstrap
without project dependencies, relevant focused tests pass, and the committed
clean revision reaches the declared acceptance boundary.

## Replacements

No parallel runtime representation is allowed. If the repair changes build or
launch ownership, it replaces the obsolete path directly and updates its
committed bundle and tests together.

## Non-goals

- Experimental updater work or routine-update diff reduction.
- One-command migration from an ordinary lock-v2 project.
- Fleet management or central multi-project configuration.
- Optional host launchers.
- Frontend composition feature changes beyond diagnosing a shared timeout cause.

## Propagation paths

- TypeScript bundle entry and packer configuration to committed runtime bundle.
- Committed bundle to capsule entry, lock metadata, materialized runtime, and
  reproducibility tests.
- Bootstrap command resolution to repository-context and hook child processes.
- Process exit and error handling to Codex MCP startup and focused integration
  tests.
- Tested revision and fixture state to final acceptance evidence.

## Closure

Status: stopped at the 60-minute boundary before final acceptance.

Focused verification passed:

- Dev-tooling TypeScript build and typecheck.
- Both tracked bundle reproducibility tests.
- Fresh package-free framework repo-context startup and tool call.
- Both migrated bootstrap protocol tests together in 48.7 seconds.
- Codex runtime integration after packaged-entrypoint preservation.
- Packaged-entrypoint restoration after successful and failed source builds.
- Both public bundle build commands, with no bundle diff.

The full dev-tooling suite was attempted with file concurrency two. It failed
when the migrated hook test reached its 90-second limit. No child process from
that stopped run remains. Concurrency is now one, but the full suite has not run
again. Repository final acceptance has not run. Workspace `check`,
`registry:check`, isolation, downstream runtime verification, and downstream
policy verification therefore remain unverified in this workstream.
