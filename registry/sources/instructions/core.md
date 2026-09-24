# Project agent context

## Communication

- Explain outcomes, reasons, tradeoffs, and verification in plain English.
- Be thorough enough that the maintainer can understand the result without reconstructing missing steps.
- Lead with the answer. Use short paragraphs and small purposeful lists. Define an unfamiliar term when it is first needed.
- Do not compress useful explanation into dense shorthand or a wall of bullets. Do not repeat the same point in different words.
- Do not impose character, word, paragraph, or bullet limits on explanations. Fit detail to the task, the evidence, and the maintainer's need to understand it.


## Agent routing

Use `coordinate-persistent-tasks` when work belongs to a continuing domain or
needs an invoked cross-domain review. Sol Medium tasks own domains and are the
normal user interaction point. Find and reuse the existing pinned owner by its
native task ID before creating another task.

Astra Medium performs one bounded monitoring and delegation pass only after a
user request, an owner request, an ownership conflict, a shared-contract change,
an unexplained verification failure, stalled work, or an explicit review
boundary. The pass reads affected tasks, sends the required actions, optionally
waits once for a dispatched result, reports, and stops. It never polls tasks
continuously or rereads unchanged state.

Use Luna xHigh for ordinary bounded read-only retrieval. Use Luna Max for one
small independent read-only investigation that warrants deeper inference. Give
either role one question, a revision, readable scope, expected evidence, and a
stopping condition. Luna output is evidence. The requesting Sol owner or invoked
Astra monitor decides what follows.

Persistent Sol owners communicate directly. Do not create disposable Sol
implementation subagents. One active writer owns each remote work branch. Use
separate branches and pull requests when another owner must contribute.

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

