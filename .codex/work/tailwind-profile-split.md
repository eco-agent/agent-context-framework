# Work record: Tailwind profile split

## Outcome

Keep generic frontend and responsive CSS contracts usable for plain CSS projects while making Tailwind conventions explicitly selectable through `frontend-tailwind`.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Neutral CSS profile | `frontend` and `skill-responsive-css-architect` contain only framework-neutral frontend/CSS guidance; no Tailwind names, imports, scripts, or documentation cache. | Frontend and responsive skill sources |
| Tailwind profile | `frontend-tailwind` owns a dedicated instruction section and `skill-tailwind-css-architect`, including the existing Tailwind documentation helper and cache. | Registry topology |
| Source preservation | Existing Tailwind guidance and cache move intact to the explicit skill so no capability is silently lost. | Tailwind skill source |
| Validation | Registry build/check and exact closure tests prove neutral and Tailwind profiles have disjoint content ownership. | Governance tests |

## State

- Existing responsive skill currently mixes neutral responsive CSS and Tailwind-specific rules/resources.
- Worktree is clean before this slice.
- Parent agent is changing core/verification instruction sources; those files are out of scope here.

## Topology

```text
frontend ----------------------------> registry/sources/instructions/frontend.md
                                        + neutral frontend design skills

frontend-tailwind -------------------> frontend + responsive CSS +
                                        registry/sources/instructions/frontend-tailwind.md +
                                        skill-tailwind-css-architect

skill-responsive-css-architect ------> framework-neutral CSS skill only
skill-tailwind-css-architect --------> Tailwind rules, docs, scripts, cache
```

## Slice

1. Move Tailwind skill resources into a dedicated skill directory.
2. Prune Tailwind-only rules from the responsive skill and frontend instruction.
3. Add an explicit Tailwind instruction and registry component dependency/artifacts.
4. Update focused registry tests and generated output after the source catalog is final.

## Non-goals

- No installer, policy, core verification, CLI, or setup UI changes.
- No changes to component selection outside frontend/frontend-tailwind and the two CSS skills.
- No lockfile or host package graph changes.

## Propagation

- `.codex/skills/responsive-css-architect/**`
- `.codex/skills/tailwind-css-architect/**`
- `registry/sources/instructions/frontend.md`
- `registry/sources/instructions/frontend-tailwind.md`
- `registry/registry.source.json`
- `tools/dev-tooling/test/context-registry-builder.test.ts`
- generated `registry/registry.json` is regenerated only after concurrent registry source edits settle.
