# Work record: agent swarm policy

## Outcome

Replace the two-subagent bootstrap profile with an authority-based routing policy.
The primary Sol agent may launch independent read-only Luna scouts in parallel,
combine their evidence, recover from failed delegation, and keep repository
decisions and mutations with Sol.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Baseline | Start from `cd0516aa39472f64a460028a05449ae4e71fe244` on `codex/agent-swarm-policy`. | Git |
| Concurrency | Remove the project-owned thread ceiling. Let Codex and the provider expose runtime capacity, and report when that capacity blocks another scout. | Codex runtime |
| Investigation | Use multiple Luna Max scouts for independent read-only questions that can return once. | Primary Sol agent |
| Evidence | A scout returns cited repository facts, uncertainty, and contradictions. It does not decide or write repository state. | Scout role |
| Mutation | Keep the worker role, but run it on Sol High. Give each writer exclusive ownership of its files or branch. | Primary Sol agent |
| Failure recovery | Replace one transiently failed evidence lane once. After the same lane fails twice, Sol continues directly or reports the missing evidence. | Primary Sol agent |
| Registry | Advance the governed registry to `0.12.0` and record the routing policy in a durable decision. | Registry governance |

## Preservation map

| Behavior | Classification | Result |
| --- | --- | --- |
| Sol handles general work and architecture judgment. | Retained | The default and worker roles use Sol High. |
| Luna collects bounded repository evidence. | Retained and strengthened | The scout stays Luna Max and read-only; its return contract now names evidence and uncertainty. |
| Subagents cannot create their own work trees. | Retained | Role prompts still forbid starting other agents. |
| The primary owns product and architecture decisions. | Retained and strengthened | The core policy makes scout output evidence and reserves synthesis and repository decisions for Sol. |
| Two spawned threads per session. | Removed | No measured runtime boundary supports this limit. |
| Global fallback model and effort fields in `[agents]`. | Removed | Current roles select their model and effort in their own files. |
| Luna performs bounded implementation. | Changed | The worker keeps the same job but moves to Sol High. |
| Proactive delegation has no project instruction. | Added | The core policy requires parallel scouts for independent read-only evidence lanes. |
| Repeated delegation failure has no grace path. | Added | Sol retries one transient failure, then works directly or reports the gap. |

## Boundaries

| Owner | Boundary | Observation | Grace path |
| --- | --- | --- | --- |
| Scout role | Read-only repository investigation only. | `sandbox_mode = "read-only"`, role prompt, and agent-profile tests. | Return the missing fact or ambiguity to Sol. |
| Primary Sol | Scout results cannot become repository decisions without synthesis. | Protected core instruction and governance projection. | Sol inspects ambiguous evidence directly. |
| Sol worker | One assigned mutable scope and no nested delegation. | Sol model selection, role prompt, and single-writer project policy. | Stop and return an unresolved architecture decision. |
| Codex runtime | Project policy does not impose a thread ceiling. | Canonical TOML omits a thread-limit member and doctor rejects the obsolete field. | Report runtime capacity and continue with the available lanes. |
| Primary Sol | One retry for a transiently failed evidence lane. | Core instruction requires the failure count in the final report when evidence remains missing. | Continue directly after the second failure. |

## State

The branch is clean at the recorded baseline. Repository policy is configured and
declares no project contract paths. Current local Codex source reports classic
multi-agent as stable. Its `agents.max_threads` setting enforces a cap only when
present.

## Topology

```text
primary Sol
|-- Luna scout, read-only evidence lane
|-- Luna scout, read-only evidence lane
|-- Luna scout, read-only evidence lane
`-- Sol worker, one exclusive mutable scope when delegation helps
```

## Smallest complete slice

1. Add the routing, authority, and recovery policy to the canonical core instructions.
2. Remove obsolete agent globals and the two-thread ceiling from canonical Codex configuration.
3. Move the worker role from Luna Max to Sol High and tighten both role return contracts.
4. Carry the sources through root projections, registry ownership, governance, tests, and README documentation.
5. Run the focused agent, registry, prose, and documentation checks.

## Replacements

- Replace a fixed concurrency scalar with runtime-owned capacity.
- Replace write-enabled Luna work with an explicitly scoped Sol worker.
- Replace implicit delegation judgment with a concrete read-only routing rule and failure path.

## Non-goals

- No durable objective workflow, queue, scheduler, deployment, or provider change.
- No global Codex configuration change.
- No permission for concurrent writers to share one file, index, branch, or record.
- No claim that more agents improve the intelligence of any individual result.

## Propagation

- `registry/sources/instructions/core.md` to installed `AGENTS.md` and governance hash.
- `registry/sources/codex/agents.toml` to `.codex/config.toml`, registry ownership, doctor, and installation tests.
- Canonical role TOMLs to `.codex/agents`, governance hashes, README, and model-profile tests.
- Registry revision and decision path to generated registry, governance, and revision assertions.

## Closure

In progress.
