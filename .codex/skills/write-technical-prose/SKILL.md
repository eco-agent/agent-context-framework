---
name: write-technical-prose
description: Rewrite technical prose against repository policy findings.
---

# Write technical prose

1. Run `pnpm check:technical-prose --files <targets>` from the repository root.
2. Edit only the reported prose. Preserve every fact, condition, identifier, and scope boundary.
3. Rerun the same command until it exits successfully.
4. Read the revised passages once for lost or changed meaning. Restore any lost meaning and rerun the command.

The command enforces a mechanical STE-inspired subset. A successful result does not certify ASD-STE100 compliance or semantic quality.
