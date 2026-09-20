# Persistent peer configuration

## Intended outcome

Replace the primary-agent and disposable Sol worker configuration with the first usable part of the workflow described in `docs/conversations/sol-luna-policy.md`, corrected by the maintainer's later direction.

## Baseline

- Repository: `Lungren2/agent-context-framework`
- Development commit: `73fb336468e3137d86196c2c38a70c64a2b33578`
- Work branch: `codex/persistent-peer-config`
- Sole writer: this remote GitHub workstream

Repository policy is unconfigured because `.agent-context/policy.json` is absent. No project-contract paths or verification profiles can be taken from it.

## Decisions

- Sol Medium owns continuing domain implementation and is the normal user interaction point.
- Astra Medium performs a bounded monitoring and delegation pass only when invoked by the user, a Sol owner, or a concrete workflow boundary. It never polls continuously.
- Luna xHigh performs normal bounded read-only retrieval.
- Luna Max performs small independent read-only investigations that warrant deeper inference.
- Persistent Codex tasks, not disposable Sol subagents, carry domain responsibility.
- One branch has one active writer. Evidence remains separate from decisions and verification remains tied to the exact candidate.

## Current state

The first slice changes the model profiles and removes the disposable Sol High implementation worker. The invoked Astra workflow and durable peer roster still need canonical owners.

## Topology

- Project default: Sol Medium.
- `default`: Sol Medium domain fallback.
- `scout`: Luna xHigh, read-only.
- `investigator`: Luna Max, read-only.
- Astra: native persistent task invoked for bounded monitoring and delegation.

## Smallest complete slice

Update canonical role sources, installed projections, project defaults, and the registry source description of the role files. Do not claim the peer runtime exists yet.

## Preservation map

- Retained: interrupt delivery, read-only Luna authority, bounded questions, source-referenced evidence, one active writer, focused verification, ordinary prose.
- Changed: project and default Sol reasoning from High to Medium; scout from Luna Max to Luna xHigh.
- Removed: disposable write-capable Sol High worker and primary-agent escalation language.
- Added: separate Luna Max investigator; direct domain-owner coordination; invoked and finite Astra escalation triggers.
- Deferred: persistent peer roster, stable task titles, event cursors, direct message delivery, evidence applicability storage, capacity controls, and workflow projections.

## Non-goals

This slice does not create a continuous Astra supervisor, a new scheduler, autonomous merges, local worktrees, or a second conversation archive.

## Propagation paths

`registry/sources/codex/agents*.toml` owns the role configuration. It projects into `.codex/agents/*.toml` and `.codex/config.toml` through the `codex-agents` registry component. Generated registry data, governance checks, installation tests, and the durable decision record must agree before completion.
