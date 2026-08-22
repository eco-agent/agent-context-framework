# Repair repository-context resume

## Intended outcome

Codex Desktop can resume a task in a repository installed from the ACF registry. The required `repo_context` MCP server starts from the task repository, completes its MCP handshake, and remains fail-closed if the server itself is unavailable.

## Ownership and baseline

- Framework owner: `codex/repair-repo-context-resume`
- Framework baseline: `e1ec7f33f1c450af4745a882645f976fc2e94f53`
- Downstream owner: `D:\dev\business-operating-system`, branch `codex/install-acf`
- Downstream baseline: `51a21d1d25e3dbe5ead7db6cc5fca9c66589b9b0`
- Canonical owner: `registry/sources/codex/repo-context.toml`
- Generated and installed projections: `registry/registry.json` and downstream `.codex/config.toml`

## Current state and evidence

- Codex Desktop repeatedly fails to resume the downstream task with `connection closed: initialize response` for the required `repo_context` server.
- Desktop logs show failure within two seconds. The 20-second startup timeout is not reached.
- The installed server completes the current MCP initialize exchange in the repository-owned integration test and in a direct protocol probe when its process starts in the repository root.
- The generated config sets `cwd = "."`. A long-lived Desktop app process can resolve that value against its own working directory before Node evaluates the repository-relative script argument.
- A working project-scoped ACF config omits `cwd`; Desktop then starts the MCP process from the task repository.

## Decision

Remove the explicit relative `cwd` member from the canonical repository-context MCP table. Keep the repository-relative script and `--root .` arguments. Codex will inherit the task repository working directory, which is the context that selected the project-scoped config.

The process boundary remains required and fail-closed. There is no retry because an MCP initialization failure is reported once by Codex, the boundary owner. The existing startup and tool timeouts remain unchanged.

## Preservation map

- Preserve `required = true` and the existing timeout values.
- Preserve the project-local generated runtime and portable relative paths.
- Preserve the read-only `repo_context` tool allowlist.
- Replace only the ambiguous explicit `cwd = "."` member.
- Keep the canonical source, generated registry, installer projection, decision record, and regression checks in sync.

## Smallest complete slice

1. Add a regression check that rejects an explicit relative working directory in this owned MCP table.
2. Update the canonical registry source and generated registry revision.
3. Run focused registry and installer checks.
4. Upgrade `business-operating-system` through the official installer.
5. Resume its existing Codex task and confirm the handshake succeeds.
6. Commit both repositories and run the declared final acceptance once from clean revisions.

## Non-goals

- Do not make the MCP server optional.
- Do not add retries, absolute machine paths, compatibility config, or another launcher.
- Do not alter the repository-context protocol or tool behavior.

## Propagation paths

`registry/sources/codex/repo-context.toml` -> registry metadata and decision evidence -> generated `registry/registry.json` -> installer projection -> downstream `.codex/config.toml` -> Codex Desktop subprocess launch -> MCP initialize response.

## Closure

Status: in progress.

