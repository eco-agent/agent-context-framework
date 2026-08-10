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
| CSS profiles | Generic frontend and responsive-CSS components contain no Tailwind-specific commands, utilities, scripts, or references. `frontend-tailwind` explicitly selects the Tailwind instruction and skill closure. | Registry topology and skill sources |
| Project-owned seed | Add one `seed-file` artifact operation. It writes a missing target once, preserves an existing target, ignores later content drift and upstream seed changes, and never removes the project-owned file. | Installer contract and planner |
| Operator disclosure | Help, inspect, dry-run, and setup UI expose direct versus transitive components, installed footprint, drift, required capabilities, and dormant hook behavior. | CLI and setup UI |

## State

- Audit and owner discovery are complete.
- Implementation and focused verification are in progress.
- No push or deployment is authorized.

## Topology

```text
project policy ----------------------> declared contract paths
      |                                         |
      v                                         v
seed-file ownership                    installed core instructions

frontend ----------------------------> neutral responsive CSS skill
      |
      +-- frontend-tailwind ----------> Tailwind instruction + skill

registry + project state ------------> inspect / dry-run / setup disclosure
```

## Slice

1. Introduce and prove the `seed-file` state model across decode, projection,
   planning, locking, doctor, update, removal, recovery, and registry generation.
2. Add exact project contract declarations and strengthen focused verification
   language in canonical installed instructions.
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
- No claim that repository-context or hooks universally improve productivity;
  their bounded capabilities and activation conditions must be stated.

## Propagation

- Artifact union, strict decoder, registry builder input, installer planner,
  projection, lock assessment, doctor, generated registry, and focused tests.
- Repository-policy schema, generated seed, installed core/verification sources,
  and semantic governance checks.
- Generic and Tailwind instruction sources, skill assets and metadata, component
  dependencies, hashes, licenses, notices, and exact-closure tests.
- CLI parser and help, inspect/dry-run contracts, setup server, setup client, and
  focused operator tests.

## Verification evidence

- Pending focused owner checks. Broad acceptance remains outside this bounded
  correction pass unless explicitly requested as the final acceptance contract.
