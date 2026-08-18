# Documentation

The framework documentation records the portable objective and context-control
boundary. Product requirements and Control Tower architecture remain in the
Control Tower repository.

## Architecture

- [ADR-0027 — Portable objective orchestration](adr/0027-portable-objective-orchestration.md)
  defines the stable kernel, adapter, persistence, lease, checkpoint, budget,
  and work-directory decisions.
- [Portable objective orchestration](architecture/portable-objective-orchestration.md)
  describes the implemented stores, task-envelope launcher, Codex adapter,
  recovery behavior, and operational commands.
