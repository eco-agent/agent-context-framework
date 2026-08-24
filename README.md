# Agent Context Framework

> Stop rebuilding the rules of your codebase in every chat.

Your coding agent is only as project-aware as the context it receives. Agent
Context Framework, or ACF, turns that context from a personal prompt habit into a
versioned part of the codebase. It installs the instructions, specialist skills,
repository facts, checks, and Codex runtime pieces a project chooses as ordinary
files that can be read, reviewed, and changed in Git.

ACF does not try to make the model smarter. It puts universal rules at the project
entry point and detailed guidance near the decisions that need it. The team can
then see and govern the setup that shaped the agent's work.

## The problem is usually not the prompt

A capable coding agent can still make poor decisions when the project's rules are
missing, vague, or buried in the wrong place. It may not know which document owns
the architecture, when a broad test is allowed, how the team handles local Git
changes, or which design constraints matter on mobile.

Most agent setup handles this with some mixture of personal configuration, a large
`AGENTS.md`, copied skill folders, and reminders typed into chat. That can work for
one person and one session. It is hard for a team to answer basic questions later:

- What instructions was the project configured to give the agent?
- Which rules belong to this project and which came from one developer's machine?
- Which specialist guidance is available, and when should it load?
- Can we update shared guidance without erasing local changes?
- Will a fresh checkout behave the same way?

ACF treats those as repository design questions. If agent behavior affects the
codebase, the inputs to that behavior should be reviewable with the codebase.

## When ACF earns its keep

If a short `AGENTS.md` already covers one developer's needs, ACF may be more
machinery than the project needs. It becomes useful when several people or agents
work in the same repository, when the rules matter enough to review, or when a
team is tired of copying and repairing the same setup across projects.

It is especially useful when the project needs specialist workflows without
forcing every instruction into every task. A frontend redesign, a production
failure, and a TypeScript persistence change should not consume the same context
or follow the same procedure.

## Think of it as shadcn for agent context

ACF distributes source rather than hiding behavior behind a service or a global
installation. You choose components from a registry, preview the complete change,
and materialize them into the project.

A selection can produce files like these:

```text
your-project/
|-- AGENTS.md                    project-wide operating rules
|-- .codex/
|   |-- config.toml              selected Codex configuration
|   |-- hooks.json               selected hook definitions
|   `-- skills/                  task-specific guidance
`-- .agent-context/
    |-- config.json              the components the project selected
    |-- lock.json                exact ACF ownership and source revisions
    |-- policy.json              repository facts, when selected
    `-- runtime/                 isolated runtime packages, when selected
```

Only the selected files and scopes are installed. The files stay visible. The
lock records which sections, configuration values, and files came from ACF so the
installer can distinguish framework-owned content from project-owned content.

This is the practical difference:

| Without ACF | With ACF |
| --- | --- |
| Agent setup lives in personal configuration or chat history | Agent setup travels with the repository |
| A copied rule has no clear source or update path | Installed source and its revision are recorded |
| More guidance usually means a larger prompt | Specialist skills load for the tasks that call for them |
| Updating shared files risks replacing local work | Ownership is tracked at the file or structured scope |
| Repository assumptions are inferred during a run | The project declares its own facts and contract paths |

## How the loop works

1. **Select.** Choose the layers and individual skills that fit the repository.
   ACF resolves their dependencies instead of treating the registry as a flat
   folder of prompts.
2. **Inspect.** Read the actual source, required capabilities, licenses, transitive
   components, target paths, drift, and conflicts before anything changes.
3. **Install.** ACF writes the approved result through a transactional installer.
   The browser setup screen uses the same planner and installer as the CLI.
4. **Work.** Codex reads the repository's instructions and routes matching work to
   the installed skills when their triggers apply. Optional hooks and bounded
   repository tools stay inside the project.
5. **Update.** A normal update preserves locally edited managed content. An
   overwrite must be explicit and is limited to the selected ACF-owned scopes.

The result is not a magic prompt. It is a maintained contract between the project
and the agents that work on it.

## Why ACF is built this way

**The repository is the unit of truth.** A project should not depend on a hidden
user-global setup to make its agent rules reviewable. A fresh trusted checkout
should contain the same project rules and selected configuration.

**Context is selected, not piled on.** Models have limited attention. Universal
rules belong at the entry point, while detailed procedures belong in skills that
load for a specific kind of work. Adding more text everywhere makes important
instructions easier to miss.

**Intent and enforcement have different jobs.** Prose explains judgment,
permissions, tradeoffs, and what to do when the main path is blocked. Deterministic
checks own facts such as hashes, path containment, dependency closure, generated
output, and exact configuration ownership.

**The project remains an author.** ACF can seed project-owned policy, but it does
not keep control of that file afterward. Project contracts may add detail or set
stricter requirements. Framework-managed safety rules remain protected and drift
is reported instead of silently accepted.

**A boundary must be observable.** Instructions alone cannot prove that a rule was
followed. ACF pairs important boundaries with a diff, artifact, check, or report,
plus a defined next step when the boundary blocks the requested work.

## What you can install

ACF is composable. Start with a layer and add individual skills when the project
needs them.

| Selection | What it adds |
| --- | --- |
| `core` | The protected operating baseline and ACF ownership records. Every initialized project starts here. |
| `engineering` | Focused workflows for diagnosis, reuse, operational boundaries, shared state, refactoring, and technical writing. |
| `typescript-engineering` | The engineering layer plus TypeScript domain and persistence invariants. |
| `frontend` | Product framing, established-product research, accessibility, typography, color, interface detail, and motion guidance. |
| `frontend-tailwind` | The frontend layer plus responsive CSS and explicit Tailwind CSS v4 guidance. |
| `repository-policy` | Project-owned repository facts and named verification profiles in an isolated runtime. |
| `codex-runtime` | Project-local Codex agents, hooks, and a bounded repository-context tool. |
| `session-quality` | Evidence-based review of completed Codex sessions. |
| `skill-authoring` | Guidance and checks for writing predictable skills. |

The setup screen also exposes individual skills. You can inspect their complete
source before selecting them.

## Try ACF

ACF currently runs from a source checkout. It requires Node.js `24.14.0` and pnpm
`10.22.0`.

```powershell
git clone https://github.com/Lungren2/agent-context-framework.git
cd agent-context-framework
pnpm install --frozen-lockfile
pnpm agent-context setup --cwd D:\path\to\your-project
```

`setup` opens a token-protected local interface. Choose components, inspect their
source and installation plan, then install. The browser cannot write to the target
project directly. It sends the approved selection to the local server, which uses
the same registry validation and transactional materializer as the CLI.

To preview a selection without opening the setup screen:

```powershell
pnpm agent-context plan typescript-engineering repository-policy --cwd D:\path\to\your-project
```

To use the lifecycle directly:

```powershell
pnpm agent-context init --cwd D:\path\to\your-project
pnpm agent-context add engineering --cwd D:\path\to\your-project
pnpm agent-context inspect --cwd D:\path\to\your-project
pnpm agent-context diff --cwd D:\path\to\your-project
pnpm agent-context update --cwd D:\path\to\your-project
pnpm agent-context doctor --cwd D:\path\to\your-project
```

`inspect`, `plan`, `diff`, and `doctor` are read-only. If an interrupted write is
safe to resume, `pnpm agent-context recover` completes it. The CLI never pushes or
deploys.

## Trust and limits

ACF is deliberately project-scoped, but installing agent configuration still
deserves review.

- Codex loads project configuration and skills only after the repository is
  trusted.
- Capability declarations report requirements. They do not claim that a host tool
  or service is present.
- Hooks are dormant without a valid session-scoped binding. An invalid active
  binding fails closed.
- The repository-context tool allows bounded reads and fixed-string searches only
  inside its authorized root.
- Skill routing and progressive frontend references describe what should load.
  They do not audit the model's actual context exposure or create isolated workers.
- The optional workflow-authoring skill installs source and templates only. No
  bundle selects it by default, and selecting it does not start a workflow or add
  Codex SDK dependencies to the application.
- The isolated runtime lives under `.agent-context/runtime`. ACF does not modify
  the application's package manifest or lockfile to install it.
- ACF does not infer repository policy, alter user-global Codex configuration,
  push, publish, or deploy.

## Working on ACF

The registry is the source of distributable components. Registry entries record
dependencies, artifacts, capabilities, revisions, licenses, notices, and content
hashes. Maintainer decisions live in [`registry/decisions`](registry/decisions),
while the implemented objective-workflow boundary is documented in
[`docs`](docs/README.md).

Use the repository's focused verification profiles while developing:

```powershell
pnpm --filter @agent-context/dev-tooling test
pnpm --filter @agent-context/repo-policy test
pnpm registry:check
pnpm typecheck
```

Project-authored distributable source is MIT licensed. Pinned third-party source
keeps its packaged attribution, license, and notices.
