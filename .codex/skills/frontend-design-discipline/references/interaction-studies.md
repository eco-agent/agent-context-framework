# Interaction studies

Create a runnable study when a decision depends on behavior that prose or a still
image cannot settle. Use the project's frontend stack when it already supports a
small isolated study. Use a standalone HTML file only when it can reproduce the
interaction without inventing a second component system.

## Give each study one question

Examples include how intent reveals controls, how a pending action becomes
accepted or rejected, how focus returns after dismissal, or how a narrow layout
recomposes. Do not turn the study into a miniature application.

Provide controls or deterministic fixtures for every state needed to answer the
question. Include typical, neutral, extreme, empty, awkward, loading, failure,
disabled, keyboard, reduced-motion, and narrow-container states only where they
apply.

## Preserve the useful result

Record:

- the question;
- exact input and state sequence;
- accepted and rejected variants;
- the decision and human owner;
- source files and how to run them;
- captures or clips tied to the accepted revision;
- trace or replay evidence, capture adapter version, and redaction policy when
  the project can record them;
- behavior that remains unverified.

A study is design evidence, not production architecture. Production code may
reuse it only after implementation reconciliation confirms that its dependencies,
component behavior, accessibility, and state ownership fit the project.

Delete studies that taught nothing and own no accepted or rejected boundary.
Promote studies that still define behavior to the durable evidence path named by
the frontend specification.

Use an existing project adapter when it fits. A Storybook project can map lab
states to named CSF stories, args, and play functions. A Playwright project can
record screenshots and traces for ordered actions, DOM state, console output, and
network activity. These are adapter choices, not ACF dependencies. Projects
without either tool can satisfy the same evidence contract with their established
preview and capture system.
