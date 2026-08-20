# Work record: agent Git protocol

## Outcome

Agents leave Git in a predictable state. A branch owns each logical work stream.
An ephemeral worktree materializes that branch only when concurrent or isolated
filesystem access is necessary. Durable orchestration records immutable commits
and uses private refs for temporary reachability.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Logical isolation | Create a `codex/<task>` branch for each work stream from one recorded full baseline commit. | Core Git policy |
| Filesystem isolation | Add a linked worktree only for concurrent work or an explicitly isolated check. Record its absolute path and remove it when the run closes. | Core Git policy |
| Dirty state | Commit task-owned changes as visible checkpoints. Agents never use `git stash`. | Core Git policy |
| Vendored source | Use a package when its API is sufficient. Use `git subtree` for repository-shaped source with an upstream update lifecycle when the host provides it. Keep exact-file adoption as a pinned, attributed copy. | Reuse policy and core Git policy |
| Submodules | Do not add or mutate submodules unless a project contract explicitly requires the separate repository lifecycle. | Core Git policy |
| Orchestration refs | Use `refs/agent-context/runs/<run-id>/<stage>` with expected-old-object checks. Record the same object IDs in the ledger. | Orchestration Git reference |
| Review history | Preserve the implemented series, add reviewer repairs as fixup commits, compare series with `range-diff`, and autosquash only during authorized finalization. | Orchestration Git reference |
| Integration preflight | Run `merge-tree --write-tree --quiet` against recorded target and accepted tips. Treat exit 0 as clean, 1 as conflict, and other values as errors. | Orchestration Git reference |
| Git configuration | The framework does not mutate global Git configuration. Repository or worktree config changes require an explicit project decision. | Core and orchestration policy |
| Optional tools | Difftastic, Git Town, Graphite, and Jujutsu remain user-selected tools, not framework dependencies or correctness gates. | Registry decision |
| Capability | Core requires Git. The optional orchestration skill recommends Git because only its Git-backed workflow branch needs it. | Registry capability metadata |

## State

- Immutable baseline: `432f4a7b6e169cf6104ad2be7a91c375cab3c45a`.
- Branch: `codex/agent-git-protocol`.
- No linked worktree was created because this work is serial.
- Registry revision before this work: `0.8.1`.
- `.agent-context/policy.json` is absent. Project contracts and named
  verification profiles are unconfigured.

## Topology

- `registry/sources/instructions/core.md` owns common branch, worktree, stash,
  vendoring, submodule, and configuration rules.
- `.codex/skills/orchestrate-codex-workflows/references/git-transaction.md` owns
  staged checkpoints, private refs, review series, integration preflight, and
  cleanup for durable workflows.
- `.codex/skills/orchestrate-codex-workflows/SKILL.md` routes Git-backed workflow
  construction to that reference.
- `docs/architecture/portable-objective-orchestration.md` states that the
  objective kernel stores Git identities but does not own checkouts.
- Registry governance protects the common policy and orchestration reference.

## Slice

1. Replace the size-based worktree sentence with branch-first rules, add one
   complete staged Git transaction reference, update the architecture boundary,
   rebuild the registry, and verify all projections.

## Replacements

- Replace `Use worktrees for large diffs` with branch-first, concurrency-driven
  worktree policy.
- Replace implicit worktree durability with recorded branches, commits, ledger
  evidence, and temporary private refs.
- Replace stash-based recovery with checkpoint commits.

## Non-goals

- Do not create, move, remove, or prune unrelated worktrees.
- Do not mutate global or repository Git configuration.
- Do not add a Git wrapper, scheduler, hosted review dependency, or VCS
  abstraction.
- Do not treat sparse checkout as an authority or security boundary.
- Do not make human-readable `range-diff` output a machine-stable contract.

## Propagation

- Canonical and root core instructions.
- Preserved instruction hash.
- Orchestration skill router and new reference.
- Portable orchestration architecture.
- Registry revision, decision, governance hashes, and derived registry.
- Core and orchestration Git capability declarations plus README disclosure.
- Focused registry, agent instruction, and technical-prose checks.
- Developer-tooling revision assertions and semantic-governance tests.

## Verification evidence

- Official Git documentation confirmed that linked worktrees share `refs/*`,
  worktree removal rejects dirty trees without force, sparse checkout upgrades
  repositories to worktree-specific config, and `refs/stash` is repository-wide.
- Official Git documentation confirmed `update-ref` expected-old-object checks
  and multi-ref transactions, `range-diff`'s human-only output contract,
  `merge-tree --write-tree` exit statuses, and reachability through `refs/*`.
- Git's upstream `contrib/subtree` documentation confirmed that subtrees embed a
  subproject as ordinary repository files and may carry full or squashed history.
  Its `contrib` location supports a host capability check rather than assuming
  every Git installation includes the command.
- `pnpm --silent registry:build` built registry `0.8.2` with 30 components.
- `pnpm --silent registry:check` passed after the final source and capability
  changes.
- `pnpm --silent check:agents` passed after updating the preserved top-level
  instruction block.
- `pnpm --silent --filter @agent-context/dev-tooling typecheck` passed.
- The first developer-tooling test run found three stale assertions that still
  expected registry `0.8.0`. After they were updated, all 85 tests passed.
- The focused installer, registry, and runtime rerun exposed one exact capability
  expectation that omitted recommended Git support. After updating it, all 19
  context registry and governance tests passed. The installer and runtime tests
  in the same focused run had already passed.
- Technical prose passed for the new Git transaction reference, orchestration
  skill route, registry decision, and this work record. The full changed-owner
  scan reports only 11 examples inside the verbatim Unslop policy. No new Git or
  architecture prose finding remains.
- The full developer-tooling test created an untracked repository policy seed as
  a verification side effect. The file was absent before the run, was not part of
  this decision, and was removed. Repository policy remains unconfigured.
- `git diff --check` passed. Root `AGENTS.md` matches the canonical repository
  work projection.
- No linked worktree, stash, global Git config mutation, browser check, downstream
  fixture, broad acceptance run, push, or deployment occurred.
