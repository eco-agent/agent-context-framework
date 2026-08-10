## Verification

- For code changes, run the narrowest applicable type and behavior checks before
  handoff. Read-only review, explanation, and status work do not authorize tests.
- Browser control, computer control, and broad or repository-wide checks require
  an explicit request or a declared final-acceptance contract. Checks detect
  breakage; users judge visuals.
- Run only repository-declared TypeScript, lint, invariant, and test gates. Report
  skips and unverified behavior. Reports follow `docs/AGENTS.md`.
- During implementation, run focused checks for the owner being changed. For final acceptance, commit first and run `pnpm --silent verify:acceptance -- --fixture <absolute-path>` once from a clean worktree; it owns the single full-workspace, isolation, and downstream-fixture proof sequence.
- After that acceptance run, do not repeat broad executable gates for documentation-only commits. Record the tested revision and confirm the later diff is documentation-only.
- Use `reuse-before-implementation` for substantial implementation.
