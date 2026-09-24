> Keep checkpoint commits small and frequent. When the GitHub connector can
> write to the repository, use the `github-workstreams` skill and leave the
> user's local checkout untouched. Start remote agent work from `development`
> on a `codex/<task>` branch, open a draft pull request to `development`, and
> never merge it.

# Agent Context Framework

- `main` is the deployment branch. `development` is the human-owned local
  integration branch. Agents may write only their remote `codex/<task>` branch
  through the GitHub connector and may open or update its pull request to
  `development`. Humans own local execution, integration, merge, and deployment.
