## Verification

For code changes, run the narrowest applicable type and behavior checks before
handoff. During implementation, focus those checks on the owner being changed.
Read-only review, explanation, and status work do not authorize tests. Run only
the TypeScript, lint, invariant, and test gates declared by repository policy.

Browser control, computer control, and broad or repository-wide checks require
an explicit request or a declared final-acceptance contract. Automated
checks can find breakage; the user still judges visual quality.

Final acceptance has one owner. Commit the implementation, start from a clean
worktree, and run
`pnpm --silent verify:acceptance -- --fixture <absolute-path>` once. That command
owns the full-workspace, isolation, and downstream-fixture proof sequence.

If later commits change documentation only, do not repeat the broad executable
gates. Record the tested revision and confirm that the later diff contains only
documentation.

Report every skipped check and every behavior that remains unverified. Format
verification reports according to `docs/AGENTS.md`. Use
`reuse-before-implementation` for substantial implementation.
