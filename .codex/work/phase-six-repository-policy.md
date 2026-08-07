# Work record: Phase 6 repository policy

## Outcome

Package Wave 3 repository policy as project-owned source backed by the isolated
runtime. Installation must materialize only the runtime foundation and policy
package, an explicit project policy configuration, a preserved-invariant
manifest, canonical instructions, and a narrow command wrapper. Repository
facts and verification profiles remain project decisions; inspection reports
observations but never promotes them into policy.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/phase-six-repository-policy` in `D:\dev\agent-context-framework-phase6`, based on completed Phase 5 head `785b8a4a8f569f4b5d440b62eb6b6939dd0c64a9`. | Git |
| Reuse | Reuse the Phase 5 runtime, bootstrap, registry materializer, context decoders, filesystem boundaries, and host policy's tokenized command-execution pattern. Add no second installer or runtime graph. | Existing owners |
| Component graph | Add internal `runtime-base` for runtime root files and `shared`; add public `repository-policy` depending on `core` and `runtime-base` for policy source and project-facing artifacts. | Registry |
| Runtime membership | Extend registry authoring with a typed `runtime-directory` declaration that expands to exact per-file `runtime-workspace` artifacts. | Registry builder |
| Partial runtime | Build and doctor the runtime packages actually materialized. The framework checkout still contains and verifies all four Phase 5 packages; a Wave 3 installation contains only `shared` and `policy`. | Runtime scripts |
| Policy configuration | Install `.agent-context/policy.json` in the valid `unconfigured` state. Only an explicit project edit may create the `configured` state. | Project policy |
| Repository facts | Configured policy names repository type, languages, documentation roots, package manager presence, layout, and frontend presence exactly once. | Project policy |
| Verification profiles | A configured project declares tokenized commands and named profiles explicitly. Profiles select command identifiers; registry data never supplies commands. | Project policy |
| Command execution | Execute either a process argument vector or a named package script through the declared versioned package manager, with no user-authored shell command string. Bound timeout values by Node's timer maximum and report failed or timed-out commands as typed outcomes. | Policy runtime |
| Inspection | Report observable root/package/language/documentation markers only. Do not write configuration or claim that an observation is a policy decision. | Policy runtime |
| Invariants | Install a fixed manifest naming the explicit-facts, explicit-profiles, observation-only, and tokenized-command invariants; policy doctor validates the exact manifest. | Policy runtime |
| Bootstrap | Component installation materializes source only. Existing `bootstrap-runtime` remains the sole fixed install/build operation, and doctor reports non-operational runtime states. | Development installer |
| Registry revision | Advance the governed registry to `0.4.0` with a named Wave 3 decision and protected repository-policy instructions. | Registry governance |

## State

- Baseline `785b8a4a8f569f4b5d440b62eb6b6939dd0c64a9` completes and hardens Phase 5.
- Registry `0.3.0` contains 22 Wave 1 and Wave 2 components.
- `runtime-workspace` is already a built-registry artifact operation, but the
  source catalog cannot yet expand a directory into that operation.
- The isolated runtime currently builds and doctors the exact four-package
  development checkout; packaged Wave 3 policy needs the same scripts to work
  with only `shared` and `policy` present.
- Existing host `tools/repo-policy` contains useful verification patterns but
  is coupled to objective contracts and framework-specific checks. It is a
  reference owner, not a package to distribute.

## Topology

```text
agent-context add repository-policy
├── core
├── runtime-base
│   └── .agent-context/runtime/{root files, shared}
└── repository-policy
    ├── .agent-context/runtime/packages/policy
    ├── .agent-context/policy.json
    ├── .agent-context/policy-invariants.json
    ├── .agent-context/policy.mjs
    └── AGENTS.md repository-policy section

.agent-context/policy.mjs
└── runtime policy CLI
    ├── inspect: observations only
    ├── doctor: runtime/config/invariant/context health
    └── verify: selected configured profile
        └── tokenized project-owned commands
```

`codex-hooks`, `codex-repo-context`, and their runtime packages remain outside
the resolved Wave 3 component graph.

## Slice

1. Make the Phase 5 runtime root build and doctor the packages that are present
   while preserving the exact four-package development proof.
2. Add the strict policy configuration, invariant manifest, inspection, doctor,
   verification, and command-execution contracts to the isolated policy package.
3. Add `runtime-base` and `repository-policy` to registry `0.4.0` using exact
   runtime-workspace artifacts and project-facing policy files.
4. Propagate runtime and policy health into installer doctor without mutating or
   bootstrapping during ordinary component installation.
5. Prove independent materialization and execution in non-Node and configured
   TypeScript fixtures, then validate clean Control Tower without mutation.

## Replacements

- Replace the fixed all-four-package build/doctor assumption with installed
  package discovery owned by the runtime root scripts.
- Replace framework-specific verification-profile assumptions with an explicit
  project-owned policy configuration.
- Replace direct host policy entry points for downstream use with the installed
  `.agent-context/policy.mjs` wrapper.

## Non-goals

- No `codex-agents`, `codex-hooks`, `codex-repo-context`, or `codex-runtime`
  registry components.
- No `.codex/config.toml` or `.codex/hooks.json` mutation.
- No hook or repository-context runtime package in a Wave 3 installation.
- No objective kernel, scheduler, lease, queue, database, task envelope,
  orchestration loop, or objective fixture.
- No frontend, host package graph, deployment, publication, or push.
- No automatic conversion of inspection observations into policy decisions.

## Propagation

- Registry authoring kind, builder expansion, built artifact decoding, lock
  provenance, installer ownership, update/remove behavior, and registry tests.
- Runtime root build, clean, doctor, isolation gate, package-graph tests, and
  bootstrap status decoding.
- Policy configuration decoder, invariant decoder, repository inspection,
  context health, command execution, CLI output, wrapper forwarding, and tests.
- Installer doctor types, CLI formatting, runtime status, policy status, and
  clean/non-Node fixtures.
- Canonical instruction source, framework projection, governance hashes,
  decision record, registry revision, and clean Control Tower installation.

## Verification evidence

- Pending implementation.
