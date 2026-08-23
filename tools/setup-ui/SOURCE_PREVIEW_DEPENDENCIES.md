# Source preview dependencies

The setup inspector uses three package dependencies for source editing and
Markdown previews. The package manager lock records their resolved dependency
graphs and package integrity values.

| Package | Version | Repository | License | Role |
| --- | --- | --- | --- | --- |
| `@pierre/diffs` | 1.3.5 | https://github.com/pierrecomputer/pierre | Apache-2.0 | Syntax-highlighted file display and in-place source editing |
| `react-markdown` | 10.1.0 | https://github.com/remarkjs/react-markdown | MIT | Safe Markdown to React rendering with raw HTML ignored |
| `remark-gfm` | 4.0.1 | https://github.com/remarkjs/remark-gfm | MIT | Tables, task lists, strikethrough, and autolinks |

## Integration

`src/source-preview.tsx` owns the Pierre integration. It creates editors through
an `EditProvider`, renders source with the React `File` component, and forwards
editor changes to the setup draft state. The application loads that module only
when a Source panel opens. `src/markdown-preview.tsx` owns Markdown rendering.
Markdown artifacts open in Preview and use the same Pierre editor from Source.

The preview passes `skipHtml` to `react-markdown`. It does not parse registry or
user-edited raw HTML into browser elements. `react-markdown` keeps its default URL
transform for links and images.

## Update procedure

1. Read the current release notes and API references for all three packages.
2. Update their pinned versions with pnpm from the repository root.
3. Confirm Pierre's React `File`, `EditProvider`, and editor callback contracts.
4. Run the setup UI typecheck and build.
5. Review Markdown preview and source editing at wide and narrow viewport sizes.
