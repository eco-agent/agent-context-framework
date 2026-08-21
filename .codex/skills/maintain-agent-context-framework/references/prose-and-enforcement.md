# Prose and enforcement

Use the cheapest owner that can decide the rule without lying about what it
observes.

## Classification test

Use deterministic code when two independent implementations can decide pass or
fail from the same stored inputs. Examples include JSON shape, path boundaries,
component dependency closure, exact file projections, hashes, generated output,
and limits derived from a transport or runtime boundary.

Use model-facing prose when the decision needs intent, context, semantic meaning,
human preference, or authority. Examples include whether a rewrite preserves
the same requirement, whether a product choice is invented, whether an
exception is justified, and whether an explanation has the right voice.

Use both when code can observe a useful proxy but not the whole rule. The prose
owns the meaning. The checker owns only the proxy it can measure.

| Rule | Prose owns | Code owns |
| --- | --- | --- |
| Installed instructions match canonical sources | Why the canonical source has authority | Exact section or file equality |
| Protected requirements resist dilution | Meaning, owner, and allowed change | Required semantic text and source hash |
| A component closure is complete | Why the component belongs in the bundle | Dependency reachability and artifact inventory |
| A limit protects a real boundary | Which boundary matters and what happens when reached | Units, comparison, and failure result |
| Agent writing keeps a human voice | Intended voice and semantic review | Known mechanical prose findings only |
| A blocked path remains usable | The allowed fallback or escalation | Structured failure state when the workflow has one |

## Enforcement rules

Name the exact input and output before adding a checker. If the checker cannot
observe the claimed behavior, narrow its claim or keep the rule in prose.

When a checker fails, its diagnostic should identify the violated boundary and
the valid next action. A bare rejection encourages either repeated failure or a
no-op.

Extend the existing owner. Create a validator, manifest field, decision record,
or helper script only when no current owner can accept the required input and
produce the required observation. Do not create another mechanism merely to
restate an instruction.

Test enforcement by changing the observed input and requiring failure. Phrase
presence tests are useful for protected policy, but they prove only that the
declared text remains. Use projection, installation, graph, or behavior tests
for the mechanical result when one exists.

Programmatic checks must not write policy, choose a semantic interpretation, or
silently repair the source they validate. They report evidence to the decision
owner.
