> Make checkpoint commits often. Push only when the user explicitly requests
> it. Give each logical work stream its own branch. Create an ephemeral worktree
> only when concurrent work or an isolated check needs another checkout.
> Keep long-running task evidence in `.codex/work` Markdown. Use the `visualize`
> skill when an in-conversation visual would materially improve understanding.
> Create a standalone HTML response file only when the user asks for an export.

# Agent Context Framework

- Preserve unrelated changes. Push only when the user explicitly requests it.
  Never deploy without an explicit user request.
