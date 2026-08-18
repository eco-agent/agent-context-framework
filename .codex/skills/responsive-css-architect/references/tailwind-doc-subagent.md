# Tailwind Documentation Subagent

Use a native subagent for documentation lookup before implementing or reviewing Tailwind-heavy UI. The skill-local `scripts/tailwind_doc_context.py` deterministically builds its bounded prompt; it does not launch another Codex process.

## Purpose

The subagent prevents stale Tailwind knowledge from shaping the implementation. It should inspect the official Tailwind v4 documentation cache and return only the context that matters for the current UI/styling task. The cache provides scoped article text and code examples for syntax, plus ordered centre-content screenshot chunks for visual examples.

The main model owns:

- The recorded frontend specification.
- Product topology, visible content, and actions.
- Implementation and final review.

The Tailwind subagent owns:

- Current Tailwind v4 syntax.
- Relevant docs pages.
- CSS-first configuration advice.
- Responsive/container-query recommendations.
- State variant recommendations.
- Theme/custom utility/custom variant recommendations.
- Class detection constraints.
- Browser-support caveats.

## Native Delegation

1. Generate the prompt:

   ```bash
   python <skill-root>/scripts/tailwind_doc_context.py \
     --task "<specific styling/UI task>" \
     --context "<design and implementation context>" \
     --sync-if-missing
   ```

2. Pass stdout unchanged to a fresh, bounded native subagent.
3. Do useful local inspection while the subagent reads the cache.
4. Integrate only documentation facts relevant to the task.

Resolve `<skill-root>` from this skill's source locator. Do not assume the current project's root contains the skill's `scripts/` directory. Never shell out to `codex exec` from this workflow.

## Cache Maintenance

Rebuild the complete cache when the official docs change or the cache is incomplete:

```bash
python <skill-root>/scripts/sync_tailwind_docs.py --force
```

For a fast visual smoke test of one page:

```bash
python <skill-root>/scripts/sync_tailwind_docs.py --slug backdrop-filter --force
```

The focused command deliberately leaves the cache incomplete. `tailwind_doc_context.py` will reject an incomplete cache and `--sync-if-missing` will rebuild it before generating the native-subagent prompt.

## Expected Output

The subagent should return only applicable documentation context. Prefer a short answer organized around the task rather than filling a fixed template. Include:

```txt
Tailwind documentation context:
- Relevant docs pages consulted.
- Feature/syntax recommendations.
- The applicable markup/CSS ownership boundary.
- Relevant responsive, state, class-detection, or browser constraints.
- Concrete implementation notes for this request.
```

Omit categories that do not affect the task.

## Rules for Interpreting Subagent Output

Treat subagent output as documentation context, not final design authority.

If the subagent recommends output that conflicts with the frontend specification, preserve the specification and use only the applicable syntax or constraint guidance.

If the subagent suggests large JavaScript class registries, reject that path unless the mapping is tiny and complete class names are statically visible.

If the subagent suggests `@apply`, only accept it when it is a narrow project-consistent exception.

If the subagent cannot access docs, fall back to `references/tailwind-v4-operating-model.md` and continue honestly.
