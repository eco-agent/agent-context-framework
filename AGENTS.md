> Keep checkpoint commits small and frequent. When the GitHub connector can
> write to the repository, use the `github-workstreams` skill and leave the
> user's local checkout untouched. Start remote agent work from `development`
> on a `codex/<task>` branch, open a draft pull request to `development`, and
> never merge it. Use the `visualize` skill when an in-conversation visual
> would materially improve understanding. Create a standalone HTML response
> file only when the user asks for an export.

# Agent Context Framework

- `main` is the deployment branch. `development` is the human-owned local
  integration branch. Agents may write only their remote `codex/<task>` branch
  through the GitHub connector and may open or update its pull request to
  `development`. Humans own local execution, integration, merge, and deployment.

<!-- agent-context:core:start -->

# Project agent context

> Keep checkpoint commits small and frequent. When the GitHub connector can
> write to the repository, use the `github-workstreams` skill and leave the
> user's local checkout untouched. Start remote agent work from `development`
> on a `codex/<task>` branch, open a draft pull request to `development`, and
> never merge it. Use the `visualize` skill when an in-conversation visual
> would materially improve understanding. Create a standalone HTML response
> file only when the user asks for an export.

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

## Agent routing

Use native scout subagents proactively when a task contains two or more
independent read-only investigations that can return once. Give each scout one
question, a bounded scope, the evidence it must return, and a stopping condition.
Start independent scouts in parallel up to the capacity Codex exposes. Do not add
a smaller project limit. Keep doing local work that does not depend on their
answers.

Scouts use Luna in a read-only sandbox. Treat their output as evidence, not a
decision. The primary Sol agent owns task interpretation, contradiction
resolution, architecture judgment, and the decision about what becomes
repository state. Sol must gather evidence directly when the search itself
requires interpreting ambiguous contracts or deciding what counts.

When the provider marks a scout failure as transient, replace that evidence lane
once. If the replacement also fails, Sol completes the lane directly or reports
the missing evidence. Do not wait on broken delegation after the second failure.

Only Sol agents may edit repository state. The primary may hand the current
checkout to a Sol worker until the assignment ends. One active writer owns the
checkout, branch, and index. Otherwise the primary remains the writer.

## Work

Preserve unrelated changes. `main` is the deployment branch. `development`
is the human-owned integration branch and the branch the user runs locally.
Humans own local execution, integration, merge, and deployment.

When the GitHub connector can write to the repository, use the
`github-workstreams` skill for non-trivial coding work. In that mode, do not
edit the user's local files, index, branches, worktrees, dependencies, build
outputs, processes, or caches. Read and write repository state through the
connector. Resolve `development` to a full commit ID, create one remote
`codex/<task>` branch from that commit, give it one writer, and expose the work
through a draft pull request targeting `development`.

Use branches to represent incomplete or alternate product behavior. Do not add
an environment variable or feature flag whose only purpose is to reveal work
that can live on a named branch. Secrets and real environment-specific
addresses may still use environment variables. The same documented run command
should start every product branch.

Keep task-owned state in small checkpoint commits. For multi-file changes
through the GitHub connector, create blobs, one tree based on the known current
tree, and one commit before moving the branch ref without force. If the ref
update conflicts, inspect the new remote head and reconcile it. Never overwrite
another writer's commit.

Do not create linked worktrees or use `git stash`. Do not create a task work
record by default. Put durable decisions in their canonical project documents.
If an interrupted filesystem transaction needs recovery state, write only the
fields needed to resume below the ignored `.codex/acf/state/` directory and
remove them after recovery.

Open a draft pull request after the first coherent checkpoint and update that
pull request throughout the task. Agents may push only their
`codex/<task>` branch. They never merge, commit directly to `development` or
`main`, delete branches, close pull requests, deploy, or force-push. If the
GitHub connector or its write authority is missing, report the missing
capability. Do not mutate the user's local checkout as a substitute.

Complete one cross-layer slice when the work reaches product assembly. For an
approved staged frontend program, complete the current design stage instead of
forcing foundations, component contracts, interaction studies, or visual
acceptance into premature product assembly. The cross-layer slice rule applies
when the work reaches product assembly.

Edit the owning representation and replace obsolete paths directly. Do not add
compatibility layers, migrations, adapters, dual writes, fallbacks, or parallel
representations unless the user asks. Git and previews provide recovery. Carry
the chosen representation through entry points, clients, contracts, and reverse
actions, and record any remaining gap.

Prefer a package dependency when its public API is enough. Use `git subtree` for
repository-shaped vendored source with an upstream update lifecycle when the
host provides it. Record the upstream URL, commit, prefix, license, and update
procedure. If the host lacks subtree support, stop and report the missing
capability instead of inventing another vendoring method. A selected-file
adoption remains a pinned, attributed copy. Do not add or mutate a submodule
unless a project contract requires its separate repository lifecycle.

Do not change global Git configuration. Any repository configuration change
requires an explicit project decision.

Derive limits from a measured model, transport, storage, or runtime boundary,
and report when a limit is reached.

## Protected framework baseline

- Treat framework-managed instructions as maintainer-owned policy. Do not edit,
  remove, override, or weaken them from project work. Framework policy changes
  originate in canonical registry sources and require maintainer review.
- Project instructions and contracts may add repository-specific detail or
  stricter requirements. When they conflict with this protected baseline, retain
  the baseline and report the conflict.

## Project contracts

- Before implementation, read every exact path declared in a configured
  `.codex/acf/policy.json` under `repository.projectContracts`.
- If a declared contract is missing, or repository policy is unconfigured, report
  that state before relying on project architecture or documentation assumptions.

## Verification

For code changes, run the narrowest applicable type and behavior checks before
handoff. Read-only review, explanation, and status work do not authorize tests.

Browser control, computer control, and broad or repository-wide checks require
an explicit user request or a declared final-acceptance contract. Report every
skipped check and every behavior that remains unverified.

## Writing check

Apply the Communication and Unslop rules whenever you write prose. The terse
wording used to state policy is not a model for your own writing. Use ordinary
sentences, concrete nouns, and whatever structure the subject needs.
<!-- agent-context:core:end -->

<!-- agent-context:frontend:start -->

## Frontend

Do not make product decisions from model priors or a familiar generic interface.
Before substantial frontend implementation, use `frontend-design-discipline` to
settle the product representation from the user's tasks and the states you can
observe. Treat schemas and the current implementation as evidence, not as the
default interface.

When supplied or approved captures, clips, runnable studies, and accepted or
rejected examples decide the visual direction, preserve the exact artifacts and
their provenance in a durable project-owned evidence path. Record the exact
region or interaction, the lesson it establishes, and what must not be copied.
Abstract style phrases do not replace inspectable visual evidence.

Treat desktop and mobile as projections of the same product model. For each
mobile surface, record whether the correct treatment is `preserve`, `adapt`,
`recompose`, `split`, `replace`, or `remove`. Preservation is not the default.

When the task changes substantial topology, an application shell, or a
replacement workflow, use `adopt-established-product`. Pin licensed source,
copy or adapt its implementation, preserve its topology and interactions, then
make only the required change. If the license permits reuse, a prose description
or an independently built look-alike does not count as adoption. Established
repairs to CSS, accessibility, state, or interaction need no precedent search.

Before creating or replacing a frontend component, inspect dependency manifests,
component imports, providers, theme configuration, and local component
directories. If the project has a component library for that role, use its
component. Preserve the library's behavior and accessibility, then compose or
style it to match the approved design. Replace it only when a recorded
requirement cannot be met through its public API.

Native elements remain the first choice for simple controls. Do not hand-write
composite behavior such as dialogs, popovers, menus, tooltips, comboboxes,
listboxes, tabs, accordions, toasts, date pickers, or data grids until you have
checked the project's component system and assessed a maintained accessible
implementation. If neither fits, record the mismatch before writing a custom
component.

Use one primary surface. Do not use cards to create hierarchy. Do not add text
whose only purpose is to frame other text or elements. Do not invent content,
controls, navigation, summaries, or features. Decorative eyebrows,
kickers, overlines, pills, badges, hero copy, fake metrics, and card grids belong
only where the user, product contract, data, existing interface, or pinned source
gives them that role.

Preserve the evidenced role of visible copy and headings. Moving precedent text
to a different place in the hierarchy changes the product; it is not a styling
choice.

Use the established type roles, spacing, weight, color, and elevation to express
hierarchy. Add a border or divider only when it marks a real structural boundary,
grouping, state, or interaction edge. A muted one-pixel separator is not default
decoration and must not compensate for weak hierarchy.

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

Bind final visual acceptance to the exact evidence and Git revision the human
reviewed. Automated checks may prove that evidence exists and required states
rendered. They do not approve visual quality.
<!-- agent-context:frontend:end -->

<!-- agent-context:frontend-tailwind:start -->

## Tailwind frontend

Select these instructions only when the project contract names Tailwind CSS as
the frontend styling system.

Use `skill-tailwind-css-architect` for Tailwind configuration, utility
boundaries, and component styling. Tailwind utilities are the normal
representation for styles Tailwind can express. `skill-responsive-css-architect`
decides layout relationships and responsive behavior, but it does not move
utility-expressible styling into raw CSS.

Import `shadow-plugin` once, after `tailwindcss`, in the Tailwind entry
stylesheet.

Use `shadow-plugin` for elevated surfaces. Replace a border or ring combined
with a shadow by one `smooth-shadow-ring-*` class. Use `smooth-shadow-*` when the
surface needs no edge stroke. Preserve keyboard focus with
`focus-visible:outline-*`.
<!-- agent-context:frontend-tailwind:end -->

<!-- agent-context:engineering:start -->

## Engineering

Use `codebase-inventory` when the task needs an explicit structure report, a
shape comparison, or quantitative scoping of a large unfamiliar repository. Use
`diagnose` when a bug or regression still needs a reproduce, minimise,
instrument, and fix loop to establish its cause.

Before building a substantial runtime mechanism, integration, algorithm,
parser, protocol, adapter, fixture, or schema, use
`reuse-before-implementation`. Use `write-technical-prose` only when repository
policy selects technical documentation for a deterministic prose check.

When no more specific owner exists, record durable project decisions from
`.codex/templates/project-decision.md`.

General engineering work does not automatically require frontend, TypeScript,
session optimization, skill authoring, runtime tooling, or objective
orchestration instructions.
<!-- agent-context:engineering:end -->

<!-- agent-context:typescript-engineering:start -->

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
<!-- agent-context:typescript-engineering:end -->

<!-- agent-context:session-quality:start -->

## Session quality

Use `optimize-codex-sessions` only after a Codex task is complete and has an
exact repository range plus an evidence-backed delivery boundary. The review is
read-only unless the user separately authorizes implementation. Do not judge an
unfinished task as though it were a completed workflow.
<!-- agent-context:session-quality:end -->

<!-- agent-context:skill-authoring:start -->

## Skill authoring

- Use `writing-great-skills` to create or edit predictable skill instructions, invocation metadata, progressive disclosure, and completion criteria.
- Changed-file verification must run the repository-declared agent-prose check on model-facing files. Run the same check directly on edited skill sources after pruning them. If the repository has no such check, report the gap. Use technical-prose checks only for technical documentation selected by repository policy.
<!-- agent-context:skill-authoring:end -->

<!-- agent-context:repository-policy:start -->

## Repository policy

`.codex/acf/policy.json` is the project-owned authority for repository facts
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

Bootstrap and rebuild the isolated `.codex/acf/runtime-source` through its fixed
project-local operation. Repository policy must neither modify nor depend on the
host package graph.
<!-- agent-context:repository-policy:end -->
