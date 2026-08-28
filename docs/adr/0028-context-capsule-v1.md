# ADR-0028: Context capsule v1

**Status:** Accepted

**Date:** 2026-08-28

**Decision owner:** Framework maintainer

## Context

An installed ACF component selection currently expands every framework-owned
skill, runtime source, licence, attribution, and support file into the consuming
repository. This makes a clone self-contained, but ordinary framework updates
fill the product repository's Git diff with framework implementation files.

The complete registry at revision 0.13.0 contains 233 unique source files and
about 966 KB of uncompressed bytes. A representative project selection contains
79 files and about 260 KB. Compression reduces that selection to about 66 KB.
Repository storage is not the problem. Review noise is.

Codex must still read `AGENTS.md`, project configuration, hooks, and agent role
files before or during session startup. Project policy and component selection
must remain directly reviewable. A compressed file cannot replace those startup
and project-owned files.

## Decision

Add one content-addressed capsule for the resolved component closure while
retaining the expanded activation and project control files.

Capsule work proceeds through an equivalence checkpoint. The framework first
builds and inspects capsules beside the current expanded installation. Lock v2
and current installer behavior remain authoritative until a generated downstream
application proves that the capsule reconstructs every selected artifact scope.

### Binary representation

Capsule v1 is one binary file:

1. Eight ASCII bytes containing `ACFCAP1` followed by a line feed.
2. A Brotli-compressed UTF-8 JSON payload.

The builder uses the pinned Node runtime's built-in Brotli encoder. ACF adds no
archive or canonical-JSON dependency. The payload uses these canonical rules:

- Object keys sort by Unicode code point.
- Arrays retain their declared semantic order.
- Direct components retain project configuration order.
- Resolved components retain dependency-first resolver order.
- Entries sort by normalized source path.
- Numbers are finite safe integers.
- Serialization contains no insignificant whitespace.
- Timestamps, host paths, random identifiers, and operating-system metadata are
  forbidden.

The capsule file SHA-256 covers the magic bytes and compressed bytes. The tree
SHA-256 covers canonical component metadata and entry metadata. Each entry also
stores and verifies the SHA-256 and byte count of its decoded source bytes.

### Payload schema

```ts
interface ContextCapsulePayloadV1 {
  schemaVersion: 1;
  format: "acf-capsule-v1";
  frameworkRevision: string;
  registry: {
    schemaVersion: 2;
    revision: string;
    decisionPath: string;
  };
  selection: {
    directComponents: string[];
    resolvedComponents: ContextRegistryComponent[];
  };
  entries: Array<{
    sourcePath: string;
    sourceSha256: string;
    byteLength: number;
    contentBase64: string;
  }>;
  treeSha256: string;
}
```

The selected component definitions retain dependency, capability, licence, and
artifact metadata. Every artifact source path must resolve to exactly one capsule
entry with the registry-declared hash. Extra components, unresolved dependencies,
duplicate paths, invalid Base64, unsafe paths, hash mismatches, and noncanonical
payload bytes invalidate the whole capsule.

### Semantic operations

The initial command set is read-mostly:

```text
agent-context capsule build
agent-context capsule list
agent-context capsule inspect
agent-context capsule verify
agent-context capsule materialize
agent-context capsule migrate
agent-context capsule update
agent-context capsule diff
agent-context capsule extract
```

`build` writes one new capsule through an atomic exclusive write. It does not
overwrite an existing file. `list`, `inspect`, `verify`, and `diff` do not write.
`materialize` writes verified skill and runtime files with their receipt through
the project transaction. `migrate` removes verified v2 tracked materialization
targets and replaces lock v2 with lock v3. `extract` writes the verified source
tree to an explicit new directory. It never projects installation targets or
replaces an existing directory.

`update` accepts a current lock-v3 installation. It verifies the installed
activation and ignored materialization, builds the selected closure from the
current framework registry, and reuses the structured projection planner for
tracked activation changes. Project-owned portions of shared files remain in
place. Locally changed ACF-owned activation blocks. One binary-safe context
transaction writes activation changes first, the capsule second, and lock v3
last. Recovery completes the tracked set before bootstrap reconciles ignored
materialization.

Semantic diff reports direct-selection, component revision, and source-entry
changes. Fresh installations add `*.acf binary` to `.gitattributes`. An existing
project migration must add the same rule without replacing project-owned
attributes. The generated capsule fixture proves that Git treats the tracked
capsule as binary.

### Ignored materialization

Codex scans `.agents/skills` in repository directories. ACF maps each selected
whole-file skill artifact to an ACF-owned content-addressed direct child named
`acf--<skill>--<component-digest>` below `.agents/skills`. The file's path inside
that child stays the same. The capsule keeps its original source and artifact
paths, so the receipt records the component revision, skill name, owned root,
source path, and mapped target path.

Selected runtime artifacts map below
`.agent-context/runtime/materialized/<capsule-tree-digest>`. The digest keeps one
capsule's runtime files separate from another capsule's files. Runtime paths
retain their component-relative layout below that directory. This includes the
prebuilt repository-context and hook entrypoints, so a fresh clone needs no
project package install or TypeScript compiler.

The schema-v2 ignored receipt at `.agent-context/materialization.json` records
the capsule and tree digests, registry revision, artifact identity, component,
source path, target path, installed digest, and byte count for every generated
file. Skill entries also record the skill name and owned skill root. It omits
timestamps, absolute paths, process identifiers, and host data.

Materialization may create an absent projection or reuse an exact projection. It
blocks when the receipt is missing or malformed, a generated file was changed,
an unexpected path exists inside a generated skill, a path traverses a symbolic
link, or the requested capsule differs. Runtime verification checks every file
owned by the receipt but leaves runtime state outside the content-addressed tree
alone. The ignored receipt cannot authorize
deletion by itself. Replacement waits until lock v3 or retained tracked capsule
state proves the old ownership. The tracked expanded installation remains the
oracle until migration starts.

After migration, a committed lock-v3 change authorizes reconciliation to its
capsule. Materialization first verifies every prior receipt-owned file. It then
writes the new content-addressed files, publishes the new receipt, and deletes
only exact old files absent from the desired projection. A missing or modified
old file blocks before writing. Transaction recovery completes an interrupted
replacement before another bootstrap attempt.

The context transaction claims its staging directory exclusively. Initial
materialization writes verified files and publishes the receipt last. A process
failure can leave a partial new directory until transaction recovery finishes.
The tracked `.agent-context/bootstrap.mjs` bundle resumes or discards a safe
transaction before it reads the capsule. A blocked transaction fails the process.
The bundle also requires Git to ignore every generated skill file, runtime file,
and the receipt before it writes. A missing ignore rule returns exact conflicts.

The bundle is reproducible from a dedicated TypeScript entry with the pinned
`vite-plus` packer. It uses Node and Git, with no package install in the project.
The reliable explicit fresh-clone command is
`node .agent-context/bootstrap.mjs materialize`. The repository-context MCP and
Codex hooks call the same bootstrap with `exec repo-context` and `exec hook`.
Those launchers verify and materialize before starting their packaged runtime.
They write no bootstrap status to standard output because both child protocols
own that stream. On lock v2, `exec` starts the existing tracked runtime path so
installing the new launcher does not break projects before migration. Git has no
portable post-clone mechanism that can guarantee
materialization before every other tool, so the explicit command remains the
general startup path.

### Lock v3

Lock v3 stays concise because the capsule owns full component and artifact
metadata:

```json
{
  "schemaVersion": 3,
  "registryRevision": "0.14.0",
  "frameworkRevision": "<40-character Git revision>",
  "capsule": {
    "format": "acf-capsule-v1",
    "path": ".agent-context/capsule.acf",
    "sha256": "<64 hexadecimal characters>",
    "treeSha256": "<64 hexadecimal characters>",
    "compressedBytes": 0,
    "expandedBytes": 0,
    "entryCount": 0
  },
  "components": {
    "direct": ["core"],
    "resolved": [
      {
        "name": "core",
        "revision": "sha256:<64 hexadecimal characters>"
      }
    ]
  },
  "activation": [
    {
      "identity": "text-section:AGENTS.md:core",
      "targetPath": "AGENTS.md",
      "installedSha256": "<64 hexadecimal characters>"
    }
  ],
  "materialization": {
    "capsuleSha256": "<64 hexadecimal characters>",
    "treeSha256": "<64 hexadecimal characters>",
    "files": [
      {
        "identity": "file:.codex/skills/diagnose/SKILL.md",
        "targetPath": ".agents/skills/acf--diagnose--<component digest>/SKILL.md",
        "installedSha256": "<64 hexadecimal characters>"
      }
    ]
  }
}
```

The migration command writes this shape after it proves the v2 installation and
the ignored materialization against the same capsule.

`compressedBytes` counts the complete capsule file, including the eight-byte
header. `expandedBytes` counts the decoded source-entry bytes, not the canonical
JSON payload. These names remain stable when compression settings change.
`activation` records tracked expanded projections. `materialization` records
ignored generated ownership separately. Replacement must derive the expected
materialization records from the verified capsule. It must not compare a lock's
records with themselves.

## Ownership and recovery

| Owner | Boundary | Observation | Recovery |
| --- | --- | --- | --- |
| Registry resolver | Select the exact dependency closure | Resolved component names and revisions | Reject an unknown component or dependency cycle |
| Capsule builder | Include exact verified source bytes once | Repeated builds produce the same file digest | Stop on source drift, duplicates, or nondeterminism |
| Capsule reader | Expose only a completely verified capsule | Canonical payload, tree hash, entry hash, and closure checks | Reject without writing |
| Existing installer | Keep lock v2 and expanded files authoritative during equivalence work | Existing installer and recovery tests | Leave the capsule beside the installation |
| Downstream fixture | Prove current installed scopes from capsule entries | Clean revision before and after verification | Report exact mismatches and leave the fixture unchanged |
| Migration planner | Replace only exact v2 whole-file skill and runtime projections | v2 projection proof, current ignored projection, and lock-v3 rerun | Report exact conflicts before writing, or resume the recorded transaction |
| Plain-Node bootstrap | Verify lock v3, the capsule, and every tracked activation scope before materialization | Lock and projection verification in a fresh clone | Stop before materialization on any mismatch |
| Capsule updater | Publish activation, capsule, and lock as one recoverable tracked change | Structured projection plan and binary transaction journal | Block on local owned-scope edits, or recover the recorded transaction before retrying |
| Project developer | Keep custom work outside generated materialization paths | Git status and materialization receipt | Promote the change into project-owned policy or a local component |

## Materialization migration

Migration requires a side-by-side v2 installation with a verified capsule and
current ignored skill and runtime projection. It performs these steps:

1. Verify the capsule against the v2 lock, config, and every installed artifact
   scope.
2. Verify the ignored materialized files and receipt against the capsule.
3. Copy every non-materialized v2 ownership record into lock-v3 activation.
4. Derive lock-v3 materialization records independently from capsule bytes.
5. Write lock v3, then delete only the exact whole-file `.codex/skills` targets
   and runtime files proven by v2. Transaction recovery completes that order
   after interruption.
6. Verify the migrated state again. A rerun writes nothing.

The migration does not build a missing capsule, bootstrap, or ignored projection
inside its transaction. Those side-by-side prerequisites keep the destructive
operation narrow. The `runtime-migrated` generated application proves both clean
and dirty v2 baselines, removes tracked runtime and skill files, deletes the
ignored output, and starts repo-context and hooks through the tracked bootstrap.

Later checkpoints may publish a new capsule, lock, runtime, skill projection,
and receipt in one transaction and connect updates to a multi-repository
manager.

No later checkpoint may infer permission to discard locally modified managed
files. A blocked migration reports the exact files and leaves the repository
unchanged.

## Alternatives rejected

- A Git submodule provides a separate history but adds clone initialization,
  revision coordination, and another repository trust boundary.
- A package-manager dependency omits the framework from an ordinary clone and
  makes startup depend on package installation.
- One archive per component produces more tracked files without a measured size
  or update benefit for the current closure.
- ZIP adds an archive dependency or more format code. Node already provides the
  required Brotli implementation.
- Shipping only prose summaries loses exact skill references, scripts, licences,
  and attribution evidence.
- Replacing expanded installation before equivalence would turn the migration
  itself into the only recovery mechanism.

## Acceptance evidence

Capsule v1 is not accepted until all of these conditions hold:

1. Repeated builds from the same registry, framework revision, and direct
   selection produce identical bytes.
2. The reader rejects corrupt compression, noncanonical payloads, unsafe paths,
   invalid Base64, entry hash drift, incomplete closure, and tree hash drift.
3. Semantic diff reports selection, component, and source-entry changes.
4. Extraction writes only verified source paths to a new directory.
5. The generated clean core application verifies every installed artifact scope
   from the capsule and remains at the same clean Git revision.
6. The generated skill fixture writes exact ignored `.agents/skills` bytes,
   retains tracked expanded bytes, and stays Git-clean.
7. An exact materialization rerun writes nothing. A different capsule blocks
   without lock-v3 authority. A matching current lock replaces exact prior output
   and removes obsolete receipt-owned files.
8. A modified file, unexpected path, malformed receipt, forged root mapping, or
   symbolic link blocks materialization.
9. The existing installer and transaction suites still pass.
10. The committed bootstrap bundle rebuilds byte for byte, runs with plain Node
    in a fresh fixture, recovers discardable staging, writes nothing on repeat,
    and fails closed on modified generated output or missing Git ignore rules.
11. The committed repo-context and hook bundles rebuild byte for byte. A migrated
    fresh clone recreates each ignored bundle through bootstrap before the MCP or
    hook protocol begins, with no tracked runtime files or package install.
12. Semantic diff reports whether changed startup activation, skills, or runtime
    require a Codex restart. Inspectable source-only changes do not invent one.
13. Capsule update writes activation changes, binary capsule bytes, and lock v3
    through one transaction. An interruption after capsule publication recovers
    the matching lock before bootstrap replaces ignored output.

## Implementation references

Node's [Brotli documentation](https://nodejs.org/api/zlib.html) defines the
explicit mode, quality, window, and size-hint parameters used by the builder.
Git's [attributes documentation](https://git-scm.com/docs/gitattributes)
defines the `binary` macro as disabling text conversion, text diff, and merge.
The [official OpenAI skills documentation](https://learn.chatgpt.com/docs/build-skills)
defines `.agents/skills` as the repository skill discovery location.
