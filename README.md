# Agent Context Framework

> I have spent more than 9.2 billion tokens working with GPT-5.6. ACF is the setup
> that survived.

I built Agent Context Framework because I was fucking tired of correcting the
same things.

Tired of the little eyebrow above every heading. Tired of card grids pretending
to be product design. Tired of prose that used 600 polished words to say nothing.
Tired of TypeScript that compiled because every field was optional and every error
was somebody else's problem.

Tired of watching GPT-5.6 be brilliant and generic at exactly the same time.

ACF is my personal Codex setup manifest. You install its source into a repository,
then edit it until the result matches your taste.

## The difference in one paragraph

ACF makes GPT-5.6 behave like the version of Codex I wanted after 9.2 billion
tokens. It replaces the model's generic taste with mine and makes its claims answer
to the repository before it calls the work done. Stock Codex does not carry that
memory. A hand-written `AGENTS.md` captures the reminders you thought to add, while
skills made as you go repair failures one at a time. ACF joins those corrections
and makes them active together. Its source remains editable.

## Why this exists

I did not sit down and design a framework from first principles. I used Codex. A
lot.

At first I pasted corrections into `AGENTS.md`. That file grew until a rule about
debugging competed for attention during a typography change. I moved specialist
judgment into triggered skills. When prose could not prove a rule, I wrote a
checker. ACF is what survived 9.2 billion tokens of that cycle.

I now spend fewer opening turns telling the model not to reach for the same UI and
fewer closing turns arguing that a green check proved the wrong thing. The relevant
correction is already present before GPT-5.6 makes the decision.

## Built for GPT-5.6

ACF currently supports GPT-5.6. I have not calibrated it for other models.

The checked-in Codex configuration uses `gpt-5.6-sol` for the default role and
`gpt-5.6-luna` for scout and worker roles. I wrote the instructions after observing
what that family gets right and where I keep correcting it. Another model may follow
them. That is not the same as being supported.

[OpenAI's GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
recommends stating each instruction once and keeping style guidance when it corrects
a measured gap. ACF follows that advice. Universal rules live once in the baseline.
Detailed judgment loads only for the work that needs it.

## What ACF believes

**Code is cheap now. Judgment is not.** GPT-5.6 can produce more code than I can
sensibly review. I want the resulting code to make the next change easier, not bury
it under another abstraction.

**A rule that arrives after the edit is dead.** Context has to appear before the
decision it is meant to change. If the same warning lives in four files, the next
edit leaves three stale copies behind.

**Generic taste is still generic.** Better model priors do not know the product I
am building. ACF tells the model what I consider acceptable, down to whether a
heading gets an eyebrow and whether a TypeScript state can contradict itself.

**A boundary without evidence is a wish.** "Be careful" does not protect a
codebase. A diff can show whether the agent touched user work. If ownership overlaps,
the agent has to stop and name the conflict.

**The repository must remain in charge.** ACF provides my defaults. The project
policy names the contracts an agent must read. When one of those contracts disagrees
with generic guidance, the contract wins unless it would weaken the protected
framework baseline.

## What ACF cannot promise

Instructions do not make GPT-5.6 smarter or guarantee that it noticed every rule.
ACF cannot inspect the model's private context. My 9.2 billion tokens are experience,
not proof that this setup fits your workload.

ACF writes the defaults into the repository before the task starts. When a claim
can be checked, the agent has to show the evidence.

I do not need a promise of autonomous software engineering. I need Codex to stop
repeating mistakes I already paid to learn.

## What 9.2 billion tokens produced

The corrections ended up in different places instead of one enormous prompt. A
correction stays in the baseline only when every task needs it. Specialist
corrections live in triggered skills. The project owns facts about itself. Code
checks the claims that prose cannot prove. Those placement rules determine which
text GPT-5.6 sees before each decision.

### The baseline every task receives

The always-on baseline is assembled from the
[`core`](registry/sources/instructions/core.md) instructions. It defines how the
agent handles user changes, Git, communication, project contracts, and
completion. These are defaults I do not want to remember at the start of each
task.

The Git rules exist because an agent can produce a correct patch and still make a
mess of the repository around it. ACF gives one branch and index to one active
writer. It forbids stashing user work, keeps unrelated changes out of commits, and
never treats a coding request as permission to push. Substantial work records its
baseline so the final diff has a known starting point.

```text
task owns  src/invite.ts
           test/invite.test.ts
diff adds  package.json

stop: package.json was already dirty
```

The communication rules came from the same kind of repetition. "Be concise" was
too vague. The model could satisfy it by deleting the useful explanation while
keeping the polished filler. The [Unslop rules](registry/sources/instructions/core.md)
name the actual failures: puffery, false contrasts, synonym cycling, abstract
jargon, inline-header lists, and sentences that describe a feeling instead of a fact.
They apply to responses, plans, work records, reviews, commit messages, and docs.

```text
before  This robust solution enhances reliability while ensuring seamless recovery.
after   The worker retries twice. A third failure leaves the job failed.
```

Finally, the baseline tells the agent where local truth lives. If a repository
declares architecture contracts, the agent reads those exact paths before it writes
code. It does not scan a docs folder and decide which file looks authoritative.

### Skills that load for one kind of decision

Specialist guidance does not belong in the baseline. A typography skill has no
reason to consume attention during a database repair. Each skill has a narrow
catalog description that tells Codex when to load the full procedure.

GPT-5.6 already knows how to write React and CSS. The recurring frontend failure
was choosing the same generic product before it wrote either. The
[frontend discipline](.codex/skills/frontend-design-discipline/SKILL.md)
forces the task, information structure, mobile treatment, and visual asset roles to
be settled before implementation. The repository instructions then prohibit cards,
eyebrows, badges, invented metrics, and decorative framing unless the product or a
pinned source gives them a real job.

Before choosing a component, the agent has to identify what the user is trying to
do and what arrangement makes that obvious. Once the answer is settled, separate
skills handle [accessibility](.codex/skills/design-accessible-interfaces/SKILL.md),
[type](.codex/skills/design-web-typography/SKILL.md),
[color](.codex/skills/design-color-systems/SKILL.md),
[interface detail](.codex/skills/design-interface-details/SKILL.md), and
[motion](.codex/skills/choose-react-animation/SKILL.md). They use the project's
component system instead of rebuilding dialogs, menus, tabs, and other composite
controls by hand.

The TypeScript correction became
[`design-typescript-invariants`](.codex/skills/design-typescript-invariants/SKILL.md).
It treats types as the domain model rather than decoration around JavaScript. It
parses untrusted data at boundaries, derives types from the authoritative schema,
and strengthens a type only when the looser type permits a real category error.

```ts
type LooseJob = {
  status: "queued" | "done" | "failed";
  result?: Result;
  error?: JobError;
};

// The type accepts a finished job with no result and an unrelated error.
declare const timeout: JobError;
const impossible: LooseJob = { status: "done", error: timeout };

type Job =
  | { status: "queued" }
  | { status: "done"; result: Result }
  | { status: "failed"; error: JobError };
```

Other corrections became smaller engineering skills. Each one owns a failure I
kept seeing rather than a broad role such as "senior engineer."

| Recurring failure | What the skill changes | Source |
| --- | --- | --- |
| The agent fixes the first plausible cause | Reproduce, reduce, test competing causes, instrument the uncertain handoff, then fix the cause if a fix was requested | [`diagnose`](.codex/skills/diagnose/SKILL.md) |
| The agent writes a mechanism that a maintained package already solves | Inspect manifests, imports, local implementations, and maintained packages before building it | [`reuse-before-implementation`](.codex/skills/reuse-before-implementation/SKILL.md) |
| A catch block hides the failure and calls the path recovered | Define the caller-visible error, recovery behavior, cancellation, retry ownership, and evidence before changing the boundary | [`design-operational-boundaries`](.codex/skills/design-operational-boundaries/SKILL.md) |
| Two workers fight over one mutable record | Remove unnecessary sharing first, then choose one writer or explicit concurrency control for the state that remains shared | [`separate-shared-state`](.codex/skills/separate-shared-state/SKILL.md) |
| A simple answer requires tracing wrappers and hidden mutation | Remove indirection, shorten the path from question to owner, and reduce mutable scope | [`reduce-reader-load`](.codex/skills/reduce-reader-load/SKILL.md) |

The skill set also contains bounded tools for
[repository inventory](.codex/skills/codebase-inventory/SKILL.md),
[session review](.codex/skills/optimize-codex-sessions/SKILL.md), and
[skill authoring](.codex/skills/writing-great-skills/SKILL.md). They load only when
the request needs that work. An ordinary code edit should never pay for all of them.

### Project facts that the model must not guess

Generic instructions cannot know whether a repository is a TypeScript monorepo,
which package manager owns it, whether it has a frontend, or which commands count
as verification. ACF stores those answers in the project-owned
`.codex/acf/policy.json`.

The repository block makes those facts explicit:

```json
{
  "schemaVersion": 1,
  "state": "configured",
  "repository": {
    "repositoryType": "framework",
    "languages": ["typescript", "javascript"],
    "projectContracts": [],
    "packageManager": {
      "state": "declared",
      "name": "pnpm",
      "version": "10.22.0"
    },
    "layout": "monorepo",
    "frontend": true
  }
}
```

The framework may seed that file, but the project owns it immediately. An
inspection command may describe the repository; it cannot silently turn an
observation into policy. If the project says there are no architecture contracts,
the agent reports that fact instead of inventing one.

Verification profiles solve a related problem. "Run the tests" is useless in a
repository with several packages, a browser suite, a downstream fixture, and checks
that require credentials. The policy names the permitted commands and groups them
by task. Documentation changes run the docs profile. A domain package can name its
own focused profile. Full acceptance remains a separate action with one owner.

```text
owner       docs/AGENTS.md  -> pnpm verify:profile docs
stale copy  README.md       -> pnpm verify
```

The stale copy sends the agent to the wrong check. ACF keeps the command with its
owner and lets code select changed files against repository policy.

### Regenerable downstream test application

Framework development does not need to borrow a real product repository for
capsule tests. The repository includes a small web application generator with
independent ACF and Git-state controls:

```powershell
pnpm fixture:test-app -- --output D:\dev\acf-test-app --state clean --acf none
pnpm fixture:test-app -- --output D:\dev\acf-test-app --state dirty --acf runtime --replace
```

`--acf none` creates the application before packing. `core`, `runtime`, and
`acceptance` pack progressively larger real component selections. `--state
dirty` then changes one tracked application file and adds one untracked note, so
capsule work can prove it preserved unrelated project changes. The generator
replaces only a directory that contains its ACF fixture marker.

Core fixtures are not final-acceptance fixtures. The final acceptance runner also
requires repository policy, the isolated Codex runtime, hooks, and repository
context. Keep that larger state explicit when a test actually needs it.

### Evidence that survives the chat

Checkpoint commits preserve task-owned code without copying the conversation
into the repository. Durable decisions go in project documents such as an ADR.
ACF does not require `.codex/work/<task>.md`. If an interrupted filesystem
transaction needs a resume token, it writes a short ignored record below
`.codex/acf/state/` and deletes it after recovery.

The optional
[`orchestrate-codex-workflows`](.codex/skills/orchestrate-codex-workflows/SKILL.md)
skill handles work that genuinely needs stored evidence, finite budgets, enforced
transitions, or durable continuation. It is not the default answer to a long task.
Ordinary plans and native subagents remain cheaper when the work can return once.

### Model roles with different jobs

The model configuration is part of the manifest because delegation changes what
context reaches a decision. The default role uses GPT-5.6 Sol at high reasoning for
general work. The scout uses GPT-5.6 Luna at max reasoning in a read-only sandbox.
It answers one repository question and stops. Independent scouts run in parallel
up to the capacity Codex exposes. The project does not replace that capacity with
its own smaller thread limit.

The worker uses Sol at high reasoning and owns one exclusive checkout, branch, and index. The
primary Sol agent remains responsible for product and architecture decisions,
combines scout evidence, and resolves contradictions. Repeated delegation failure
falls back to direct Sol work instead of leaving the task waiting on a broken
scout lane.

The optional Codex runtime adds hooks and a repository-context tool. Hooks remain
dormant without a valid session binding. The repository tool reads bounded line
ranges or runs fixed-string searches inside one authorized root. It cannot turn a
context helper into unrestricted filesystem access.

### The capsule itself

One tracked `.codex/acf/capsule.acf` carries the selected component closure,
source bytes, and activation hashes. `pack` writes it and the tracked activation
files. `sync` recreates ignored runtime files and `.agents/skills` from it. The
receipt is ignored and can replace only files whose hashes still match.

### Repositories on this machine

ACF keeps an explicit machine-level catalog below
`$CODEX_HOME/acf/repositories`, or `~/.codex/acf/repositories` when
`CODEX_HOME` is unset. Each repository has one small record. Health remains live
repository state and is never copied into the catalog.

```powershell
pnpm agent-context repo register --cwd D:\path\to\your-project
pnpm agent-context repo list
pnpm agent-context repo status
pnpm agent-context sync --all
```

`repo status` distinguishes a current repository from one needing `sync`, one
needing `pack`, a blocked projection, a corrupt capsule, and a missing checkout.
`repo forget <id>` removes only the global record. It does not touch the
repository.

The catalog does not replace `.codex/acf/capsule.acf` or
`.codex/acf/policy.json`. Registration is explicit so test fixtures, CI jobs,
and bootstrap runs never write to a user's global catalog by surprise.

Fork it and rewrite whatever annoys you. Keep only the rules you would defend in a
code review. I want people to begin with a serious setup and edit it, instead of
reconstructing one after every bad run.

## Sources and licenses

Adopted work points back to its source beside the installed skill. The complete
license and notice map lives in [`registry/registry.source.json`](registry/registry.source.json).
Representative source records include
[`core`](registry/sources/attributions/core/SOURCE.json),
[`design-typescript-invariants`](.codex/skills/design-typescript-invariants/SOURCE.json),
[`reduce-reader-load`](.codex/skills/reduce-reader-load/SOURCE.json),
[`separate-shared-state`](.codex/skills/separate-shared-state/SOURCE.json), and
[`writing-great-skills`](.codex/skills/writing-great-skills/SOURCE.json).

Original ACF source is MIT licensed. Adopted source keeps its upstream license and
notice.

## Try it

ACF currently runs from a source checkout and requires Node.js `24.14.0` with pnpm
`10.22.0`.

```powershell
git clone https://github.com/Lungren2/agent-context-framework.git
cd agent-context-framework
pnpm install --frozen-lockfile
pnpm agent-context pack codex-runtime repository-policy --cwd D:\path\to\your-project
pnpm agent-context repo register --cwd D:\path\to\your-project
pnpm agent-context repo status
pnpm agent-context sync --cwd D:\path\to\your-project
```

Agents work on `codex/<task>` branches from the human-owned `development`
branch. They push the task branch and open a pull request to `development`, but
they never merge it.

[`registry`](registry) contains the component manifest. [`docs`](docs/README.md)
contains the architecture notes.
