# Work record: acceptance verification sequencing

## Outcome

Provide one repository-owned acceptance command that runs the framework's full
workspace proof once, the existing isolation proof once, and one configured
downstream fixture profile once. The command must test a clean committed
framework revision, preserve both repositories, stop after the first failed
stage, and emit compact revision-bound evidence.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Existing gates | Reuse the root `typecheck`, `test`, `check`, and `registry:check` scripts, the public `verify:isolation` command, and the fixture's installed policy wrapper. | Existing command owners |
| Full workspace | Treat the four existing root commands as one ordered `workspace` proof stage. Run each command exactly once inside that stage. | Acceptance sequencer |
| Revision authority | Refuse to start unless the framework and downstream fixture are clean Git worktrees. Capture both full revisions and revalidate them after all stages. | Git preflight/postflight |
| Downstream fixture | Require an explicit absolute fixture path. Run its configured default repository-policy profile rather than duplicating downstream commands in framework code. | Downstream policy |
| Failure behavior | Stop after the first failed command. Mark later proof stages `not-run`; never return a successful top-level result for a partial sequence. | Acceptance result contract |
| Output | Suppress successful child output, retain bounded failure tails with byte counts and truncation disclosure, and emit one compact JSON result. | Acceptance CLI |
| Documentation-only follow-up | Do not rerun broad executable gates after a documentation-only commit. Record the previously tested revision and verify that the later diff contains only documentation. | Maintainer workflow |

## State

- Phase 6 is complete at `7104e679edda56889bba30df3c7170135b1197dc`.
- The framework worktree and `D:\dev\control-tower-clean` fixture are clean.
- Full workspace, isolation, and downstream verification already exist but are
  invoked independently, allowing redundant reruns and ambiguous revision
  coverage.
- The isolation gate archives `HEAD`, so its caller must establish that `HEAD`
  is the same clean state being accepted.

## Topology

```text
pnpm verify:acceptance -- --fixture <absolute-path>
└── acceptance sequencer
    ├── Git preflight: framework + fixture clean revisions
    ├── workspace stage (once)
    │   ├── pnpm typecheck
    │   ├── pnpm test
    │   ├── pnpm check
    │   └── pnpm registry:check
    ├── isolation stage (once)
    │   └── existing dev-tooling verify:isolation command
    ├── downstream stage (once)
    │   └── node <fixture>/.agent-context/policy.mjs verify
    └── Git postflight: same clean revisions
```

## Slice

1. Define typed completed, failed, and not-run stage states.
2. Add a thin sequencer around the existing public commands.
3. Add argument parsing and one root package-script entry point.
4. Test order, stop-on-failure, clean-revision enforcement, and compact results
   with temporary Git repositories and injected command execution.
5. Commit the implementation, then run the new acceptance command exactly once
   against clean Control Tower and record the revision-bound result.

## Replacements

- Replace manually assembled final verification runs with one sequenced command.
- Replace implicit `HEAD` coverage with explicit framework and fixture revisions
  in the result.
- Replace broad reruns after documentation-only changes with a documented
  carry-forward rule tied to a proven documentation-only diff.

## Non-goals

- Do not change the behavior of any existing test, policy, registry, isolation,
  or downstream verification command.
- Do not cache or skip a failed executable gate.
- Do not infer a downstream fixture path or verification profile.
- Do not mutate, install into, commit, push, publish, or deploy either repository.
- Do not create a general CI, workflow, scheduler, or persistent receipt system.

## Propagation

- Root and dev-tooling package scripts.
- Sequencer implementation, CLI boundary, result types, and focused tests.
- Framework verification guidance and this durable evidence record.
- Final evidence records the exact framework and fixture revisions tested.

## Verification evidence

Pending implementation.
