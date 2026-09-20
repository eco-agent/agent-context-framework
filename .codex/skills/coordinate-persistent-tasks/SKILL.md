---
name: coordinate-persistent-tasks
description: Establish, find, resume, coordinate, or review persistent Codex domain tasks without turning monitoring into a continuous supervisor.
---

# Coordinate persistent tasks

Use Codex tasks as continuing domain owners. A task keeps its own decisions,
corrections, open questions, and work history. Do not replace that context with a
fresh Sol subagent.

## Role split

- Sol Medium owns a domain and is the normal task the user talks to.
- Astra Medium performs one invoked monitoring and delegation pass.
- Luna xHigh gathers ordinary bounded read-only evidence.
- Luna Max investigates one small read-only question when deeper inference is
  worth the additional cost.

Astra and Sol use persistent Codex tasks. Luna returns once and does not own a
domain.

## Find the owner before creating one

Start with one `list_threads` call and the current project's pinned tasks. Each
domain owner has:

```text
responsibility key
stable task title
native task ID
model and reasoning effort
neighbouring responsibilities
```

Use a short lowercase responsibility key such as `auth-sessions`. Give the task
a stable title containing one domain-relevant emoji and the domain name, such as
`🔐 Auth and sessions`. Pin the task. The native task ID is its identity. The
title is a lookup label and does not change when the owner starts another piece
of work.

Reuse the exact task ID when one pinned task owns the responsibility. If no owner
exists, create one Sol Medium task, record its returned task ID, set its stable
title, and pin it. If several tasks claim the responsibility, do not choose the
newest task or create another one. Report the conflicting IDs and ask the user to
select the owner.

Create a projectless task when repository work must stay remote through the
GitHub connector. Put the repository, responsibility key, neighbouring owners,
current objective, and remote-work restriction in its first prompt. Do not create
a local checkout or worktree to obtain project context.

## Continue domain work

Send new work to the existing Sol owner. Include only the changed requirement,
relevant revision, current evidence, affected neighbour, and requested result.
The owner reads deeper history when needed. Do not copy every peer transcript
into the message.

Sol owners communicate directly. They ask Astra for a monitoring pass only when:

- the user asks for a project or task review;
- ownership is missing or conflicts;
- a shared contract changes;
- a consequential cross-domain decision needs review;
- verification fails without an explanation;
- work stalls without a concrete next step;
- the work reaches an explicit review or integration boundary.

Routine progress stays in the owning Sol task.

## Run one Astra monitoring pass

A monitoring request names the trigger, affected responsibility keys, last known
task IDs or revisions, and the decision or delegation needed.

During the pass:

1. List tasks once when the request does not already provide exact IDs.
2. Read only the affected owners and only enough recent state to resolve the
   trigger.
3. Identify stale assumptions, ownership conflicts, blockers, or missing work.
4. Send each action to the existing owner. Create a new owner only through the
   lookup rule above.
5. If a dispatched result is needed before the pass can finish, use one bounded
   event-driven wait against the known task IDs. Otherwise report the dispatch
   and stop.
6. Record the inspected task IDs, revisions, actions, and unresolved decisions.

Do not poll tasks continuously, reread unchanged tasks, create a recurring
automation, or keep Astra active after the pass has produced its report. A later
event starts a new pass.

## Evidence and authority

Luna requests state one question, revision, readable scope, expected evidence,
and stopping condition. Luna remains read-only and returns sources,
contradictions, coverage, and uncertainty. The requesting Sol owner or invoked
Astra monitor decides what the evidence means.

A task completion, review approval, or passing check does not authorize a merge,
deployment, destructive remote action, or write to another owner's branch.
Follow the repository's GitHub workstream rules for branch ownership and
revision-bound verification.

## Completion

Finish coordination only when every affected responsibility has one task ID,
messages went to the existing owners, the Astra pass stopped, and the report
names any duplicate owner, stale revision, running task, missing evidence, or
decision that still needs the user.
