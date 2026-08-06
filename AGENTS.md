> Commit often; do not push. Use worktrees for large diffs.
> Keep long-horizon evidence in `.codex/work` Markdown. Use the `visualize` skill for an in-conversation visual when it materially improves understanding. Do not create standalone HTML response files unless the user explicitly asks to export one.

# Agent Context Framework

- Preserve unrelated changes. Never push or deploy.

## Communication

- Explain outcomes, reasons, tradeoffs, and verification in plain English.
- Be thorough enough that the maintainer can understand the result without reconstructing missing steps.
- Lead with the answer. Use short paragraphs and small purposeful lists. Define an unfamiliar term when it is first needed.
- Do not compress useful explanation into dense shorthand or a wall of bullets. Do not repeat the same point in different words.
- Do not impose character, word, paragraph, or bullet limits on explanations. Fit detail to the task, the evidence, and the maintainer's need to understand it.

## Work

- Before substantial code write `.codex/work/<task>.md`: outcome, decisions, state, topology, slice, replacements, non-goals, propagation.
- Record one answer and owner per decision. Specialists stay scoped.
- Complete one cross-layer slice and applicable loading, empty, error, populated, hover, focus-visible, active, and disabled states.
- Edit the owner; consolidate and replace directly. Never add compatibility, migrations, deprecations, adapters, dual writes, fallbacks, or parallel representations unless requested.
- Git and previews provide recovery. Reduce, then propagate to entry points, clients, adapters, contracts, and reverse actions. Mark gaps.
- Limits must protect a measured model, transport, storage, or runtime boundary. Derive them from that boundary, report when they are reached, and never silently truncate mandatory context or user-facing explanation.

## Frontend

- Never fill decisions from model priors or generic familiar UI.
- For substantial topology, shells, or replacement workflows, use `adopt-established-product`: pin licensed source, copy or adapt its implementation first, preserve topology and interactions, then make only the required delta. A prose description or independent look-alike is not adoption when the license permits reuse.
- Established CSS/accessibility/state/interaction repairs need no precedent research.
- Do not use text to frame text/elements or use cards for hierarchy. Use one primary surface.
- Invent no content, controls, navigation, summaries, or features. Omit decorative eyebrows, kickers, overlines, pills, badges, hero copy, fake metrics, and card grids unless the user, product contract, data, existing interface, or pinned source requires them in that semantic role.
- Preserve visible-copy and heading roles from their evidence. Moving precedent text into a new hierarchy position is a deviation, not styling.
- Treat visual assets as first-class implementation inputs. Preserve required product, brand, and precedent assets first. Otherwise, create code-native SVG for icons, vectors, patterns, and animated artwork, and use the `imagegen` skill for raster textures or illustration. Do not approximate artwork with nested elements, CSS gradients, pseudo-elements, or generic glyphs when a purpose-built asset would serve the recorded role better.
- Prefer a restrained animated SVG when motion adds state, feedback, direction, or product character. Provide a static `prefers-reduced-motion` result. An invented asset may fulfill an evidenced visual role, but it must not invent product meaning, content, controls, navigation, or features.
- For a muted SVG with overlapping strokes or paths, keep `currentColor` fully opaque and apply CSS `opacity` once to the root `<svg>` or a wrapper around the complete icon. Do not use alpha-bearing `color`, `fill`, `stroke`, `fill-opacity`, or `stroke-opacity` for this effect because each paint operation compounds at intersections. Do not replace the neutral with a background-specific solid tint.
- Represent state once. Use `tw-fade` on scrollable overflow.
- Use `shadow-plugin` for elevated surfaces. Do not combine a border or ring with a shadow on the same elevated element. Use `smooth-shadow-ring-*`, or `smooth-shadow-*` when no edge is needed. Otherwise, default to spacing, color, and elevation instead of borders. Add a border only when evidence or a functional state requires one.
- On every frontend, set `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` on `body` in the global base stylesheet.
- Default to minimalism; use claymorphism, glassmorphism, or neumorphism only when specified.

## Verification

- Browser, computer control, and repository-wide checks require a request.
- Tests require a request or regression. Checks detect breakage; users judge visuals.
- Run narrow TypeScript 7 checks. Report skips and unverified behavior. Reports follow `docs/AGENTS.md`.
- Use `reuse-before-implementation` for substantial implementation.

## Engineering

- Use `codebase-inventory` for explicit structure reports, shape comparisons, or quantitative scoping of unfamiliar large repositories.
- Use `diagnose` for causally uncertain bugs and regressions that require a reproduce, minimise, instrument, and fix loop.
- Use `reuse-before-implementation` before substantial runtime mechanisms, integrations, algorithms, parsers, protocols, adapters, fixtures, or schemas.
- Use `write-technical-prose` only when the repository declares a deterministic technical-prose check.
- Start durable task evidence from `.codex/templates/work-record.md` and project decisions from `.codex/templates/project-decision.md` when those artifacts are installed and the repository has no more specific owner.
- General engineering context does not imply frontend, TypeScript, session optimization, skill authoring, runtime tooling, or objective orchestration.

## TypeScript engineering

- Use `design-typescript-invariants` for TypeScript domain contracts, state machines, schemas, adapters, persistence, errors, or code that permits impossible states.
- Start a substantial type-model record from `.codex/templates/type-contract.md` when it is installed and no existing architecture record owns the decision.
- Run only repository-declared TypeScript, lint, invariant, and test gates. Do not assume a framework-specific application path or command.

## Session quality

- Use `optimize-codex-sessions` only for a completed Codex task with an exact repository range and evidence-backed delivery boundary.
- Keep session optimization read-only unless implementation is separately authorized. Do not turn incomplete work into a final workflow judgment.

## Skill authoring

- Use `writing-great-skills` to create or edit predictable skill instructions, invocation metadata, progressive disclosure, and completion criteria.
- Run a repository-declared technical-prose check after pruning skill instructions when one exists. Do not assume the framework's policy command is installed.
