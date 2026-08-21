# Work record: frontend policy repairs

## Outcome

Tailwind projects use Tailwind utilities as their normal styling representation,
frontend work reuses the project's component library before creating replacements,
and typography guidance no longer invites arbitrary line-height or tracking.
Base frontend policy also rejects decorative separators without a structural or
state reason.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Tailwind and CSS precedence | In a Tailwind project, Tailwind represents every style it can express cleanly. Raw CSS owns the narrow exceptions named by the Tailwind skill. | `tailwind-css-architect` |
| Component reuse | Inspect and use the established component system before creating a component. Build a replacement only for a recorded mismatch. | Base frontend policy and `frontend-design-discipline` |
| Composite widgets | Use an installed accessible component primitive when it owns the behavior. If none exists, assess maintained reuse before hand-writing composite behavior. | Base frontend policy and `frontend-design-discipline` |
| Typography adjustment | Keep established type roles and font metrics. Use named role values, and allow tracking or line-height exceptions only with evidence. | `design-web-typography` |
| Decorative separators | A border or divider needs a structural, grouping, state, or interaction purpose. | Base frontend policy |
| Registry revision | Publish the policy change as registry `0.8.7`. | Registry source |

## State

- Baseline: `1433f0d02930d3daacc4e006a27f5a44adca6423`.
- Branch: `codex/frontend-policy-repairs`.
- Repository policy: `.agent-context/policy.json` is not configured.
- Unrelated user file: `.codex/work/headless-interface-evaluation-assistant-turns.md` remains untouched.
- `writing-great-skills` is not available. The installed `skill-creator` owns skill-authoring guidance for this task.

## Topology

The base `frontend` instruction sets the component-reuse and separator rules.
`frontend-design-discipline` applies those rules while reconciling an approved
design with the current component tree. `frontend-tailwind` selects the
Tailwind-specific representation. `tailwind-css-architect` decides whether a
style remains in markup or needs raw CSS. `design-web-typography` owns type roles
and metric exceptions. The registry packages these sources and context governance
protects their model-facing meaning.

## Slice

1. Patch the canonical frontend instruction and the three owning skills, update
   governance and registry metadata, rebuild the generated registry, then prove
   the changed instructions pass structural, prose, registry, and focused tests.

## Replacements

- Replace repetition and stable component roles as sufficient reasons to move
  Tailwind styling into CSS.
- Replace passive component-system preservation with an inspection and reuse
  requirement.
- Replace general permission for tight heading leading and negative tracking
  with named roles and evidence-backed exceptions.
- Replace border guidance limited to elevated Tailwind surfaces with a base
  frontend rule.

## Non-goals

- Do not add CSS custom-property parameter guidance in this pass.
- Do not add `responsive-css-architect` to the base `frontend` component yet.
- Do not select or install a component library for consumer projects.
- Do not change product-design or accessibility ownership.

## Propagation

- Canonical sources: `registry/sources/instructions/frontend.md`,
  `registry/sources/instructions/frontend-tailwind.md`, and the accessibility,
  typography, frontend design, responsive CSS, and Tailwind skill directories.
- Registry owners: `registry/registry.source.json`, generated
  `registry/registry.json`, `registry/context-governance.json`, and a durable
  `registry/decisions/0.8.7-frontend-implementation-policy.md` decision.
- Verification: skill validation, agent prose, registry build/check, registry
  tests, and the relevant package typecheck.

## Verification evidence

- All five changed skill directories passed the `skill-creator` structural
  validator. Typography was validated again after its last edit.
- `check-agent-prose` passed for 14 changed model-facing Markdown files. Its
  first run found three inherited inline-header labels in the changed variable
  font reference. Those labels were rewritten before the passing run.
- `registry:build` produced registry `0.8.7` with 30 components.
- `registry:check` passed after the final generated registry and governance
  updates.
- The focused context registry and governance suite passed all 23 tests. Its
  first run exposed governance fixtures that did not copy the newly protected
  skills. The fixture now copies every protected skill directory.
- The two frontend installation tests passed again after adding direct
  typography and Tailwind anti-dilution assertions.
- The dev-tooling TypeScript project passed typecheck.
- `check:agents` passed.
- `git diff --check` passed.
- Browser review and broad acceptance were not run. This task changes framework
  instructions and registry tooling, and repository policy is unconfigured.

## Closure

| Field | Value |
| --- | --- |
| Status | `active` |
| Final revision | `uncommitted` |
| Durable destination | `registry/decisions/0.8.7-frontend-implementation-policy.md` |
| Retention reason | Active task state only |
| Cleanup | No temporary worktree, process, or private ref created |
