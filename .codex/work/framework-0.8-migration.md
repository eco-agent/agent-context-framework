# Framework 0.8.0 repository migration

## Outcome

Move the already-authored registry 0.7.0 orchestration component and registry
0.8.0 representation-first frontend discipline from the former Control Tower
framework lineage into the standalone Agent Context Framework repository. Prove
the relocated framework before updating Control Tower as a downstream consumer.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| History transfer | Replay the exact ten-commit `77d9d80..a31df6c` patch series onto the standalone repository. Do not merge unrelated extracted histories and do not manually recreate the changes. | Framework migration |
| Release boundary | Preserve 0.7.0 and 0.8.0 as governed revisions; the accepted install target is 0.8.0. | Registry |
| Consumer isolation | Run final framework acceptance against a disposable fixture before mutating the live Control Tower worktree. | Acceptance |
| Orchestration selection | Keep orchestration as an explicit optional leaf and select it explicitly in Control Tower only after the existing installation is current. | Installer |
| Runtime boundary | Rebuild the isolated consumer runtime and require a real MCP `initialize` and `tools/list` handshake. | Runtime |
| Context visibility | Runtime enforcement of a worker's visible context remains a documented non-blocking limitation. | Framework contract |

## State

- Standalone framework baseline: `132d5fddbb4f9fa078b0f6c5a16add9701501a13`, registry 0.6.0.
- Former framework baseline: `77d9d8045076560e1e87a74034f5c7564a54a009`, registry 0.6.0.
- Orchestration revision source: `34a3dfddf04ffadf945c761a237bf6a1576824da`, registry 0.7.0.
- Representation-first source: `a31df6cfed5e5f8a875ab0388d6d0abbc2ec5f40`, registry 0.8.0.
- The extracted histories have no merge base. A combined read-only patch check passed against the standalone repository.
- Control Tower is clean at `a73fbcecef186f8e56c2271128e708da672257f7` with an installed 0.5.2 lock.

## Topology

- Canonical framework source and registry: `D:/dev/agent-context-framework`.
- Isolated migration worktree: `D:/dev/agent-context-framework-worktrees/migrate-0.8`.
- Downstream product consumer: `D:/dev/control-tower`.
- Former framework branches remain recovery evidence until the standalone migration and consumer update are proven.

## Slice

1. Record the migration boundary.
2. Replay and audit the exact 0.7.0 and 0.8.0 commits.
3. Run focused framework verification, commit, and run the single declared acceptance sequence against a disposable fixture.
4. Preview and perform the downstream 0.8.0 update without implicit overwrite.
5. Correct stale project-owned Control Tower policy, bootstrap the isolated runtime, and prove the real MCP handshake.
6. Confirm both repositories are clean before considering legacy-ref cleanup.

## Replacements

- The standalone repository replaces the former Control Tower framework branch as canonical source ownership.
- The installed direct-runtime MCP configuration replaces the commented legacy workspace command.
- The 0.8.0 lock replaces the downstream 0.5.2 installation baseline.

## Non-goals

- No push or deployment.
- No new scheduler, objective kernel, task envelope, database, queue, or binding producer.
- No new worker-context visibility enforcement.
- No deletion of former framework worktrees or refs until all migration and downstream evidence passes.
- No `update --overwrite` unless a separately reviewed conflict requires it.

## Propagation

- Registry source, generated registry, governance, decisions, installer planner, setup UI disclosures, and copied skill assets move together through the replayed commits.
- Downstream propagation is limited to the components selected in Control Tower plus the explicitly selected orchestration leaf.
- Project-owned policy remains consumer-owned and must be corrected deliberately rather than overwritten by the registry seed.

## Relocation adaptations

The ten replayed commits retained byte-identical source across all 58 changed
paths. The standalone repository then exposed three stricter local contracts that
did not exist in the former lineage:

- its instruction-hierarchy check requires the frontend skill to preserve the
  visible element's **semantic role** as well as its words;
- its workspace inventory requires every nested package manifest, including a
  distributable template, to declare `agentContext.category` and
  `agentContext.owner`;
- its adopted development toolchain is `@types/node` 24.13.3 and TypeScript
  7.0.2, replacing the former template's 22.10.2 and 6.0.2 declarations.

The canonical skill and template now satisfy those standalone repository
contracts. Governance hashes and the generated 0.8.0 registry were refreshed;
no safety, closure, or dependency-installation boundary was weakened.

## Focused verification

- Workspace dependency installation completed from the frozen root lockfile.
- Registry generation and deterministic `registry:check` passed at 0.8.0 with
  30 components.
- Root TypeScript build passed.
- The complete dev-tooling suite passed 84/84 after its required workspace build.
- The affected registry-builder, installer, CLI, and setup-server subset passed
  40/40 after relocation adaptations.
- Repository-policy tests passed 29/29.
- Both changed skills passed the system skill validator.
- Setup UI production build passed.
- An external copy of the distributable orchestration template installed its
  declared dependencies, compiled with TypeScript 7.0.2, and passed 30/30 mock
  tests. No dependency or generated output entered the canonical skill directory.
- `git diff --check` passed and the canonical orchestration asset contains no
  `dist`, `node_modules`, `.codex-runs`, or temporary verification configuration.

The external test copy remains at
`C:/Users/EthanO/AppData/Local/Temp/agent-context-orchestration-0.8-991f450c`
because runtime policy rejected recursive cleanup even after the target was
resolved and verified under the system temporary directory. It is outside both
repositories and is not distributable input.
