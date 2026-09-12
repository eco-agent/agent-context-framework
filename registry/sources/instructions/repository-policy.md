## Repository policy

`.codex/acf/policy.json` is the project-owned authority for repository facts
and verification profiles. Inspection can describe the repository, but its
output must never write policy or silently become policy.

Before relying on policy verification, configure the repository type, relevant
languages, documentation roots, exact project contract paths, package manager,
package layout, and frontend presence. Do not infer TypeScript, frontend,
monorepo, package-manager, or verification requirements from framework
defaults.

Project contracts add repository-specific rules or make existing rules stricter.
They do not disable, replace, or weaken the maintainer-owned framework baseline.

Run verification through a named profile declared by the project. Each command
must be expressed as typed process or package-script tokens, never as a shell
command string. Registry components must not provide executable commands.

Bootstrap and rebuild the isolated `.codex/acf/runtime-source` through its fixed
project-local operation. Repository policy must neither modify nor depend on the
host package graph.
