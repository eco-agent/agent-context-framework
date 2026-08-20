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

Apply the following writing rules to all agent-authored prose. This includes
responses, plans, tool prompts, handoffs, work records, reviews, commit messages,
and documentation. Preserve exact quotations, copied source text, code, protocol
payloads, and machine-readable syntax. Accuracy, required detail, and the
intended tone still control what the prose says.

### Unslop

Edit text to remove AI patterns and add human voice.

#### Process

1. Scan for the patterns below.
2. Rewrite. Preserve meaning, match intended tone.
3. Add soul (see next section).
4. Self-audit: "What makes this obviously AI generated?" Fix remaining tells.

#### Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as obvious.

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure looks machine-made.
- **Be specific.** Not "this is concerning" but "there's something unsettling about agents churning away at 3am."

#### Patterns to detect and fix

##### Content

1. **Puffery.** "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted". Cut puffery, state what happened.
2. **Name-dropping.** Listing media outlets without context. Pick one, say what was said.
3. **Superficial -ing phrases.** "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete or expand with real sources.
4. **Promotional language.** "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", "must-visit". Use neutral descriptions.
5. **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
6. **Formulaic challenges.** "Despite challenges... continues to thrive." Replace with specific facts.

##### Language

7. **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
8. **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Just say "is" or "has".
9. **"Not just X, but Y."** State the point directly instead.
10. **Rule of three.** Forcing ideas into groups of three. Use the natural number.
11. **Synonym cycling.** Protagonist, main character, central figure, hero all in one paragraph. Pick one, repeat it.
12. **False ranges.** "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.

##### Style

13. **Em dash overuse.** Avoid em dashes entirely. Use periods or commas only (no parentheses, no en dashes, no hyphen-as-dash substitutes). Em dashes are an AI tell, and reaching for parentheses instead just trades one tell for another. If a thought needs separation, end the sentence or use a comma.
14. **Colon overuse.** Colons are fine before a list or example. Not as mid-sentence connectors. "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" adds nothing with the colon. Rewrite to let the point stand on its own without comparison framing. "Describing when the scheduler should fire works best as plain English." Same meaning, no crutch punctuation.
15. **Boldface overuse.** Don't bold every proper noun or acronym.
16. **Inline-header lists.** The tell is a bold label and colon that restates the line: "**Performance:** Performance improved...". Convert those to prose. A bold lead-in that ends in a period, names the item, and is followed by genuinely new detail ("**Schema in TypeScript.** Tables live in one file.") is fine, not a tell.
17. **Title case headings.** Use sentence case.
18. **Decorative emojis.** Remove from headings and bullets.
19. **Curly quotes.** Replace with straight quotes.

##### Communication artifacts

20. **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.
21. **Cutoff disclaimers.** "While specific details are limited..." Find sources or remove.
22. **Sycophantic tone.** "Great question! You're absolutely right!" Respond directly.

##### Filler

23. **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". "It is important to note that" gets deleted.
24. **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
25. **Generic conclusions.** "The future looks bright." State specific plans or facts.

##### Jargon

26. **Abstract metaphor nouns.** Substrate, wedge, vector, locus, vantage, nexus, primitive (as noun), harness (as metaphor), surface (as in "API surface"), bedrock, scaffolding (as metaphor), modality, paradigm, gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame, north star, flywheel. These read as technical but usually have a plainer concrete word. "Substrate" becomes "base". "Wedge in" becomes "add". "Vector" becomes "way" or "method". "Gold-plating" becomes "more than the job needs". "Ratchet" becomes the mechanism's real name or "a limit that only tightens". "Evacuate" becomes "move out". "Endgame" becomes "the last phase". Pick the concrete word.

##### Plain speech

27. **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read", "types that follow your schema" name a feeling. The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build". Ask what the sentence tells the reader to do or know, then write that. If you can't restate it as a concrete instruction, fact, or number, cut it. One more check: if the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
28. **Shorten or split dense sentences.** If the reader has to backtrack to parse a sentence, break it in two or drop clauses. One idea per sentence.
29. **Active voice.** Prefer it. Catch "is/are/was/were + past participle" and name the actor: "queries are validated" becomes "the compiler validates queries", "the file is parsed by the loader" becomes "the loader parses the file". Passive is fine only when the actor is unknown or genuinely doesn't matter.
30. **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number. "significantly improves" becomes the measured delta. An adverb propping up a weak verb means the verb is wrong.
31. **Prefer the plain word.** "utilize" becomes "use", "leverage" becomes "use", "facilitate" becomes "help", "numerous" becomes "many", "in the event that" becomes "if". The fancier synonym is rarely clearer.

## Work

- Before substantial code write `.codex/work/<task>.md`: outcome, decisions, state, topology, slice, replacements, non-goals, propagation.
- Record one answer and owner per decision. Specialists stay scoped.
- Complete one cross-layer slice and applicable loading, empty, error, populated, hover, focus-visible, active, and disabled states.
- Edit the owner; consolidate and replace directly. Never add compatibility, migrations, deprecations, adapters, dual writes, fallbacks, or parallel representations unless requested.
- Git and previews provide recovery. Reduce, then propagate to entry points, clients, adapters, contracts, and reverse actions. Mark gaps.
- Limits must protect a measured model, transport, storage, or runtime boundary. Derive them from that boundary, report when they are reached, and never silently truncate mandatory context or user-facing explanation.

## Protected framework baseline

- Treat framework-managed instructions as maintainer-owned policy. Do not edit,
  remove, override, or weaken them from project work. Framework policy changes
  originate in canonical registry sources and require maintainer review.
- Project instructions and contracts may add repository-specific detail or
  stricter requirements. When they conflict with this protected baseline, retain
  the baseline and report the conflict.

## Project contracts

- Before implementation, read every exact path declared in a configured
  `.agent-context/policy.json` under `repository.projectContracts`.
- If a declared contract is missing, or repository policy is unconfigured, report
  that state before relying on project architecture or documentation assumptions.

## Frontend

- Never fill decisions from model priors or generic familiar UI.
- Before substantial frontend implementation, use `frontend-design-discipline` to settle the product representation from user tasks and observed states. Treat schemas and the current implementation as evidence, not as the default interface.
- Treat desktop and mobile as projections of the same product model. Record whether each mobile surface should `preserve`, `adapt`, `recompose`, `split`, `replace`, or `remove`. Preservation is not the default.
- For substantial topology, shells, or replacement workflows, use `adopt-established-product`: pin licensed source, copy or adapt its implementation first, preserve topology and interactions, then make only the required delta. A prose description or independent look-alike is not adoption when the license permits reuse.
- Established CSS/accessibility/state/interaction repairs need no precedent research.
- Do not use text to frame text/elements or use cards for hierarchy. Use one primary surface.
- Invent no content, controls, navigation, summaries, or features. Omit decorative eyebrows, kickers, overlines, pills, badges, hero copy, fake metrics, and card grids unless the user, product contract, data, existing interface, or pinned source requires them in that semantic role.
- Preserve visible-copy and heading roles from their evidence. Moving precedent text into a new hierarchy position is a deviation, not styling.
- Treat visual assets as first-class implementation inputs. Preserve required product, brand, and precedent assets first. Otherwise, create code-native SVG for icons, vectors, patterns, and animated artwork, and use the `imagegen` skill for raster textures or illustration. Do not approximate artwork with nested elements, CSS gradients, pseudo-elements, or generic glyphs when a purpose-built asset would serve the recorded role better.
- Prefer a restrained animated SVG when motion adds state, feedback, direction, or product character. Provide a static `prefers-reduced-motion` result. An invented asset may fulfill an evidenced visual role. It must not invent product meaning, content, controls, navigation, or features.
- For a muted SVG with overlapping strokes or paths, keep `currentColor` fully opaque and apply CSS `opacity` once to the root `<svg>` or a wrapper around the complete icon. Do not use alpha-bearing `color`, `fill`, `stroke`, `fill-opacity`, or `stroke-opacity` for this effect because each paint operation compounds at intersections. Do not replace the neutral with a background-specific solid tint.
- On every frontend, set `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` on `body` in the global base stylesheet.
- Default to minimalism. Use claymorphism, glassmorphism, or neumorphism only when specified.

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

## Repository policy

- Treat `.agent-context/policy.json` as the project-owned authority for repository facts and verification profiles. Inspection output is observational and must never write or silently become policy.
- Configure repository type, relevant languages, documentation roots, exact project contract paths, package manager, package layout, and frontend presence explicitly before relying on policy verification.
- Treat declared project contracts as additive or stricter repository policy. They do not disable, replace, or weaken the maintainer-owned framework baseline.
- Run verification through a named project-declared profile. Commands are typed process or package-script tokens, not shell command strings, and registry components must not supply executable commands.
- Bootstrap and rebuild the isolated `.agent-context/runtime` through its fixed project-local operation. Repository policy must not modify or depend on the host package graph.
- Do not infer TypeScript, frontend, monorepo, package-manager, or verification requirements from framework defaults.

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
