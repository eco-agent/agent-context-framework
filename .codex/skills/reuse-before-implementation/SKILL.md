---
name: reuse-before-implementation
description: Find and assess maintained code before implementing a substantial mechanism or integration.
---

## Prefer reuse over implementation

Minimize new code and long-term maintenance burden.

Before implementing substantial logic:

1. Search the repository for an existing implementation, abstraction, or dependency.
2. Check whether a maintained package already solves the problem.
3. Search public source repositories for compatible implementations or reference designs.
4. Implement from scratch only when reuse would create greater complexity, risk, or maintenance cost.

For application shells, product topology, navigation, interaction models, feeds, issue trackers, project management, chat, media libraries, or other established product categories, use `adopt-established-product`. Do not use this mechanism-focused skill to justify a greenfield interface.

Prefer, in order:

* adapting existing project code;
* using a maintained dependency;
* importing a focused upstream project through a subtree or vendoring;
* porting compatible licensed code;
* writing a new implementation.

For a compatible permissively licensed implementation, reading the source and then generating a fresh equivalent is not reuse. Materialize the relevant files first, retain the license notice, and make the required changes as a diff from those bytes.

Do not reimplement functionality merely because producing new code is easy. Reuse established algorithms, parsers, protocols, adapters, fixtures, schemas, and integration patterns where they fit the requirement.

### Evaluate reuse

Before adopting external code, verify:

* it matches the required behaviour and architecture;
* its maintenance and dependency costs are acceptable;
* its security and quality are sufficient;
* its license permits the intended use, modification, and distribution;
* required copyright notices, attribution, source disclosure, or license terms can be satisfied.

Record the source repository, revision, license, and meaningful modifications. Preserve required notices.

Do not assume that publicly visible code is reusable. When licensing is absent, unclear, incompatible, or cannot be verified, do not copy or closely translate the implementation. Use public documentation and observable behaviour to create an independent implementation instead.

Prefer a package dependency when its public API is sufficient. Use a subtree or vendored source only when the project needs source-level control, modification, reproducible availability, or protection from upstream instability.

New code should represent project-specific value, necessary integration, or a justified gap in available implementations—not an avoidable reconstruction of solved work.
