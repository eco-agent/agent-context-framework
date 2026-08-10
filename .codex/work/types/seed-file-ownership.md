# Type architecture contract: seed-file ownership

## Domain concepts

- `seed-file` artifact: canonical starter bytes offered on a component's first
  installation.
- Installation membership: whether the component is present in the project's
  prior framework lock.
- Project-owned target: a target whose content and continued existence are under
  project authority after the component is installed.
- Framework mutation: a planned filesystem write or removal that participates in
  the existing transaction and rollback boundary.

## Valid states

| Component membership | Target state | Operation | Valid result |
| --- | --- | --- | --- |
| Not installed | Missing | Add/install | Write canonical seed and add component membership. |
| Not installed | Present, any bytes | Add/install | Preserve bytes and add component membership. |
| Installed | Missing | Diff/update/doctor | Preserve absence; report artifact ownership current while policy readiness may report the missing project contract separately. |
| Installed | Present, any bytes | Diff/update/doctor | Preserve bytes and report artifact ownership current. |
| Installed | Missing or present | Remove | Change membership only; never create, edit, or delete target. |
| Removed, then selected again | Missing | Add/install | Write the current canonical seed as a new installation. |
| Removed, then selected again | Present, any bytes | Add/install | Preserve bytes and add membership. |

## Invalid states to exclude

- Treating a project edit as framework drift.
- Updating or overwriting a seed target because canonical seed bytes changed.
- Recreating a project-deleted seed target during update or doctor repair.
- Deleting a seed target when the component is removed.
- Letting `--overwrite` expand authority over a project-owned seed target.
- Allowing a second artifact to claim the same target or nested ownership scope.
- Special-casing `.agent-context/policy.json` outside the artifact operation.

## Allowed transitions

```text
unselected + missing --install--> selected + seeded
unselected + present --install--> selected + preserved
selected + any target state --update--> selected + same target state
selected + any target state --remove--> unselected + same target state
unselected + any target state --re-add--> selected + seed-if-missing
```

## Trust boundaries

| Boundary | Untrusted representation | Validation/parser | Trusted representation |
| --- | --- | --- | --- |
| Registry JSON | Artifact object with operation/source/target | Existing strict artifact decoder extended with one exact `seed-file` variant | `SeedFileArtifact` |
| Project filesystem | Missing file, arbitrary bytes, directory, or symlink at target | Existing target safety, root-containment, symlink, and collision checks | Safe target state for planning |
| Existing project lock | Parsed registry/component/artifact membership | Existing strict lock decoder and component resolution | Prior installation membership |

## Representations and conversions

| Representation | Guarantee | Converts to/from |
| --- | --- | --- |
| `SeedFileArtifact` | Exact `operation`, normalized source, and project-relative target | Registry source input and decoded registry JSON |
| Planner intent | Distinguishes new component installation from installed-component reconciliation | Resolved desired closure plus prior lock |
| Mutation plan | Contains a file write only for first installation when the target is missing | Existing transaction executor and rollback journal |
| Lock membership | Records component selection without asserting ownership of seed target bytes | Existing lock generation and diff inspection |

## Failure semantics

- Expected outcomes: existing target preserved; project edit, deletion, or seed
  revision ignored; remove retains target.
- Exceptional failures: invalid registry shape, unsafe target, target directory or
  symlink collision, source hash mismatch, or transactional write failure.
- Translation boundaries: decoder errors remain registry contract errors; target
  safety and write failures remain installer plan/transaction errors.

## Public contracts affected

- `ContextArtifact` and registry builder artifact input unions.
- Artifact identity, collision, projection, planning, diff, doctor, update,
  overwrite, removal, recovery, and lock generation.
- `repository-policy` artifact declaration for `.agent-context/policy.json`.

## Decisions and rejected alternatives

- Use an explicit artifact operation instead of a path-specific doctor exception;
  semantics belong to the registry contract, not the filename.
- Preserve deletion during installed-component updates because project ownership
  includes authority over existence. Repository-policy readiness may still report
  that its required contract is unavailable.
- Keep the component in the lock even when no target mutation occurred; the lock
  records selected framework behavior, not ownership of project bytes.
- Reject treating the artifact as an ordinary file with an `ignoreDrift` flag;
  that would permit contradictory ownership combinations and retain overwrite and
  removal hazards.

## Verification evidence

- Pending focused decoder, projection, installer, recovery, doctor, registry
  builder, and repository-policy tests.
