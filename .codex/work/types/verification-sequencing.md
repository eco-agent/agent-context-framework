# Type architecture contract: acceptance verification sequencing

## Domain concepts

- **Acceptance sequence**: one ordered execution of the three required proof
  layers against fixed clean Git revisions.
- **Proof stage**: `workspace`, `isolation`, or `downstream`.
- **Command outcome**: one existing command that passed or failed with measured
  duration and bounded failure evidence.
- **Repository snapshot**: an absolute real path and full Git revision proven
  clean at both the start and end of the sequence.

## Valid states

- A passed sequence contains three passed stages and unchanged clean framework
  and fixture snapshots.
- A proof-stage failure contains zero or more passed stages, exactly one failed
  stage, and every later stage as `not-run`.
- A proof-stage failure still revalidates both repository snapshots before it is
  returned. If that revalidation fails, postflight becomes the reported phase
  and retains the original proof-failure detail.
- A preflight failure contains only `not-run` stages. A postflight failure may
  contain three passed proof stages because repository stability is validated
  after those proofs complete.
- A passed stage contains only passed command outcomes.
- A failed stage contains preceding passed outcomes and exactly one failed
  command outcome.
- A not-run stage contains no commands or timing fields.

## Invalid states to exclude

- `status: "passed"` with a failed or not-run stage.
- A failed sequence with later executed stages.
- A clean snapshot without a full revision.
- A successful command carrying failure output.
- A failed command that silently truncates captured evidence.
- A sequence that starts or ends on a dirty worktree or different revision.

## Allowed transitions

```text
preflight
├── invalid/dirty -> failed; all proof stages not-run
└── clean snapshots
    └── workspace
        ├── failed -> isolation/downstream not-run
        └── passed -> isolation
            ├── failed -> downstream not-run
            └── passed -> downstream
                ├── failed -> sequence failed
                └── passed -> postflight
                    ├── repository changed -> sequence failed
                    └── unchanged clean snapshots -> sequence passed
```

## Trust boundaries

| Boundary | Untrusted representation | Validation | Trusted result |
| --- | --- | --- | --- |
| CLI arguments | `string[]` | Exact `--fixture <absolute-path>` grammar | Acceptance request |
| Repository path | Filesystem string | Absolute path, `realpath`, Git worktree checks | Repository snapshot |
| Git output | Process bytes | Successful exit, trimmed 40-character lowercase hash, empty porcelain status | Clean revision |
| Child command | Exit/error/output streams | Exit code and bounded tail accounting | Command outcome |
| Postflight | New Git observations | Exact equality with preflight snapshots | Stable accepted revisions |

## Representations and conversions

- CLI arguments convert once into `AcceptanceVerificationRequest`.
- Git process output converts once into `RepositorySnapshot`.
- Each child execution converts into a passed or failed `CommandOutcome`.
- Ordered outcomes convert into a discriminated `ProofStageResult`.
- The first failed stage plus later not-run stages converts into a failed
  `AcceptanceVerificationResult`; all passed stages plus successful postflight
  converts into the passed variant.

## Failure semantics

- Expected command failure is a typed failed result and stops later stages.
- Invalid input, missing repositories, dirty worktrees, and revision changes are
  acceptance failures, not successful partial evidence.
- Infrastructure failures such as an unspawnable process are translated once at
  the command-execution boundary while preserving the error message.
- Captured failure output is bounded to protect the orchestration transport. The
  result always reports total bytes and whether the retained tail is truncated.

## Public contracts affected

- New root command: `pnpm --silent verify:acceptance -- --fixture <absolute-path>`.
- New dev-tooling command and exported result/request types.
- Existing verification commands and policy contracts remain unchanged.

## Decisions and rejected alternatives

- Rejected a shell script because Windows portability and typed outcome
  reporting are already TypeScript-owned concerns in dev-tooling.
- Rejected hard-coding Control Tower because the downstream fixture is explicit
  task authority, not framework configuration.
- Rejected automatic documentation-only caching because it would require a
  persistent receipt protocol. The narrow workflow rule is sufficient until
  repeated tasks demonstrate that need.
- Rejected continuing after a failed stage because later output cannot make a
  partial sequence acceptable and would add avoidable work.

## Verification evidence

Pending implementation.
