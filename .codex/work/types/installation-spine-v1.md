# Installation spine v1 type contract

## Purpose

Install selected framework components into an ordinary repository without a
global configuration, model-authored rewriting, or implicit ownership. The
first vertical slice exposes `init`, `add`, and `diff`, installs the `core`
component into the clean Control Tower fixture, and records enough state to
detect drift before any later write.

## Trust boundaries

- Registry JSON, project configuration, and the installation lock are parsed
  from `unknown` exactly once. Unknown fields and invalid versions fail closed.
- Registry source paths and project target paths are untrusted. They must be
  relative, remain inside their declared root, and cannot traverse an existing
  symbolic-link ancestor.
- Registry source bytes are authoritative. The installer copies them exactly;
  it never asks a model to merge, summarize, or rewrite rules.
- The project owns its component selection and all text outside explicitly
  marked managed sections.
- The framework owns whole managed files and the contents between one exact
  pair of managed-section markers.

## Canonical states

### Registry artifact

```text
managed-file
  sourcePath + targetPath

managed-section
  sourcePath + targetPath + sectionId
```

The union is discriminated by `ownership`. A registry component has one name,
an explicit dependency list, and one or more artifacts. Component names and
section identifiers use a conservative lowercase identifier grammar.

### Project configuration

```text
schemaVersion: 1
adapter: codex
components: non-empty, unique component names
```

The configuration expresses desired state. It deliberately contains no
derived paths, hashes, timestamps, or optional feature bag.

### Installation lock

```text
schemaVersion: 1
registryRevision
components: resolved dependency order
artifacts: installed ownership + source + target + exact SHA-256
```

The lock expresses the exact framework bytes last installed. It contains no
timestamp so equivalent installations are byte-for-byte deterministic.

### Artifact assessment

Each desired artifact is exactly one of:

- `current`: installed bytes match both the lock and current registry source.
- `missing`: no owned artifact exists; installation may create it.
- `update`: current project bytes match the lock but registry bytes changed;
  installation may replace the owned bytes.
- `drift`: project-owned bytes differ from the lock; installation must stop.
- `unmanaged-conflict`: a whole-file target already exists without ownership;
  installation must stop.
- `malformed-section`: section markers are missing, duplicated, reversed, or
  present without a lock entry; installation must stop.

An obsolete lock artifact is reported as `stale`. V1 does not implement
component removal, so it is reported and never silently deleted.

### Installation plan

```text
ready   -> complete ordered writes + next deterministic lock
blocked -> one or more typed conflicts + no writes
```

Planning reads and validates every source and target before materialization.
Normal drift and ownership conflicts are data in a blocked result. Invalid
schemas, path escape, dependency cycles, duplicate targets, filesystem I/O,
and corrupt lock relationships are exceptional failures.

## State transitions

```text
uninitialized --init(core)--> configured + locked + installed
configured ----add(name)----> expanded configured + locked + installed
installed -----diff---------> current | actionable difference | conflict
installed -----init/add-----> no-op | safe update | blocked conflict
```

`init` is idempotent. If configuration already exists, it applies that desired
configuration rather than resetting component choices. `add` requires an
initialized project and appends a component before resolving dependencies.

## Ownership rules

- A managed file is adopted only when absent. An existing unowned file is a
  conflict, even if it happens to resemble the registry source.
- A managed section may be appended to an existing text file when neither
  marker is present. All pre-existing bytes remain outside the owned section.
- A later managed-file write is safe only when the target hash equals the
  previous lock hash.
- A later managed-section write is safe only when the bytes between its exact
  markers equal the previous lock hash.
- One target may contain several sections only when their section identifiers
  are distinct. A whole-file artifact and section artifact may never share a
  target.
- The lock is written last, after all planned artifact and configuration
  writes. A blocked plan performs no writes.

## Error ownership

| Failure | Owner | Representation |
| --- | --- | --- |
| Invalid registry/config/lock shape | Decoder | Exception with field context |
| Unknown component or dependency cycle | Resolver | Exception |
| Escaping or symlinked path | Path boundary | Exception |
| Locally edited managed bytes | Project/framework boundary | `blocked` conflict |
| Existing unowned whole-file target | Project/framework boundary | `blocked` conflict |
| Missing target or safe upstream update | Planner | `ready` write |
| Filesystem write failure | Materializer | Exception; lock remains unwritten |

## Public interface

The schema module exports exact decoders and domain types. The installer module
exports three task-level operations—`initProject`, `addComponent`, and
`diffProject`—plus the read-only planner for focused tests. CLI parsing and
console formatting remain a thin shell around those functions.

## Required verification

- exact schema decoding and unknown-field rejection
- dependency ordering, unknown dependencies, and cycles
- first install and deterministic lock
- second install produces no writes
- local prose outside a managed section survives
- safe registry update replaces only owned bytes
- managed drift blocks every write
- existing whole-file targets are not adopted
- malformed/duplicate markers block writes
- traversal and symbolic-link targets are rejected
- `init`, `add`, and `diff` CLI behavior
- installation into `D:/dev/control-tower-clean`, followed by a clean diff and
  applicable repository checks
