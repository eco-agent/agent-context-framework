# ACF test application

## Intended outcome

Add a deterministic fixture generator that creates a small Git-backed web
application for repeated ACF installation tests. The caller chooses whether the
application starts clean or with deliberate project-owned changes, and whether
the generated repository has no ACF installation or a committed core
installation.

## Baseline and ownership

- Baseline revision: `58aae97e2a11ec1dde7bdaa0b4a9f16f8efc7a66`
- Task branch: `codex/acf-test-application`
- Active writer: primary Sol agent in the current worktree
- Generator owner: `tools/dev-tooling`
- Template owner: `tools/dev-tooling/fixtures/acf-test-application`

No project contracts are declared in `.agent-context/policy.json`.

## Preservation map

| Classification | Behaviour | Owner |
| --- | --- | --- |
| Retained | Final acceptance requires a separate clean committed fixture and does not create or repair one. | `acceptance-verification.ts` |
| Retained | Existing installer tests may continue to use their focused temporary registries. | Current test helpers |
| Retained | ACF installation uses the real installer and registry rather than a copied fixture implementation. | Context installer |
| Added | A repository-owned command generates a zero-dependency application with deterministic Git commits. | New fixture generator |
| Added | `clean` and `dirty` states describe project-owned Git changes independently of ACF installation state. | New fixture generator |
| Added | Replacing a generated fixture requires its marker and an explicit replace option. | New fixture generator |
| Removed | None. | User authority remains unchanged |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Fixture CLI | Accept only an absolute output directory outside the framework worktree. | Argument tests and generated manifest | Stop and report the rejected path. |
| Fixture generator | Replace only a directory containing the exact fixture marker. | Replacement test and marker inspection | Use a new directory or restore the marker. |
| State selector | `clean` leaves no Git changes. `dirty` changes one tracked application file and adds one untracked note. | Exact `git status --porcelain` assertion | Regenerate instead of repairing an unknown repository. |
| ACF selector | `none` performs no framework installation. `core` calls the real installer and commits its result before applying the selected Git state. | Lock presence, installer result, and Git log | Stop with the installer error and retain the failed output for inspection. |
| Test application | Stay dependency-free and exercise ordinary source, test, documentation, policy, and frontend files. | Generated-file assertions and the application's own verification script | Add another named fixture state only when a test needs distinct evidence. |

## Current state

Repository investigation is in progress. The existing acceptance runner consumes
an external fixture but has no generator. The reusable owners are the existing
context installer, Node built-ins, and Git CLI. General-purpose template packages
would add dependencies without solving the repository-state contract.

The tracked template keeps `package.json`, `AGENTS.md`, the policy file, and the
lockfile under inert template names. The generator activates those names only in
the external repository. This prevents framework workspace and instruction scans
from treating the template as another live package or instruction root.

## Smallest complete slice

1. Add the application template.
2. Add a typed generator and CLI under `tools/dev-tooling`.
3. Add root and package scripts.
4. Test clean, dirty, core-installed, replacement, and unsafe-output behaviour.
5. Run the dev-tooling tests, typecheck, and the generated application's check.

The first complete slice keeps `core` distinct from final acceptance. Acceptance
also requires repository policy, the Codex runtime, hooks, and repository context.
A later `acceptance` ACF state can own that larger and slower setup without making
ordinary installer fixtures pay for it.

## Replacements

None. The generator fills a missing owner and does not replace acceptance or
installer fixtures.

## Non-goals

- Capsule materialization is not implemented in this slice.
- The generator does not run final acceptance automatically.
- The dirty state does not modify ACF-managed files.
- The generator does not install application dependencies or use the network.
- The command does not push, deploy, or modify global Git configuration.

## Propagation paths

- Root package script to dev-tooling CLI.
- Dev-tooling package script to the same CLI.
- Generator to the context installer when ACF state is `core`.
- Tests to generated Git status, files, application checks, and ACF lock state.

## Closure

Status, final revision, verification, and cleanup will be recorded here before
the temporary record is removed.
