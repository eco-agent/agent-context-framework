# Tailwind v4 Documentation Fallback

Use this fallback only when native subagents are unavailable or `scripts/tailwind_doc_context.py` cannot generate a bounded documentation task. It retrieves facts from the local official-docs cache; it does not define product design or CSS policy.

Apply `responsive-css-architect` for stylesheet ownership, responsive mechanics, Tailwind-versus-CSS boundaries, component styling policy, and implementation review.

## Retrieval process

1. Read `tailwind-docs/cache/CACHE_STATUS.md` and record its fetched date, cached count, and failures.
2. Use `tailwind-docs/INDEX.md` to select only the documentation pages that match the task.
3. Read each selected page from `tailwind-docs/cache/meta/<slug>.json`. Use `headings` to navigate and `content_text` or `code_blocks` for exact syntax and constraints.
4. Read `tailwind-docs/cache/SCREENSHOT_INDEX.json` only when a visual example materially affects the question.
5. Separate documentation facts from recommendations. Let the recorded frontend specification and `responsive-css-architect` determine the implementation choice.

## Completion criteria

Finish the fallback lookup only when:

- Every Tailwind feature used by the task is covered by a selected cached page.
- The cache date and any missing or failed pages are explicit.
- Recommended syntax is supported by the selected documentation text.
- Browser-support uncertainty is identified instead of inferred from Tailwind syntax alone.
- The final response states that cached documentation was used because live retrieval was unavailable.
