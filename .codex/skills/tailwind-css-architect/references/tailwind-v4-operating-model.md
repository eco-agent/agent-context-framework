# Tailwind v4 Documentation Fallback

Use this fallback only when native subagents are unavailable or `scripts/tailwind_doc_context.py` cannot generate a bounded documentation task. It retrieves facts from the local official-docs cache; it does not define product design or CSS policy. The cache is generated and may be absent from an installed component.

Apply `responsive-css-architect` for stylesheet ownership, responsive mechanics, Tailwind-versus-CSS boundaries, component styling policy, and implementation review.

## Retrieval process

1. If `tailwind-docs/cache/CACHE_STATUS.md` is missing, run `python <skill-root>/scripts/sync_tailwind_docs.py --skill-root <skill-root>` to rebuild the cache from `tailwind-docs/doc-manifest.json`. Report and stop if synchronization fails; do not invent the missing documentation context.
2. Read `tailwind-docs/cache/CACHE_STATUS.md` and record its fetched date, cached count, and failures.
3. Use `tailwind-docs/INDEX.md` to select only the documentation pages that match the task.
4. Read each selected page from `tailwind-docs/cache/meta/<slug>.json`. Use `headings` to navigate and `content_text` or `code_blocks` for exact syntax and constraints.
5. Read `tailwind-docs/cache/SCREENSHOT_INDEX.json` only when a visual example materially affects the question.
6. Separate documentation facts from recommendations. Let the recorded frontend specification and `responsive-css-architect` determine the implementation choice.

## Completion criteria

Finish the fallback lookup only when:

- Every Tailwind feature used by the task is covered by a selected cached page.
- The cache date and any missing or failed pages are explicit.
- Recommended syntax is supported by the selected documentation text.
- Browser-support uncertainty is identified instead of inferred from Tailwind syntax alone.
- The final response states that cached documentation was used because live retrieval was unavailable.
