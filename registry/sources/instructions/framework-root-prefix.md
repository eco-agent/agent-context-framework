> Make checkpoint commits often. Start agent work from `development` on a
> `codex/<task>` branch. Use one writer per checkout and do not create worktrees.
> Push the task branch and open a pull request to `development`, but never merge
> it. Use the `visualize` skill when an in-conversation visual would materially
> improve understanding. Create a standalone HTML response file only when the
> user asks for an export.

# Agent Context Framework

- Preserve unrelated changes. Agents may push only their `codex/<task>` branch
  and open or update its pull request to `development`. Humans own
  `development`, integration, and merge. Never deploy without an explicit user
  request.
