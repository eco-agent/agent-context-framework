# Agent Context Framework

> The agent can type faster than you can review. That is exactly the problem.

Agentic coding is thrilling right up until the diff becomes too large to trust.
A model can tear through an afternoon of work in minutes. It can also misunderstand
the product, invent a second architecture, flatten a convention that took three
incidents to learn, and report success because the code compiled.

The model is not stupid. It entered the repository as a stranger.

Every mature codebase is full of judgment that cannot be recovered by reading the
source tree. There are reasons a module has that shape. There are tests that matter
and tests that waste an hour. There are changes the team refuses to make, failure
modes it has learned to fear, and standards nobody wants to explain for the
hundredth time in chat.

Agent Context Framework gives that judgment a place to live and a way to act.

ACF does not teach an agent how to code. It teaches the agent how this codebase
expects work to happen.

## What changes in the repository

ACF installs a working agreement for agents. It covers how they investigate,
design, change, verify, and report work. Project facts and contract paths connect
that agreement to the actual repository. Specialist skills add deeper judgment
only when a task needs it. Deterministic checks observe the parts that prose cannot
prove.

Once ACF is present, these are the expectations an agent works under:

| When the agent... | ACF requires it to... |
| --- | --- |
| Starts substantial work | Read the contracts the project named, establish a baseline, protect unrelated changes, and keep the work on an owned branch. |
| Encounters an unfamiliar mechanism | Search the repository and maintained dependencies before writing a new implementation from memory. |
| Fixes a hard bug | Reproduce it, reduce it, instrument the uncertain path, fix the cause, and leave a regression check. |
| Changes a TypeScript boundary | Parse untrusted input at the boundary and design types that reject invalid domain states. |
| Builds a frontend | Settle the user task and interface structure before coding, inspect the component system, decide the mobile treatment, and implement the real loading, empty, error, and interaction states. |
| Touches a service or shared state | Define failure, recovery, ownership, and concurrent write behavior before adding another lock or retry. |
| Says the work is done | Run the repository's declared checks, commit the result, and name every skipped check or unverified behavior. |

That is the effect of ACF. The files are incidental. The agent's default behavior
inside the repository is what matters.

It means the repository gets a chance to say "do not rewrite our component system,"
"prove the bug exists first," "leave my unrelated changes alone," and "that test
does not prove what you think it proves" before a maintainer has to type any of it.

The aim is to give maintainers their attention back. Review should be about the
hard product and architecture decisions, not policing the same preventable mistake
for the fifth time that week.

## The right discipline arrives at the right moment

A giant instruction file is not the answer. Models have limited attention, and a
rule buried among hundreds of unrelated rules may as well be absent.

ACF keeps one set of repository-wide expectations active throughout the task.
Detailed guidance lives in skills with narrow triggers. A difficult regression
loads a diagnosis loop. A new network boundary loads failure and recovery design.
A substantial frontend change loads product framing and interface discipline. The
agent does not need the full text of all three while renaming a variable.

This separation matters. Universal rules stay hard to escape. Specialist judgment
shows up close to the decision it can change. Repository facts remain owned by the
project rather than guessed anew in every session.

## Why not just install some skills?

You should use good skills. ACF is built on the belief that the best ideas should
be adopted, attributed, tested, and improved rather than rewritten from memory.
The registry already contains pinned, licensed adaptations of work from Matt
Pocock and pstack.

But these projects solve different problems.

[`skills.sh`](https://skills.sh/) is an open discovery and distribution ecosystem.
It helps you find reusable capabilities and make them available to many agents.
That is valuable. It does not decide which rules must govern every task in your
repository, how a skill relates to project contracts, or what evidence your team
accepts before work is complete.

[`mattpocock/skills`](https://github.com/mattpocock/skills) is a strong collection
of composable engineering practices. It attacks recognizable failures such as
misalignment, weak feedback loops, muddy domain language, and architecture decay.
Install it when you want those practices. ACF asks the next question: how do
selected practices become part of this repository's durable working agreement,
with explicit authority and checks that match the project?

[`pstack`](https://github.com/cursor/plugins/tree/main/pstack) is an opinionated
engineering workflow with roles, playbooks, principles, multi-model routing, and
long-running modes. It gives the user a powerful way to invoke rigorous work. ACF
keeps its baseline active before any skill is invoked. The project should not
depend on someone remembering to type a mode command before the agent protects
local work, reads the right contract, or reports missing verification.

ACF is not trying to win by having the most skills. It is trying to make a coherent
engineering system out of the ones a project trusts.

A skill can be excellent and still arrive too late. It can conflict with a project
rule, assume a tool the repository does not have, or declare victory using a check
that proves the wrong thing. ACF gives each kind of context an owner:

- The protected baseline owns behavior that must survive every task.
- Project contracts own local architecture and stricter rules.
- Skills own conditional, task-specific judgment.
- Repository policy owns facts and named verification profiles.
- Code owns mechanical observations such as hashes, path boundaries, dependency
  closure, and exact changed-file selection.

The hierarchy is the product. The installer only puts it on disk.

## What ACF believes

**Code is cheap now. Judgment is not.** Generating more code is no longer the hard
part. The hard part is preserving a system that remains understandable, operable,
and worth changing six months later.

**A rule that arrives after the edit is dead.** Context has to appear at the
decision point. Repeating the same instruction in more files only creates drift
and makes the important copy harder to find.

**Autonomy needs memory.** A fast agent without project memory repeats old mistakes
at machine speed. ACF stores durable decisions in the repository and uses bounded
task evidence when work must survive a long session.

**A boundary without evidence is a wish.** "Be careful" is not a safety system.
The repository needs to name what the agent may change, which check observes the
result, and what the agent can do when the normal path is blocked.

**The project must remain in charge.** Framework policy can provide a protected
minimum. The repository owns its facts, names its contracts, and may impose stricter
rules. ACF reports conflicts and drift instead of quietly deciding that the
framework knows better.

## What you can adopt

Every ACF repository starts with the core working agreement. From there, a project
can select only the disciplines it needs:

- Engineering skills for diagnosis, reuse, operational boundaries, shared state,
  readable code, and evidence-backed technical writing.
- TypeScript guidance for domain types, boundary parsing, schemas, and persistence.
- Frontend guidance for product framing, established interfaces, accessibility,
  visual systems, responsive behavior, and motion.
- Repository policy for explicit project facts, contract paths, and named checks.
- Optional Codex agents, hooks, bounded repository access, and workflow authoring.

These are not generic commandments pasted into one enormous prompt. Each layer has
an owner, a trigger, a boundary, an observation, and a permitted next step when the
main path cannot continue.

## What ACF cannot promise

ACF cannot turn a weak model into a strong one. It cannot guarantee that a model
attended to every instruction, and it does not audit the model's private context.
It cannot replace a maintainer's taste or make a bad product decision good.

What it can do is stop leaving project judgment to chance. It can put that judgment
where the agent can use it, preserve it across sessions and contributors, and make
important claims answer to evidence in the repository.

That is a smaller promise than autonomous software engineering. I think it is also
the promise that matters.

## Try it in a repository

ACF currently runs from a source checkout. It requires Node.js `24.14.0` and pnpm
`10.22.0`.

```powershell
git clone https://github.com/Lungren2/agent-context-framework.git
cd agent-context-framework
pnpm install --frozen-lockfile
pnpm agent-context setup --cwd D:\path\to\your-project
```

The setup screen shows the available layers, their source, dependencies, required
capabilities, and the exact project changes before installation. The equivalent
CLI preview is available with `pnpm agent-context plan`.

ACF never pushes or deploys. Codex loads project configuration only after the
repository is trusted. The isolated runtime stays under `.agent-context/runtime`
and does not enter the application's package graph.

## Source and development

The component registry and pinned attribution live in [`registry`](registry).
Maintainer decisions live in [`registry/decisions`](registry/decisions). The
implemented objective-workflow boundary is documented in [`docs`](docs/README.md).

Project-authored distributable source is MIT licensed. Adapted third-party source
keeps its upstream revision, attribution, license, and notices.
