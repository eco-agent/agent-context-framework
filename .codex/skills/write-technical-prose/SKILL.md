---
name: write-technical-prose
description: Revise technical documentation to clear a repository's deterministic prose findings.
---

# Write technical prose

Use this skill only for technical documentation selected by repository policy.
Prompts, handoffs, role instructions, and skill files need an agent-prose check
instead.

1. Locate the deterministic technical-prose command declared by the repository's instructions or manifest. If none exists, report that the required policy capability is unavailable and stop without inventing a replacement check.
2. Run the declared command for the requested targets from the repository root.
3. Edit only the reported prose. Preserve every fact, condition, identifier, and scope boundary.
4. Rerun the same command until it exits successfully.
5. Read the revised passages once for lost or changed meaning. Restore any lost meaning and rerun the command.

The command enforces a mechanical STE-inspired subset. A successful result does not certify ASD-STE100 compliance or semantic quality.
