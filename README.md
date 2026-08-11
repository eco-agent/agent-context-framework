# Agent Context Framework

Agent Context Framework is a project-local, source-owned setup system for coding
agents. A repository selects explicit components, materializes ordinary reviewable
files, and records deterministic ownership in `.agent-context/lock.json`. It does
not require user-global Codex configuration and never pushes or deploys.

The distribution model is intentionally shadcn-like: installed files belong in
the project and remain visible in Git, while structured ownership lets updates and
removal preserve unrelated project content.

## Selectable layers

- `core` installs the protected working, communication, project-contract, and
  focused-verification baseline into a managed `AGENTS.md` section.
- Engineering, TypeScript, session-quality, skill-authoring, and frontend
  components install only their declared instructions, templates, and skills.
- `frontend` and `skill-responsive-css-architect` are plain-CSS neutral.
  `frontend-tailwind` explicitly adds the separate Tailwind instruction and
  `skill-tailwind-css-architect` closure.
- `codex-runtime` is dependency-only. It selects project agents, bounded hooks,
  and bounded repository context without selecting repository policy.
- `repository-policy` installs its isolated runtime and seeds
  `.agent-context/policy.json`. The seed is project-owned immediately: framework
  update, overwrite, and removal do not rewrite or delete it.

Registry components declare their dependencies, artifacts, required and
recommended capabilities, source revisions, licenses, notices, and
content-addressed component revisions. Project-authored distributable source is
MIT licensed; pinned third-party source retains its packaged attribution and
notices.

Bounded Codex SDK workflow authoring is available only through the explicitly
selected `skill-orchestrate-codex-workflows` component. It installs inert skill
and template source; it does not install SDK dependencies, create or execute a
workflow, produce hook bindings, or edit the consumer's manifests or lockfiles.
No existing
bundle selects it transitively. Its plan and setup disclosures report required
Node.js, network, and Codex-authentication capabilities; those declarations do
not activate or test a live Codex session. Its bundled JSONL ledger is a
single-process audit record, not a crash-restorable workflow checkpoint.
Objective kernels, objective runtimes,
schedulers, queues, databases, task envelopes, binding producers, adaptive
agent hierarchies, sibling quorums, and long-running unbounded loops remain
outside every distributable closure.

## Protected instructions and project contracts

Required framework instructions are maintainer-owned canonical policy. Their
sources, hashes, installed projections, registry decision, and CODEOWNERS paths
move together under governance checks. Project instructions may add detail or
stricter requirements, but they must not remove, override, or weaken the protected
baseline; local edits to managed instruction scopes are reported as drift.

A configured repository policy declares exact project contracts in
`repository.projectContracts`, separately from documentation roots. Agents read
those exact files before implementation instead of guessing which document owns
architecture. Repository-policy doctor rejects a declared documentation root or
project contract that does not exist.

## CLI and localhost setup

Use Node.js `24.14.0` and pnpm `10.22.0`. From this source checkout:

```powershell
pnpm install --frozen-lockfile
pnpm agent-context --help
pnpm agent-context setup --cwd D:\path\to\project
```

`setup` starts a token-protected loopback web interface and opens it locally. The
browser client cannot write files directly; installation goes through the same
registry decoder, dependency resolver, ownership planner, and transactional
materializer as the CLI. Use `--no-open` to print the local URL without launching
a browser and `--port` to request a fixed loopback port.

The underlying lifecycle remains available directly:

```powershell
pnpm agent-context init --cwd D:\path\to\project
pnpm agent-context inspect --cwd D:\path\to\project
pnpm agent-context plan codex-runtime repository-policy --cwd D:\path\to\project
pnpm agent-context diff --cwd D:\path\to\project
pnpm agent-context add codex-runtime --cwd D:\path\to\project
pnpm agent-context update --cwd D:\path\to\project
pnpm agent-context doctor --cwd D:\path\to\project
pnpm agent-context recover --cwd D:\path\to\project
```

`plan` is the component-aware dry run. It resolves current selections plus all
requested additions through the real installer planner and reports direct versus
transitive components, dependency-only bundles, artifact and target footprint,
capabilities, licenses/notices, trust and activation requirements, planned writes,
drift, and conflicts without changing project state. `inspect` embeds the same
preview for the currently configured selection. The localhost setup UI requests
that same server-owned preview before enabling installation; the browser does not
reimplement dependency resolution or infer whether a component is a bundle.

Normal update preserves locally modified managed content and blocks ambiguous
ownership. `update --overwrite` is explicit and may replace only selected
registry-owned scopes. `recover` resumes only a transaction whose staged and
current hashes still match its journal boundary.

## Operational requirements

- Codex loads project-scoped configuration or skills only for a trusted
  repository.
- `codex-hooks` installs hook definitions and entrypoints, but enforcement is
  dormant without a valid session-scoped binding. A missing binding emits no
  decision; a present malformed, stale, or mismatched binding remains fail-closed.
- `codex-repo-context` requires `ripgrep` and exposes only authorized-root,
  root-safe, bounded fixed-string read/search over MCP stdio.
- Capability declarations are requirements, not claims that a host executable or
  service was detected. Doctor reports them without silently inferring policy.
- The isolated runtime is bootstrapped under `.agent-context/runtime`; framework
  installation does not modify the host package manifest, lockfile, or application
  dependency graph.

## Development and evidence

Useful focused commands are:

```powershell
pnpm --filter @agent-context/dev-tooling test
pnpm --filter @agent-context/repo-policy test
pnpm registry:check
pnpm typecheck
```

Broad acceptance is intentionally sequenced once from a clean committed framework
revision and controlled downstream fixture:

```powershell
pnpm --silent verify:acceptance -- --fixture D:\path\to\fixture
```

Durable phase and closure evidence lives in `.codex/work`; governed registry
decisions live in `registry/decisions`.
