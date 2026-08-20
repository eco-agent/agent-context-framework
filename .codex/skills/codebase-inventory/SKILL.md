---
name: codebase-inventory
description: "Measure repository structure and compare codebase shape with deterministic JSON."
---

# Codebase Inventory

Measure the repository, use the result to choose source files, then read those files before making semantic claims. Available modes:

- `codebase_inventory`
- `file_type_distribution`
- `directory_sparsity_scan`
- `loc_hotspots`
- `directory_complexity_summary`
- `codebase_shape_summary`
- `test_surface_summary`
- `naming_pattern_summary`

Skill/report names use snake_case. CLI modes use kebab-case.

## Behaviour Rules

- Use metrics to identify the next source files and directories to inspect.
- Reserve correctness, quality, and architecture judgments for semantic source analysis.
- Distinguish direct directory stats from recursive or nested stats.
- Support every interpretation with the metric and filters that produced it.
- For design, refactor, or architecture work, prefer source-oriented routing:
  use `--exclude-generated` and `--quiet-warnings` unless generated output or
  skipped-file detail is the point of the task.
- When a repo has project-specific planes, domains, or surfaces in local
  instructions, map inventory findings to those surfaces before recommending
  next inspections.
- Treat missing colocated tests as an inspection lead, then check language-specific test conventions and command targets.

## Script Output Rules

- The script returns valid JSON only.
- The script does not return prose.
- Every mode includes `scan.filtersUsed`, `scan.defaultExcludesApplied`, `scan.gitignoreApplied`, and `scan.truncated`.
- Arrays are sorted deterministically.
- Every result includes top-level `schemaVersion`, `mode`, and `warnings`.
- The agent may summarize the JSON after execution, but must clearly separate observed metrics from interpretation or recommendations.

## Completion condition

A report is complete only when it records:

1. Filters used.
2. Most important metrics.
3. Top findings.
4. What the metadata suggests inspecting next.
5. The semantic source inspection needed before making quality or architecture claims.

## Quick Start

From this skill directory:

```bash
node ./scripts/codebase-meta.mjs inventory --root <repo-root>
```

Other modes:

```bash
node ./scripts/codebase-meta.mjs file-type-distribution --root <repo-root> --extension .tsx
node ./scripts/codebase-meta.mjs directory-sparsity-scan --root <repo-root>
node ./scripts/codebase-meta.mjs loc-hotspots --root <repo-root>
node ./scripts/codebase-meta.mjs directory-complexity-summary --root <repo-root>
node ./scripts/codebase-meta.mjs codebase-shape-summary --root <repo-root>
node ./scripts/codebase-meta.mjs test-surface-summary --root <repo-root>
node ./scripts/codebase-meta.mjs naming-pattern-summary --root <repo-root>
```

Common options:

```bash
--include "src/**,tests/**"
--exclude "fixtures/**,vendor/**"
--ignore-defaults
--no-gitignore
--max-depth 6
--extensions ".ts,.tsx,.css"
--include-hidden
--count-blank-lines
--count-comment-lines
--max-file-size-kb 512
--include-binary
--top 20
--min-loc 100
--min-files 2
--summary-only
--follow-symlinks
--quiet-warnings
--exclude-generated
```

Default excludes: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `.turbo`, `.cache`, `bin`, `obj`, `.vscode`, `.idea`.

Symlinks are skipped by default to avoid cycles and accidental traversal outside the repo root. Use `--follow-symlinks` only when intentional.

## Fixture Validation

From this skill directory:

```bash
node ./scripts/validate-fixture.mjs
```

The fixture repo is in `fixtures/sample-repo` and validates the JSON envelope against `references/result-envelope.schema.json`, classification, `.gitignore`, binary-skip warnings, top limits, test surface, and naming summary.

## References

Load these only when needed:

- [Report modes, ignore behaviour, limits, and command contracts](references/report-modes.md)
- [Output types, file classifications, thresholds, and interpretation rules](references/output-types.md)
- [Basic result envelope JSON Schema](references/result-envelope.schema.json)

## Practical Routing Presets

Broad design or refactor orientation:

```bash
node ./scripts/codebase-meta.mjs codebase-shape-summary --root <repo-root> --top 12 --quiet-warnings --exclude-generated
node ./scripts/codebase-meta.mjs loc-hotspots --root <repo-root> --top 20 --quiet-warnings --exclude-generated
node ./scripts/codebase-meta.mjs test-surface-summary --root <repo-root> --top 20 --quiet-warnings
```

Generated or asset-heavy repos:

```bash
node ./scripts/codebase-meta.mjs inventory --root <repo-root> --summary-only --quiet-warnings
```

Before adding files near an existing surface:

```bash
node ./scripts/codebase-meta.mjs naming-pattern-summary --root <repo-root> --include "path/to/surface/**" --quiet-warnings
node ./scripts/codebase-meta.mjs file-type-distribution --root <repo-root> --include "path/to/surface/**" --extension .tsx --quiet-warnings
```

After the report routes attention, read the actual files and local project instructions before making semantic claims.
