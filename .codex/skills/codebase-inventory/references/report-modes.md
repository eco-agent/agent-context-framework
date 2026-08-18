# Codebase Inventory Report Modes

All modes are implemented by `../scripts/codebase-meta.mjs` and share the same scan/filter options.

## Naming

- Skill/report names may be discussed in snake_case, e.g. `file_type_distribution`.
- CLI modes use kebab-case, e.g. `file-type-distribution`.

## Output rules

The basic result envelope schema lives at `references/result-envelope.schema.json`.

- The script always returns valid JSON.
- The script never returns prose.
- The agent may summarize JSON after execution, but the script output must remain machine-readable.
- Every mode includes top-level `schemaVersion`.
- Every mode includes top-level `mode`.
- Every mode includes top-level `warnings`.
- Every mode includes `scan.filtersUsed`.
- Every mode includes `scan.defaultExcludesApplied`.
- Every mode includes `scan.gitignoreApplied`.
- Every mode includes `scan.truncated`.
- Every mode includes `scan.symlinksFollowed`.
- Arrays are sorted deterministically.

## Shared scan options

```ts
type CodebaseScanOptions = {
  root: string;
  include?: string[];
  exclude?: string[];
  ignoreDefaults?: boolean;
  maxDepth?: number;
  extensions?: string[];
  includeHidden?: boolean;
  countBlankLines?: boolean;
  countCommentLines?: boolean;
  noGitignore?: boolean;
  maxFileSizeKb?: number;
  includeBinary?: boolean;
  top?: number;
  minLoc?: number;
  minFiles?: number;
  summaryOnly?: boolean;
  followSymlinks?: boolean;
};
```

Command flags:

```bash
--include "src/**,tests/**"
--exclude "fixtures/**,vendor/**"
--ignore-defaults
--max-depth 6
--extensions ".ts,.tsx,.css"
--include-hidden
--count-blank-lines
--count-comment-lines
--no-gitignore
--max-file-size-kb 512
--include-binary
--top 20
--min-loc 100
--min-files 2
--summary-only
--follow-symlinks
```

## Ignore behaviour

By default, the scanner:

- Applies built-in default excludes.
- Applies `.gitignore` rules from the repo root when available.
- Skips binary files.
- Skips files larger than `--max-file-size-kb`.
- Skips symlinks to avoid cycles and accidental traversal outside the repo root.

Use `--follow-symlinks` to traverse symlinks. Symlink targets outside the scan root are still skipped and reported with a warning.

Default excludes:

```txt
node_modules
.git
dist
build
coverage
.next
.nuxt
.turbo
.cache
bin
obj
.vscode
.idea
```

## Warnings

Warnings are machine-readable records for partial or imperfect scans. Common warning types:

```txt
gitignore_parse_failed
permission_denied
binary_file_skipped
max_file_size_exceeded
path_outside_root
unsupported_extension
symlink_skipped
```

## Default limits

- `loc-hotspots`: top 20 files and top 20 directories, unless `--top` is provided.
- `directory-complexity-summary`: top 30 directories, unless `--top` is provided.
- `file-type-distribution`: all matching directories unless `--top` is provided.
- `inventory`: all files/directories unless `--summary-only` is provided.

## Fixture validation

Run from the skill directory:

```bash
node ./scripts/validate-fixture.mjs
```

The fixture repo is at `fixtures/sample-repo` and covers envelope schema validation, `.gitignore`, binary warnings, generated/test/lockfile classifications, top limits, test surface, and naming summary.

## Mode: `inventory`

Run:

```bash
node ./scripts/codebase-meta.mjs inventory --root <repo-root>
```

Returns the full metadata report:

```ts
type CodebaseMetaReport = {
  scan: ScanMetadata;
  totals: Totals;
  extensionDistribution: ExtensionStat[];
  directoryStats: DirectoryStat[];
  fileStats: FileStat[];
  ignored: { paths: string[]; reason: string }[];
  findings: CodebaseFinding[];
};
```

Important rule: directory stats separate direct counts from total nested counts because those answer different questions.

## Mode: `file-type-distribution`

Run:

```bash
node ./scripts/codebase-meta.mjs file-type-distribution --root <repo-root> --extension .tsx
```

Answers: “How many files of this extension exist, and where are they concentrated?”

## Mode: `directory-sparsity-scan`

Run:

```bash
node ./scripts/codebase-meta.mjs directory-sparsity-scan --root <repo-root>
```

Finds empty, near-empty, single-child, shell, or low-file-count directories.

## Mode: `loc-hotspots`

Run:

```bash
node ./scripts/codebase-meta.mjs loc-hotspots --root <repo-root> --top 20 --min-loc 100
```

Answers: “Which files and directories are largest by LOC?”

## Mode: `directory-complexity-summary`

Run:

```bash
node ./scripts/codebase-meta.mjs directory-complexity-summary --root <repo-root> --top 30
```

Ranks directories with a simple, explainable score based on total nested LOC, nested files, nested directories, extension variety, max depth below, and direct children.

Scores identify where to inspect next. They are not objective code quality judgements.

## Mode: `codebase-shape-summary`

Run:

```bash
node ./scripts/codebase-meta.mjs codebase-shape-summary --root <repo-root>
```

Returns the compact agent-facing overview: primary languages, dominant directories, largest areas, sparse areas, largest files, recommended attention areas, and raw totals.

## Mode: `test-surface-summary`

Run:

```bash
node ./scripts/codebase-meta.mjs test-surface-summary --root <repo-root>
```

Answers:

- Where are tests concentrated?
- Which source-heavy directories appear to have no nearby tests?
- What test file patterns exist?

## Mode: `naming-pattern-summary`

Run:

```bash
node ./scripts/codebase-meta.mjs naming-pattern-summary --root <repo-root>
```

Summarizes naming conventions for components, tests, styles, index/barrel files, and folder casing.
