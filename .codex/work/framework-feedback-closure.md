# Work record: framework feedback closure

## Outcome

Close the contract and operator-surface defects found while installing and using
the full framework in `frontend-lib`. The result must make project contracts
discoverable, require focused verification for code changes, keep plain CSS free
of Tailwind assumptions, model project-owned policy as seed-once ownership, and
explain the real installed closure before an operator applies it.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Worktree | Implement on `codex/framework-feedback-closure`, based on clean setup-UI head `fb040d63bd8739a3082b38030a465a5ec9b3b9ce`. | Git |
| Registry revision | Advance `0.5.2` to `0.6.0`; preserve schema version 2 unless the strict registry contract itself requires a schema break. | Registry governance |
| Project contract discovery | Repository policy declares exact project contract paths. Installed core instructions require reading those declared contracts before implementation. | Repository policy and core instructions |
| Verification default | Code changes require the narrowest applicable type and behavior checks. Read-only work is exempt; browser, computer control, and broad repository gates remain request- or acceptance-owned. | Core and verification instructions |
| Protected baseline | Required framework instructions are maintainer-owned canonical policy. Project contracts may add narrower local detail, but neither local edits nor component/profile composition may remove, override, or weaken the protected rules. | Maintainer-owned instruction sources and semantic governance |
| CSS profiles | Generic frontend and responsive-CSS components contain no Tailwind-specific commands, utilities, scripts, or references. `frontend-tailwind` explicitly selects the Tailwind instruction and skill closure. | Registry topology and skill sources |
| Project-owned seed | Add one `seed-file` artifact operation. It writes a missing target once, preserves an existing target, ignores later content drift and upstream seed changes, and never removes the project-owned file. | Installer contract and planner |
| Operator disclosure | Help, inspect, dry-run, and setup UI expose direct versus transitive components, installed footprint, drift, required capabilities, and dormant hook behavior. | CLI and setup UI |

## State

- Audit and owner discovery are complete.
- The bounded correction slices and their focused verification are complete.
- Registry revision `0.6.0` contains 29 governed components and passes generation
  and exact-closure checks.
- Broad acceptance and live-browser visual review were not run in this bounded
  pass; those gates remain explicitly request-owned.
- No push or deployment is authorized.

## Topology

```text
project policy ----------------------> declared contract paths
      |                                         |
      v                                         v
seed-file ownership                    installed core instructions

skill-responsive-css-architect ------> neutral responsive CSS workflow

frontend-tailwind -------------------> frontend + responsive skill
      |
      +------------------------------> Tailwind instruction + skill

registry + project state ------------> inspect / dry-run / setup disclosure
```

## Slice

1. Introduce and prove the `seed-file` state model across decode, projection,
   planning, locking, doctor, update, removal, recovery, and registry generation.
2. Add exact project contract declarations and strengthen focused verification
   language in canonical installed instructions. Bind protected core rules to a
   semantic governance gate owned by maintainers.
3. Split Tailwind-specific instruction and skill content from the generic CSS
   profile, then prove both exact closures semantically.
4. Expose an operator plan and status model through CLI help, inspect, dry-run,
   and the existing localhost setup UI.
5. Audit each feedback claim against code and focused evidence before closure.

## Replacements

- Replace the policy-file doctor exception with explicit seed-once semantics.
- Replace generic Tailwind assumptions with an explicitly selected Tailwind
  component closure.
- Replace request-only test wording with a code-change-specific focused default.
- Replace raw component selection and shallow inspection with a resolved plan and
  operational disclosure.

## Non-goals

- No objective kernel, scheduler, queue, database, task envelope, binding
  producer, long-running agent loop, Codex SDK workflow, push, or deployment.
- No host package manifest or application dependency changes.
- No compatibility layer, dual artifact representation, or inferred repository
  policy.
- No project-level mechanism for disabling, replacing, or weakening protected
  framework instructions. Local project rules are additive or more restrictive.
- No claim that repository-context or hooks universally improve productivity;
  their bounded capabilities and activation conditions must be stated.

## Propagation

- Artifact union, strict decoder, registry builder input, installer planner,
  projection, lock assessment, doctor, generated registry, and focused tests.
- Repository-policy schema, generated seed, installed core/verification sources,
  maintainer ownership declarations, and semantic anti-dilution governance checks.
- Generic and Tailwind instruction sources, skill assets and metadata, component
  dependencies, hashes, licenses, notices, and exact-closure tests.
- CLI parser and help, inspect/dry-run contracts, setup server, setup client, and
  focused operator tests.

## Verification evidence

- Both responsive-CSS skills passed the skill package validator. A bounded
  forward-use exercise kept the plain-CSS workflow neutral and selected the
  Tailwind-only references, helper, plugins, and operating model only for the
  explicit Tailwind workflow.
- Repository-policy contract and doctor tests passed `7/7`. Seed projection and
  installer lifecycle tests passed `24/24`; the isolated repository-policy suite
  passed `29/29`.
- Component-plan installer and CLI tests passed `19/19`; the focused dormant-hook
  disclosure assertion passed `1/1`.
- `pnpm registry:build` and `pnpm registry:check` passed for revision `0.6.0`.
  The integrated registry, policy, Codex-agent, and Codex-runtime selection set
  passed `21/21`, including instruction anti-dilution, neutral/Tailwind closure,
  seed-file behavior, non-Node installation, licensing/notices, and Wave 4
  exclusion assertions.
- Localhost setup-server tests passed `3/3`. Dev-tooling and setup-UI TypeScript
  checks passed. The setup package now invokes the repository's pinned Vite Plus
  `vp` executable; its production bundle completed successfully (22 modules,
  209.83 kB JavaScript before gzip). A focused review also found and closed the
  stale-preview race: installation now requires a ready preview whose canonical
  selection key exactly matches the current selection.
- Broad acceptance and downstream fixture migration remain outside this bounded
  correction pass unless explicitly requested as the final acceptance contract.
