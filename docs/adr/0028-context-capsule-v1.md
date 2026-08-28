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
agent-context capsule diff
agent-context capsule extract
```

`build` writes one new capsule through an atomic exclusive write. It does not
overwrite an existing file. `list`, `inspect`, `verify`, and `diff` do not write.
`materialize` writes verified skill files and their receipt through the project
transaction. `extract` writes the verified source tree to an explicit new
directory. It never projects installation targets or replaces an existing
directory.

Semantic diff reports direct-selection, component revision, and source-entry
changes. Fresh installations add `*.acf binary` to `.gitattributes`. An existing
project migration must add the same rule without replacing project-owned
attributes. The generated capsule fixture proves that Git treats the tracked
capsule as binary.

### Initial skill materialization

Codex scans `.agents/skills` in repository directories. ACF maps each selected
whole-file skill artifact to a content-addressed direct child named
`<skill>@<component-digest>` below `.agents/skills`. The file's path inside that
child stays the same. The capsule keeps its original source and artifact paths,
so the receipt records both the source path and the mapped target path.

The ignored receipt at `.agent-context/materialization.json` records the capsule
and tree digests, registry revision, artifact identity, component, source path,
target path, installed digest, and byte count for every generated file. It omits
timestamps, absolute paths, process identifiers, and host data.

Materialization may create an absent projection, reuse an exact projection, or
replace a valid receipt-owned projection. It blocks when the receipt is missing
or malformed, a generated file was changed, an unexpected path exists inside a
generated skill, or a path traverses a symbolic link. The tracked expanded skill
remains the installation oracle during this side-by-side checkpoint.

The context transaction claims its staging directory exclusively. Replacement
writes every new content-addressed file, publishes the new receipt, then removes
files owned only by the previous receipt. A process failure before the receipt
leaves the previous projection intact. A failure after the receipt may leave the
old complete skill beside the new one until transaction recovery finishes. Codex
must start only after materialization or recovery completes. Empty old
directories may remain, but without `SKILL.md` they are not skill projections.

### Reserved lock v3

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
  ]
}
```

This ADR reserves the shape. The first implementation checkpoint does not write
lock v3.

`compressedBytes` counts the complete capsule file, including the eight-byte
header. `expandedBytes` counts the decoded source-entry bytes, not the canonical
JSON payload. These names remain stable when compression settings change.

## Ownership and recovery

| Owner | Boundary | Observation | Recovery |
| --- | --- | --- | --- |
| Registry resolver | Select the exact dependency closure | Resolved component names and revisions | Reject an unknown component or dependency cycle |
| Capsule builder | Include exact verified source bytes once | Repeated builds produce the same file digest | Stop on source drift, duplicates, or nondeterminism |
| Capsule reader | Expose only a completely verified capsule | Canonical payload, tree hash, entry hash, and closure checks | Reject without writing |
| Existing installer | Keep lock v2 and expanded files authoritative during equivalence work | Existing installer and recovery tests | Leave the capsule beside the installation |
| Downstream fixture | Prove current installed scopes from capsule entries | Clean revision before and after verification | Report exact mismatches and leave the fixture unchanged |
| Project developer | Keep custom work outside generated materialization paths | Git status and materialization receipt | Promote the change into project-owned policy or a local component |

## Later migration

After side-by-side equivalence and initial skill materialization pass, later
checkpoints may:

1. Publish capsule and lock v3 through one transaction.
2. Introduce the stable built-in bootstrap and packaged startup runtime.
3. Move runtime source to ignored immutable output.
4. Retain startup files and project controls as tracked files.
5. Migrate existing lock-v2 projects only when every managed file matches its
   recorded provenance.
6. Connect capsule updates to a multi-repository manager.

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
7. An exact materialization rerun writes nothing. A different capsule publishes
   complete content-addressed output before removing the prior receipt-owned
   files. Interrupted replacement remains recoverable.
8. A modified file, unexpected path, malformed receipt, or symbolic link blocks
   replacement.
9. The existing installer and transaction suites still pass.

## Implementation references

Node's [Brotli documentation](https://nodejs.org/api/zlib.html) defines the
explicit mode, quality, window, and size-hint parameters used by the builder.
Git's [attributes documentation](https://git-scm.com/docs/gitattributes)
defines the `binary` macro as disabling text conversion, text diff, and merge.
The [official OpenAI skills documentation](https://learn.chatgpt.com/docs/build-skills)
defines `.agents/skills` as the repository skill discovery location.
