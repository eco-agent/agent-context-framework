# Pierre diffs setup preview

## Intended outcome

Replace the raw setup source textarea with `@pierre/diffs` rendering and editing. Show rendered Markdown by default for Markdown artifacts. Keep exact source inspection and editing available for every editable artifact.

## Baseline and ownership

- Baseline: `d851a3c220980140b461b3a7dd4710165c077d94`
- Branch: `codex/pierre-diffs-preview`
- Checkout: `D:\dev\agent-context-framework`
- Owner: setup UI

## Preservation map

| Behavior | Decision |
| --- | --- |
| Repository-aware default component selection | Retain |
| All, None, and Invert selection controls | Retain |
| Exact source overrides affect plan and install | Retain |
| Installed and registry-owned source is read-only | Retain |
| Tool argument inspection | Retain |
| Raw shadcn textarea editor | Replace with Pierre editing |
| Syntax-highlighted file presentation | Add and make default for non-Markdown files |
| Rendered Markdown preview | Add and make default for Markdown files |

## Boundaries

- Owner: React owns each source draft. Pierre emits edits through `EditorOptions.onChange`.
- Boundary: no external skill files enter the repository. Observation: Git status and final diff contain no `.agents/skills/diffs` path. Grace path: stop and remove only the temporary task directory if an installer artifact appears.
- Boundary: Markdown rendering must not execute embedded HTML. Observation: renderer configuration and a focused fixture containing raw HTML. Grace path: render it as text.
- Boundary: source edits must still pass the setup override limits and planner. Observation: existing setup-server tests and browser edit/reset checks. Grace path: surface the planner error without installing.

## Smallest complete slice

One active artifact renders through Pierre, switches to Pierre edit mode, publishes changes into the existing draft map, and shows rendered Markdown first for Markdown media types.

## Replacements

- Remove the raw `Textarea` source owner after Pierre editing works.
- Add one maintained Markdown renderer only if Pierre does not provide semantic Markdown rendering.

## Non-goals

- No patch review or multi-file CodeView.
- No worker pool or SSR.
- No persistence outside the current setup page.

## Propagation paths

`SetupComponentArtifact` -> active source model -> Pierre `File` -> Pierre `Editor.onChange` -> source draft -> setup plan overrides -> installer.

## State

Implementation complete. Setup UI typecheck and production build pass. Browser
review covers wide and narrow Markdown previews, GFM tables, lazy Pierre source
loading, non-Markdown source defaults, and reset behavior. Final acceptance is
pending the implementation checkpoint.
