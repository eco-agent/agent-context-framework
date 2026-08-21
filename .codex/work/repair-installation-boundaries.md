# Work record: repair ACF installation boundaries

## Outcome

Release a clean ACF revision that repairs the stale registry, prevents packaged Git-ignored fixture artifacts, provides a successful one-shot setup lifecycle, and makes registry freshness an explicit CI observation. Record the formatter boundary and carry the supported downstream remedy into the target upgrade.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Registry freshness | Regenerate the built registry and run `pnpm registry:check` as an explicit CI step. | Registry builder and CI workflow |
| Setup completion | Add an opt-in one-shot mode that closes only after a successful install response. Blocked and failed requests keep the server available for recovery. | Setup server and installer CLI |
| Ignored fixture | Create `ignored.tmp` inside the validator's temporary fixture instead of distributing it. | Codebase inventory fixture validator |
| Formatter boundary | Keep application formatters responsible for project-owned files and exclude ACF's isolated `.agent-context/**` tree through an evidence-selected integration or downstream project configuration. Do not ignore the whole `AGENTS.md`. | Repository policy selection and target project configuration |
| Verification | Use focused owner checks during implementation, then run the repository's declared final acceptance once from a clean committed revision against the upgraded target fixture. | This task |
| Downstream upgrade | After ACF verification, send the completed source revision and upgrade requirements to task `01a0249d-598a-7cd3-bb4c-acafdb8e51d4`. | This task |

## State

- Baseline: `767d239ed4f407e19301304d84651ce27e8bd537`.
- Branch: `codex/repair-installation-boundaries`.
- ACF worktree was clean at baseline.
- The built registry is stale for `.codex/skills/design-operational-boundaries/agents/openai.yaml`.
- The downstream installation is committed at `4f0a710943f22cc52330fc0d1093b59e51b32f0a` on `codex/install-acf`.
- The downstream Oxfmt profile rejects `.agent-context/**` and the managed `AGENTS.md` projection.

## Topology

Canonical skill and instruction sources flow through `registry/registry.source.json`, the registry builder, `registry/registry.json`, setup planning, transactional installation, the downstream lock, and doctor. Setup requests flow through the CLI, loopback server, install handler, HTTP response, and process shutdown. The codebase inventory fixture flows from the packaged skill into its temporary validation copy.

## Slice

1. Repair the registry and fixture package, add one-shot setup behavior with focused tests, add the explicit freshness gate, rebuild projections, commit, upgrade the downstream fixture, and run final acceptance once.

## Replacements

- Replace the distributed `ignored.tmp` fixture with temporary validator creation.
- Replace signal-only setup completion for automation with an opt-in applied-result completion path.
- Replace implicit registry freshness through the broad test suite with an explicit CI command.

## Non-goals

- Do not change the default interactive setup server lifetime.
- Do not add automatic retries or credential management.
- Do not weaken source hashes, protected instructions, or target application verification.
- Do not push or deploy.

## Propagation

- Setup CLI parser, help, server options, running server contract, request lifecycle, and setup tests.
- Codebase inventory fixture source, validator, registry hashes, governance data, and installation expectations.
- Registry revision, durable decision, generated registry, and explicit CI gate.
- Downstream `.agent-context` and `.codex` projections, Oxfmt ownership configuration, lock, doctor, and final acceptance fixture.

## Preservation map

| Behavior | Disposition | Observation | Grace path |
| --- | --- | --- | --- |
| Registry source hashes fail closed | Retained | `pnpm registry:check` and installer plan tests | Stop the release and rebuild the registry |
| Interactive setup stays open until a signal | Retained as default | Existing signal-shutdown tests | Use one-shot mode for automated installation |
| Blocked setup remains recoverable | Retained | Focused blocked-install test | Correct the selection and retry in the same server |
| Successful automated setup exits cleanly | Added | One-shot lifecycle test | A signal still closes the server if no install completes |
| Inventory reports Git-ignored paths | Retained | Fixture validator | Create the ignored test path in the temporary copy |
| Installed skill artifacts stage normally | Added | Registry and downstream scope checks | Installer reports any remaining ignored target |
| Project formatter continues checking application files | Retained | Downstream `bun run fmt:check` | Exclude only ACF's isolated managed tree |

## Verification evidence

- `pnpm registry:check` passed for registry 0.9.2 with 35 components.
- Repo-policy tests passed, 39 of 39.
- Dev-tooling focused projection and installer tests passed, 38 of 38 before the
  downstream preview. The migration-trigger repair then passed 28 of 28 focused
  projection and installer tests plus the dev-tooling typecheck.
- The actual downstream plan exposed that legacy marker spacing initially read
  as unchanged. No installation write ran. The projection hash now versions the
  marker format and the regression test covers legacy and already-canonical
  targets.
- The declared branch profile is blocked by four pre-existing broken links in
  `docs/adr/0027-portable-objective-orchestration.md`. The changed-file agent
  and agent-prose checks passed before that unrelated docs gate stopped the
  profile.

## Closure

| Field | Value |
| --- | --- |
| Status | `active` |
| Final revision | `uncommitted` |
| Durable destination | `registry/decisions/0.9.2-installation-boundaries.md` |
| Retention reason | Temporary implementation and verification state |
| Cleanup | Remove this record after durable evidence reaches the decision and handoff |
