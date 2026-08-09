# Type contract: Phase 10 closure

## Domain concepts

- **Registry revision** identifies one complete generated registry release.
- **Component revision** identifies the normalized contract and canonical bytes of
  one component within that registry.
- **Preserving update** accepts upstream-only changes and retains project-only
  changes; divergence is a blocking outcome.
- **Overwrite update** is an explicit command that accepts the selected registry
  scopes even when their installed content is locally modified or diverged.
- **Ownership scope** is the exact whole file, marked section, TOML member/table,
  JSON member, or identified JSON array item declared by an artifact.

## Valid states

```ts
type UpdateIntent =
  | { kind: "update"; mode: "preserve-local"; components: ReadonlySet<string> }
  | { kind: "update"; mode: "overwrite-selected"; components: ReadonlySet<string> };
```

- A component is valid only when it has a name, a content-addressed revision,
  dependencies, capabilities, licenses, and artifacts.
- A component revision is valid only in `sha256:<64 lowercase hex>` form.
- Overwrite is valid only for `update`; it cannot combine with read-only commands,
  add, remove, init, recovery, or runtime bootstrap.
- Overwrite applies only to components in the resolved selected update closure.
- Unrelated bytes outside an artifact ownership scope are never overwrite targets.

## Invalid states excluded at boundaries

- Registry components without revisions or with malformed revisions.
- Future or prior schema versions decoded as the current contract.
- `--overwrite` on any command other than update.
- Diverged selected artifacts represented as ready during a preserving update.
- Unselected or unrelated scopes changed by an overwrite update.
- Component bytes changing while their derived component revision remains equal.

## Transitions

| Current assessment | Preserving update | Overwrite update |
| --- | --- | --- |
| `unchanged` | retain | retain |
| `uninstalled` | install selected scope | install selected scope |
| `upstream-changed` | replace selected scope | replace selected scope |
| `locally-modified` | retain local scope | replace selected scope |
| `diverged` | block | replace selected scope |
| `untracked-conflict` | block | block; overwrite has no prior ownership authority |

## Trust boundaries

- JSON registry, project config, lock, and transaction journal values remain
  untrusted until decoded by the existing strict decoders.
- CLI tokens remain untrusted until parsed into the discriminated command union.
- Canonical component bytes are read and hashed once by the registry builder.
- Planner inputs are trusted decoded contracts; projection implementations remain
  the sole owners of format-specific replacement behavior.

## Failure semantics

- Malformed registry/component revisions and invalid CLI flag combinations throw
  at their input boundaries.
- Expected local/upstream/diverged states remain typed plan assessments.
- Preserving divergence returns a blocked plan; explicit overwrite returns ready
  only when all other ownership and path-safety checks pass.
- Transaction interruption remains recoverable through the existing journal and
  `recover` command.

