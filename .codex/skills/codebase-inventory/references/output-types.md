# Codebase Inventory Output Types

## Result envelope

Every mode returns this top-level envelope plus mode-specific fields.

```ts
type CodebaseMetaEnvelope = {
  schemaVersion: "0.1.0";
  mode: string;
  warnings: CodebaseWarning[];
  scan: ScanMetadata;
};
```

## ScanMetadata

Every mode includes this object.

```ts
type ScanMetadata = {
  root: string;
  generatedAt: string;
  filtersUsed: CodebaseScanOptions;
  defaultExcludesApplied: boolean;
  gitignoreApplied: boolean;
  truncated: boolean;
  symlinksFollowed: boolean;
};
```

## CodebaseWarning

```ts
type CodebaseWarning = {
  type:
    | "gitignore_parse_failed"
    | "permission_denied"
    | "binary_file_skipped"
    | "max_file_size_exceeded"
    | "path_outside_root"
    | "unsupported_extension"
    | "symlink_skipped";
  path: string;
  message: string;
};
```

## Totals

```ts
type Totals = {
  files: number;
  directories: number;
  loc: number;
  bytes: number;
};
```

## File classification

Files are classified as:

```ts
type FileClassification =
  | "source"
  | "config"
  | "test"
  | "asset"
  | "generated"
  | "binary"
  | "lockfile"
  | "unknown";
```

By default:

- Source/config/test files may contribute LOC.
- Assets contribute bytes but not LOC.
- Binary files are skipped unless `--include-binary` is provided.
- Generated files are marked with `classification: "generated"` and `isGenerated: true`.
- Files above `--max-file-size-kb` are skipped.
- Symlinks are skipped by default. Use `--follow-symlinks` to traverse symlinks inside the scan root.

## ExtensionStat

```ts
type ExtensionStat = {
  extension: string;
  fileCount: number;
  totalLoc: number;
  totalBytes: number;
  directories: {
    path: string;
    fileCount: number;
  }[];
};
```

## DirectoryStat

```ts
type DirectoryStat = {
  path: string;
  directFileCount: number;
  directSubdirectoryCount: number;
  totalNestedFileCount: number;
  totalNestedDirectoryCount: number;
  directLoc: number;
  totalNestedLoc: number;
  extensions: {
    extension: string;
    fileCount: number;
    loc: number;
  }[];
};
```

Direct fields describe files and subdirectories immediately inside the folder. Total nested fields describe everything under the folder subtree.

## FileStat

```ts
type FileStat = {
  path: string;
  name: string;
  extension: string;
  loc: number;
  bytes: number;
  directory: string;
  depth: number;
  classification: FileClassification;
  isGenerated: boolean;
};
```

## CodebaseFinding

```ts
type CodebaseFinding = {
  type:
    | "large_file"
    | "large_directory"
    | "empty_directory"
    | "sparse_directory"
    | "single_child_directory"
    | "extension_concentration"
    | "deeply_nested_directory";
  path: string;
  severity: "info" | "notice" | "warning";
  metric: Record<string, number | string>;
  reason: string;
  suggestedNextStep?: string;
};
```

## Finding thresholds

Default thresholds:

```json
{
  "largeFileLoc": 500,
  "veryLargeFileLoc": 1000,
  "largeDirectoryLoc": 5000,
  "veryLargeDirectoryLoc": 15000,
  "sparseDirectoryMaxDirectFiles": 1,
  "singleChildDirectoryMaxDirectFiles": 0,
  "deepDirectoryDepth": 6,
  "highExtensionConcentrationPercent": 40
}
```

Override flags:

```bash
--large-file-loc 700
--very-large-file-loc 1200
--large-directory-loc 8000
--very-large-directory-loc 20000
--deep-directory-depth 7
--high-extension-concentration-percent 50
```

## Focused result types

```ts
type FileTypeDistributionResult = {
  scan: ScanMetadata;
  extension: string;
  totalFiles: number;
  totalLoc: number;
  directoryDistribution: {
    directory: string;
    fileCount: number;
    loc: number;
    percentageOfType: number;
  }[];
};
```

```ts
type LocHotspotResult = {
  scan: ScanMetadata;
  highestLocFiles: {
    path: string;
    loc: number;
    extension: string;
    directory: string;
    classification: FileClassification;
    isGenerated: boolean;
  }[];
  highestLocDirectories: {
    path: string;
    totalNestedLoc: number;
    directLoc: number;
    totalNestedFileCount: number;
  }[];
};
```

```ts
type TestSurfaceSummary = {
  scan: ScanMetadata;
  detectedTestPatterns: string[];
  testFiles: {
    path: string;
    loc: number;
    relatedSourceGuess?: string;
  }[];
  directories: {
    path: string;
    sourceFileCount: number;
    testFileCount: number;
    testToSourceRatio: number;
  }[];
  findings: {
    type: "no_tests_nearby" | "test_concentration" | "orphan_test_area";
    path: string;
    metric: Record<string, number | string>;
    reason: string;
  }[];
};
```

## Interpretation rule

Metadata tells the agent where to look next. It does not prove what is good, bad, dead, or incorrect.

Examples:

- A 1,200 LOC file is a hotspot, not necessarily a bad file.
- A sparse folder may be intentional scaffolding, not necessarily unnecessary.
- A directory with many `.tsx` files is a concentration of UI surface, not automatically a design problem.
- A source-heavy directory with no detected tests may still have integration/manual coverage elsewhere.
