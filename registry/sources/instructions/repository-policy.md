## Repository policy

- Treat `.agent-context/policy.json` as the project-owned authority for repository facts and verification profiles. Inspection output is observational and must never write or silently become policy.
- Configure repository type, relevant languages, documentation roots, exact project contract paths, package manager, package layout, and frontend presence explicitly before relying on policy verification.
- Treat declared project contracts as additive or stricter repository policy. They do not disable, replace, or weaken the maintainer-owned framework baseline.
- Run verification through a named project-declared profile. Commands are typed process or package-script tokens, not shell command strings, and registry components must not supply executable commands.
- Bootstrap and rebuild the isolated `.agent-context/runtime` through its fixed project-local operation. Repository policy must not modify or depend on the host package graph.
- Do not infer TypeScript, frontend, monorepo, package-manager, or verification requirements from framework defaults.
