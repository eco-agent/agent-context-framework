## Verification

- Browser, computer control, and repository-wide checks require a request.
- Tests require a request or regression. Checks detect breakage; users judge visuals.
- Run narrow TypeScript 7 checks. Report skips and unverified behavior. Reports follow `docs/AGENTS.md`.
- During implementation, run focused checks for the owner being changed. For final acceptance, commit first and run `pnpm --silent verify:acceptance -- --fixture <absolute-path>` once from a clean worktree; it owns the single full-workspace, isolation, and downstream-fixture proof sequence.
- After that acceptance run, do not repeat broad executable gates for documentation-only commits. Record the tested revision and confirm the later diff is documentation-only.
- Use `reuse-before-implementation` for substantial implementation.
