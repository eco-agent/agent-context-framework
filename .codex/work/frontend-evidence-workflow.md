# Work record: frontend evidence workflow

## Outcome

Make ACF preserve the visual evidence that gives frontend language meaning, and
route frontend work by its approved design stage instead of forcing every effort
into an early vertical slice.

## Decisions

| Decision | Answer | Owner |
| --- | --- | --- |
| Product-specific precedents | Install a reusable evidence format. Keep YouTube, One UI, and other product captures in the adopting repository rather than making them universal ACF taste. | `frontend-design-discipline` |
| Unit of frontend completion | Complete the currently approved stage. A foundation, component contract, interaction study, shell, failure system, assembly, or rendered acceptance package can each be a complete result. | `frontend-design-discipline` |
| Existing cross-layer rule | Retain it for ordinary implementation. Add a narrow frontend exception when an approved staged design program has not reached assembly. | `repository-work` instruction |
| Visual quality judgment | Humans approve taste. ACF records provenance, inspected states, comparisons, and the exact accepted evidence. | frontend policy and visual-review guidance |
| New enforcement code | Do not add a screenshot framework. Existing registry projection and governance can prove that the templates install. Product repositories choose their own capture runner. | registry and project policy |

## State

- Baseline: `8078d558a3abb293113c2da31fec8b940ee5ed46`.
- Branch: `codex/frontend-evidence-workflow`.
- Checkout: `D:\dev\agent-context-framework`.
- Repository policy is configured and declares no project contracts.
- The existing optional frontend composition workflow already owns rendered
  evidence, bounded reviewer repair, and external human acceptance.
- At the baseline, the skill said `Implement one complete path`, its template asked
  for a `First vertical slice`, and no installed template preserves annotated
  visual precedent or a component-state acceptance matrix.
- The implementation now replaces those three gaps. Registry revision `0.13.0`
  carries the new resources and staged-work exception.

## Reuse assessment

- Reuse the existing optional ACF frontend workflow for content-addressed render
  evidence, bounded reviewer repair, and exact external human acceptance.
- Reuse the existing registry directory projection and governance checks for
  installation and anti-dilution proof.
- Storybook Component Story Format is an optional adapter shape for named states,
  args, and interaction recipes. Storybook is MIT licensed. No source or
  dependency is adopted.
- Playwright screenshots and traces are an optional adapter shape for ordered
  actions and capture context. Playwright is Apache-2.0 licensed. No source or
  dependency is adopted.
- Keep browser commands, binary artifacts, fixtures, and capture runners
  project-owned. ACF adds contracts and templates only.

## Topology

The skill entrypoint routes the active design stage to focused references and
copyable artifacts. Registry directory projection installs those files. The
frontend and repository-work instruction sections carry the few universal
rules into `AGENTS.md`. Context governance protects semantic requirements and
the registry builder records exact projected files and hashes.

## Preservation map

| Behavior | Treatment | Owner |
| --- | --- | --- |
| Representation precedes implementation | Retain | `frontend-design-discipline` |
| Approved specification is a deliberately lossy handoff | Retain | `frontend-spec.md` |
| One complete cross-layer slice for ordinary implementation | Retain | `repository-work.md` |
| Unconditional frontend vertical-slice endpoint | Change to approved stage completion | `frontend-design-discipline` |
| Materially different design comparison | Retain | design search and visual review |
| Rendered review requires authorization | Retain | `visual-review.md` |
| Human visual judgment | Retain and bind to exact evidence | frontend policy and visual review |
| Product-specific visual calibration survives handoff | Add | precedent evidence reference and template |
| Component lab proves behavior across states and placements | Add | component lab template |
| Project capture tooling remains project-owned | Retain | project policy and optional workflow adapters |

## Boundaries

| Boundary | Owner | Observation | Grace path |
| --- | --- | --- | --- |
| A precedent informs design without being copied wholesale | Evidence record | Exact region, observed behavior, accepted lesson, and prohibited imitation | Mark the source `context only` or omit it when the lesson cannot be stated precisely |
| Still images do not prove motion | Evidence record | Motion claim cites a clip or runnable study | Record motion as unverified and keep the implementation static |
| A stage cannot silently make decisions owned by a later stage | Stage contract | Input, output, authority, exclusions, and stopping condition | Return the discovered constraint to the owning stage |
| Component quality needs more than a happy-path screenshot | Component lab record | Applicable state, input, placement, viewport, theme, and accessibility matrix | Mark unsupported cells and stop promotion instead of inventing fixtures |
| Human taste cannot be reduced to a mechanical checker | Human acceptance record | Accepted evidence IDs and revision | Return `ready for human review`; do not self-approve |
| Installed resources match the canonical skill | Registry builder and governance | Exact artifact inventory and hashes | Rebuild the registry from canonical sources |

## Slice

1. Replace the unconditional vertical-slice wording with stage-owned completion.
2. Add one visual precedent evidence template and one component lab contract.
3. Route both resources from the skill and carry their semantic requirements
   through frontend policy, governance, registry revision, and installation tests.
4. Forward-test the installed skill with a fresh read-only agent using a realistic
   frontend foundation request.

## Replacements

- Replace `Implement one complete path` with an approved-stage contract.
- Replace `First vertical slice` in the frontend specification with a delivery
  stage that may be design evidence, foundations, a component contract, an
  interaction recipe, a shell, a failure system, assembly, or visual acceptance.
- Replace free-form precedent citations with a copyable evidence record.

## Non-goals

- Do not store Business Operating System screenshots in the framework registry.
- Do not choose BOS tokens, components, shell, routes, or concrete styling.
- Do not add Playwright, Storybook, Chromatic, or another frontend dependency.
- Do not change the optional frontend workflow runtime unless its current
  contract blocks the new stage or evidence model.
- Do not push, merge, deploy, or modify a downstream repository.

## Propagation

- Skill entrypoint, stage reference, precedent reference, frontend specification,
  visual evidence template, component lab template, and visual review reference.
- Canonical frontend and repository-work instruction sections to generated
  `AGENTS.md` sections.
- Context governance source requirements and generated hashes.
- Registry source revision, decision record, generated registry inventory, and
  installation or routing tests affected by the new artifacts.
- Agent-prose, registry, docs, and focused workflow checks declared by policy.

## Verification evidence

- `python C:\Users\EthanO\.codex\skills\.system\skill-creator\scripts\quick_validate.py .codex\skills\frontend-design-discipline`
  passed.
- `pnpm --silent registry:check` passed for registry `0.13.0` with 36 components.
- The direct agent-prose check passed for 12 changed Markdown sources.
- The checker does not accept YAML or JSON inputs. The changed `openai.yaml` and
  skill-routing exercise JSON received manual prose review, but no declared
  changed-file observer can check them directly.
- `git diff --check` passed.
- A first long installer test run was invalidated because generated policy files
  changed while the process was reading them. Its failures are not acceptance
  evidence. The affected suite must run again from stable task state.

## Closure

| Field | Value |
| --- | --- |
| Status | `active` |
| Final revision | `uncommitted` |
| Durable destination | Registry decision and installed skill resources |
| Retention reason | Temporary task state only |
| Cleanup | No temporary process or worktree created |
