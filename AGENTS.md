> Make checkpoint commits often, and never push. Give each logical work stream
> its own branch. Create an ephemeral worktree only when concurrent work or an
> isolated check needs another checkout.
> Keep long-running task evidence in `.codex/work` Markdown. Use the `visualize`
> skill when an in-conversation visual would materially improve understanding.
> Create a standalone HTML response file only when the user asks for an export.

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

Before substantial code, create `.codex/work/<task>.md`. Record the intended
outcome, decisions, current state, topology, smallest complete slice,
replacements, non-goals, and propagation paths. Give every decision one answer
and one owner, and keep specialists within their assigned scope.

Treat the work record as temporary task state. At closure, record whether the
task completed or stopped, the final revision, and the verification result. Keep
the record only when it still owns evidence required by policy or evidence not
moved into a canonical decision or handoff. Otherwise remove it in the same
task. Never remove a user-authored record or another task's record.

Resolve the baseline to a full commit ID before starting a new work stream, then
record it. One `codex/<task>` branch owns that stream. Use the current checkout
for serial work. Create an ephemeral linked worktree only when concurrent work
or an isolated check needs another checkout. Record its branch and absolute
path, and give each mutable branch and index to one active writer at a time.

Checkpoint task-owned dirty state with commits. Never use `git stash`, and never
include unrelated user changes. A run may remove only a clean worktree that it
created, after recording the worktree tip. Remove it with `git worktree remove`.
Do not force removal or delete the directory directly. Run `git worktree prune`
only when every stale entry Git reports belongs to the current run.

Complete one cross-layer slice. Where the product has these states, include
loading, empty, error, populated, hover, focus-visible, active, and disabled
behavior.

Edit the owning representation, consolidate there, and replace obsolete paths
directly. Do not add compatibility layers, migrations, deprecations, adapters,
dual writes, fallbacks, or parallel representations unless the user asks for
them. Git and
previews provide recovery. After reducing the old representation, carry the
chosen one through entry points, clients, adapters, contracts, and reverse
actions. Record any gap you cannot close.

Prefer a package dependency when its public API is enough. Use `git subtree` for
repository-shaped vendored source with an upstream update lifecycle when the
host provides it. Record the upstream URL, commit, prefix, license, and update
procedure. If the host lacks subtree support, stop and report the missing
capability instead of inventing another vendoring method. A selected-file
adoption remains a pinned, attributed copy. Do not add or mutate a submodule
unless a project contract requires its separate repository lifecycle.

Never change global Git configuration. Record and justify any repository or
worktree configuration change.

Every limit must protect a measured model, transport, storage, or runtime
boundary. Derive the limit from that boundary and report when it is reached.
Never silently cut mandatory context or user-facing explanation.

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

Do not make product decisions from model priors or a familiar generic interface.
Before substantial frontend implementation, use `frontend-design-discipline` to
settle the product representation from the user's tasks and the states you can
observe. Treat schemas and the current implementation as evidence, not as the
default interface.

Treat desktop and mobile as projections of the same product model. For each
mobile surface, record whether the correct treatment is `preserve`, `adapt`,
`recompose`, `split`, `replace`, or `remove`. Preservation is not the default.

When the task changes substantial topology, an application shell, or a
replacement workflow, use `adopt-established-product`. Pin licensed source,
copy or adapt its implementation, preserve its topology and interactions, then
make only the required change. If the license permits reuse, a prose description
or an independently built look-alike does not count as adoption. Established
repairs to CSS, accessibility, state, or interaction need no precedent search.

Use one primary surface. Do not use cards to create hierarchy. Do not add text
whose only purpose is to frame other text or elements. Do not invent content,
controls, navigation, summaries, or features. Decorative eyebrows,
kickers, overlines, pills, badges, hero copy, fake metrics, and card grids belong
only where the user, product contract, data, existing interface, or pinned source
gives them that role.

Preserve the evidenced role of visible copy and headings. Moving precedent text
to a different place in the hierarchy changes the product; it is not a styling
choice.

Treat visual assets as implementation inputs. Preserve required product, brand,
and precedent assets first. Otherwise, create code-native SVG for icons,
vectors, patterns, and animated artwork. Use `imagegen` for raster textures and
illustration. When a purpose-built asset fits the recorded role, do not imitate
it with nested elements, CSS gradients, pseudo-elements, or generic glyphs.

Use restrained SVG animation when motion explains state, feedback, direction,
or product character. Always provide a static `prefers-reduced-motion` result.
An invented asset may fill an evidenced visual role, but it may not invent
product meaning, content, controls, navigation, or features.

For a muted SVG with overlapping strokes or paths, leave `currentColor` fully
opaque. Apply CSS `opacity` once to the root `<svg>` or to a wrapper around the
whole icon. Alpha-bearing `color`, `fill`, `stroke`, `fill-opacity`, and
`stroke-opacity` compound where paint operations overlap, so do not use them for
this effect. Do not replace the neutral with a solid tint chosen for one
background.

Every frontend must set `-webkit-font-smoothing: antialiased` and
`-moz-osx-font-smoothing: grayscale` on `body` in the global base stylesheet.
Default to minimalism. Use claymorphism, glassmorphism, or neumorphism only when
specified.

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

## Repository policy

`.agent-context/policy.json` is the project-owned authority for repository facts
and verification profiles. Inspection can describe the repository, but its
output must never write policy or silently become policy.

Before relying on policy verification, configure the repository type, relevant
languages, documentation roots, exact project contract paths, package manager,
package layout, and frontend presence. Do not infer TypeScript, frontend,
monorepo, package-manager, or verification requirements from framework
defaults.

Project contracts add repository-specific rules or make existing rules stricter.
They do not disable, replace, or weaken the maintainer-owned framework baseline.

Run verification through a named profile declared by the project. Each command
must be expressed as typed process or package-script tokens, never as a shell
command string. Registry components must not provide executable commands.

Bootstrap and rebuild the isolated `.agent-context/runtime` through its fixed
project-local operation. Repository policy must neither modify nor depend on the
host package graph.

## Engineering

Use `codebase-inventory` when the task needs an explicit structure report, a
shape comparison, or quantitative scoping of a large unfamiliar repository. Use
`diagnose` when a bug or regression still needs a reproduce, minimise,
instrument, and fix loop to establish its cause.

Before building a substantial runtime mechanism, integration, algorithm,
parser, protocol, adapter, fixture, or schema, use
`reuse-before-implementation`. Use `write-technical-prose` only when repository
policy selects technical documentation for a deterministic prose check.

When the installed templates have no more specific owner, start durable task
evidence from `.codex/templates/work-record.md` and project decisions from
`.codex/templates/project-decision.md`.

General engineering work does not automatically require frontend, TypeScript,
session optimization, skill authoring, runtime tooling, or objective
orchestration instructions.

## TypeScript engineering

Use `design-typescript-invariants` for TypeScript domain contracts, state
machines, schemas, adapters, persistence, errors, and code that currently
permits impossible states.

For a substantial type model, start from
`.codex/templates/type-contract.md` when that template is installed and no
existing architecture record owns the decision.

Run only the TypeScript, lint, invariant, and test gates declared by repository
policy. Do not assume that a framework-specific application path or command is
available.

## Session quality

Use `optimize-codex-sessions` only after a Codex task is complete and has an
exact repository range plus an evidence-backed delivery boundary. The review is
read-only unless the user separately authorizes implementation. Do not judge an
unfinished task as though it were a completed workflow.

## Skill authoring

- Use `writing-great-skills` to create or edit predictable skill instructions, invocation metadata, progressive disclosure, and completion criteria.
- Changed-file verification must run the repository-declared agent-prose check on model-facing files. Run the same check directly on edited skill sources after pruning them. If the repository has no such check, report the gap. Use technical-prose checks only for technical documentation selected by repository policy.

## Writing check

Apply the Communication and Unslop rules whenever you write prose. The terse
wording used to state policy is not a model for your own writing. Use ordinary
sentences, concrete nouns, and whatever structure the subject needs.
