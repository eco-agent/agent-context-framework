import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ContextRegistryV2 } from "@agent-context/repo-policy";

export const CONTEXT_GOVERNANCE_PATH = "registry/context-governance.json";
const CONTEXT_CODEOWNERS_PATH = ".github/CODEOWNERS";
const REQUIRED_REVIEW_OWNER = "@bet01";
const REQUIRED_REVIEW_PATTERNS = [
  "/AGENTS.md",
  "/.codex/skills/",
  "/.agent-context/runtime/",
  "/.github/CODEOWNERS",
  "/packages/codex-workflow-runtime/",
  "/packages/codex-frontend-workflows/",
  "/registry/",
  "/tools/dev-tooling/",
  "/tools/repo-policy/",
] as const;

const PROTECTED_SEMANTIC_REQUIREMENTS = new Map<string, readonly string[]>([
  ["registry/sources/instructions/core.md", [
    "Push only when the user explicitly requests it.",
    "Never deploy without an explicit user request.",
    "Treat framework-managed instructions as maintainer-owned policy.",
    "Do not edit, remove, override, or weaken them from project work.",
    "repository.projectContracts",
    "For code changes, run the narrowest applicable type and behavior checks before handoff.",
    "Read-only review, explanation, and status work do not authorize tests.",
    "Use a branch for each logical work stream.",
    "Never use `git stash`",
    "Prefer a package dependency when its public API is enough.",
    "Record the upstream URL, commit, prefix, license, and update procedure.",
    "stop and report the missing capability instead of inventing another vendoring method.",
    "Do not add or mutate a submodule unless a project contract requires its separate repository lifecycle.",
    "Do not change global Git configuration.",
    "Treat the work record as temporary task state.",
    "Otherwise remove it in the same task.",
    "Use native scout subagents proactively when a task contains two or more independent read-only investigations that can return once.",
    "Start independent scouts in parallel up to the capacity Codex exposes.",
    "Treat their output as evidence, not a decision.",
    "Only Sol agents may edit repository state.",
    "Do not wait on broken delegation after the second failure.",
  ]],
  ["registry/sources/instructions/framework-root-prefix.md", [
    "Push only when the user explicitly requests it.",
    "Never deploy without an explicit user request.",
  ]],
  ["registry/sources/instructions/repository-work.md", [
    "For an approved staged frontend program, complete the current design stage",
    "The cross-layer slice rule applies when the work reaches product assembly.",
    "Prefer a package dependency when its public API is enough.",
    "Record the upstream URL, commit, prefix, license, and update procedure.",
    "stop and report the missing capability instead of inventing another vendoring method.",
    "Do not add or mutate a submodule unless a project contract requires its separate repository lifecycle.",
    "Treat the work record as temporary task state.",
    "Otherwise remove it in the same task.",
  ]],
  ["registry/sources/instructions/verification.md", [
    "For code changes, run the narrowest applicable type and behavior checks before handoff.",
    "Read-only review, explanation, and status work do not authorize tests.",
    "an explicit request or a declared final-acceptance contract",
  ]],
  ["registry/sources/instructions/repository-policy.md", [
    "exact project contract paths",
    "They do not disable, replace, or weaken the maintainer-owned framework baseline.",
  ]],
  ["registry/sources/instructions/skill-authoring.md", [
    "Changed-file verification must run the repository-declared agent-prose check on model-facing files.",
    "If the repository has no such check, report the gap.",
    "Use technical-prose checks only for technical documentation selected by repository policy.",
  ]],
  ["registry/sources/templates/work-record.md", [
    "For staged frontend work, name the current design stage and its promotion gate.",
    "The slice becomes cross-layer when the work reaches product assembly.",
    "Status | `active`, `complete`, or `stopped`",
    "Durable destination | Canonical decision, handoff, or `this record`",
    "Retention reason | Policy requirement or evidence that exists nowhere else",
  ]],
  ["registry/sources/instructions/frontend.md", [
    "Treat schemas and the current implementation as evidence, not as the default interface.",
    "Abstract style phrases do not replace inspectable visual evidence.",
    "Bind final visual acceptance to the exact evidence and Git revision the human reviewed.",
    "Treat desktop and mobile as projections of the same product model.",
    "Preservation is not the default.",
    "Before creating or replacing a frontend component, inspect dependency manifests, component imports, providers, theme configuration, and local component directories.",
    "If the project has a component library for that role, use its component.",
    "Do not hand-write composite behavior such as dialogs, popovers, menus, tooltips, comboboxes, listboxes, tabs, accordions, toasts, date pickers, or data grids until you have checked the project's component system and assessed a maintained accessible implementation.",
    "A muted one-pixel separator is not default decoration and must not compensate for weak hierarchy.",
  ]],
  ["registry/sources/instructions/frontend-tailwind.md", [
    "Tailwind utilities are the normal representation for styles Tailwind can express.",
    "`skill-responsive-css-architect` decides layout relationships and responsive behavior, but it does not move utility-expressible styling into raw CSS.",
  ]],
  [".codex/skills/frontend-design-discipline/SKILL.md", [
    "substantial frontends or novel user-facing interactions",
    "Decide what the product should show and how it should behave before treating the schema or current component tree as the answer.",
    "Read only enough material to decide that question.",
    "Preserve a rejected example only when it defines an explicit design boundary.",
    "Do not force foundations, component contracts, interaction recipes, shells, failure systems, or visual acceptance into an early product slice.",
    "A foundation, component contract, interaction recipe, shell, failure system, product assembly, or rendered acceptance package can be the complete result.",
    "Treat the first acceptable design as a draft.",
    "They must not change the approved product structure",
    "Before reading or changing the current component tree",
    "settle one answer and one owner",
    "Before naming a new presentation owner, inspect dependency manifests, component imports, providers, theme configuration, and local component directories.",
    "an adopted component keeps ownership of behavior and accessibility unless its public API cannot meet a recorded requirement.",
  ]],
  [".codex/skills/frontend-design-discipline/assets/frontend-spec.md", [
    "## Approved delivery stage",
    "Accepted evidence IDs and durable paths",
    "Accepted evidence IDs, hashes, and Git revision",
  ]],
  [".codex/skills/frontend-design-discipline/assets/visual-evidence.md", [
    "Exact region, timestamp, or study state",
    "Lesson allowed in this project",
    "Copying or inference prohibited",
    "Permission or license",
    "Capture adapter and version",
  ]],
  [".codex/skills/frontend-design-discipline/assets/component-lab.md", [
    "Use representative product data or a project-approved fixture.",
    "Mark each cell `required`, `not applicable`, `unsupported`, or `verified`.",
    "Unsupported cells that block promotion",
  ]],
  [".codex/skills/design-accessible-interfaces/SKILL.md", [
    "When the project has an accessible component primitive for a role, use it instead of rebuilding the behavior or bypassing the component system with lower-level markup.",
    "Native-first does not mean library-last.",
  ]],
  [".codex/skills/design-web-typography/SKILL.md", [
    "Treat typography as a small set of named roles, not a collection of local adjustments.",
    "Change the role before changing one property on one element.",
    "If hierarchy is weak, try an established role or a loaded weight before changing line-height or tracking.",
    "Do not use arbitrary per-element values or line-height to position text inside a control.",
    "Keep `letter-spacing: normal` for ordinary headings and body text.",
    "Do not tune individual headings, imitate kerning with letter-spacing, or use arbitrary tracking values to make text feel tighter.",
  ]],
  [".codex/skills/design-web-typography/references/spacing-and-sizing.md", [
    "Preserve the project's existing scale.",
    "Do not use arbitrary values such as `tracking-[-0.023em]` or local `letter-spacing` declarations to tune one heading.",
    "Do not add `leading-[0.98273]` or another arbitrary per-element value.",
    "Fix vertical alignment with layout and control sizing, not line-height.",
  ]],
  [".codex/skills/design-web-typography/references/variable-fonts-and-opentype.md", [
    "Intermediate weights can render, but that does not make arbitrary values part of the type system.",
    "Do not invent values such as `589` merely because a variable font can render them.",
  ]],
  [".codex/skills/tailwind-css-architect/SKILL.md", [
    "Tailwind utilities are the normal representation for every style Tailwind can express cleanly.",
    "Do not replace them with a parallel stylesheet API.",
    "Repetition, a long class string, or a stable component role is not enough reason to move styling into raw CSS.",
    "Do not use `@apply` or a semantic class as an escape from utility markup.",
    "Existing component-library recipes and variant helpers remain in use.",
    "Every new raw CSS rule meets one named exception from this skill.",
  ]],
  [".codex/skills/adopt-established-product/SKILL.md", [
    "mark the target as an exact copy or an adaptation",
    "Independent reproduction requires the implementation contract to record the source-reuse prohibition",
    "A model-prior substitute does not count as completion.",
  ]],
  [".codex/skills/diagnose/SKILL.md", [
    "Skip a phase only when you record why it cannot improve the diagnosis.",
    "Do not proceed to cause testing until the reported failure is reproduced.",
    "List three to five plausible causes when the failure is still ambiguous.",
    "Share the ranking before testing it",
    "State the proved cause in the checkpoint commit or pull request message.",
  ]],
  [".codex/skills/design-typescript-invariants/SKILL.md", [
    "When an authoritative schema already defines a shape",
    "Strengthen a type where the looser type would make an operation partial.",
    "only when all four conditions hold",
    "The escape hatch is narrower than the surrounding domain.",
    "Otherwise run the narrow typecheck and lint commands, then perform the semantic review",
    "review public call sites as well as the changed implementation.",
  ]],
  [".codex/skills/design-operational-boundaries/SKILL.md", [
    "Absence is a fact to report. It is not permission to introduce infrastructure.",
    "Report one failure once.",
    "If the project has no logger or telemetry backend, preserve error context and report the missing observer.",
    "Do not add an observability dependency",
  ]],
  [".codex/skills/separate-shared-state/SKILL.md", [
    "Several actors updating separate fields in one object still share a mutable target.",
    "Instructions and naming conventions are not concurrency control.",
    "Do not invent a locking service or distributed coordinator",
  ]],
  [".codex/skills/reduce-reader-load/SKILL.md", [
    "One caller or one implementation is evidence to inspect, not an automatic deletion rule.",
    "Retain a boundary when it owns validation",
    "Do not conceal an unsupported cleanup behind a compatibility wrapper.",
  ]],
  [".codex/skills/optimize-codex-sessions/SKILL.md", [
    "nested reads consume the ledger-backed `maxRepositoryOutputBytes` budget.",
    "Managed workflows require a stable `objectiveId`",
    "Persist compact structured results and ledger evidence instead of another handoff document.",
    "When the user asks for a rollover prompt, use this exact shape:",
  ]],
  [".codex/skills/frontend-design-discipline/references/product-reframing.md", [
    "A schema describes stored values. It rarely identifies the product experience.",
    "The source value need not become a number, badge, progress bar, card, or gradient.",
    "Remove the schema and current implementation from the mental model.",
  ]],
  [".codex/skills/frontend-design-discipline/references/representation-search.md", [
    "At least one candidate must not display the source value at all.",
    "not materially different when only palette, typography, spacing, border radius, or component arrangement changes",
    "The first technically valid design is a draft, not the implementation target.",
  ]],
  [".codex/skills/frontend-design-discipline/references/mobile-recomposition.md", [
    "Desktop and mobile are projections of the same product model, not two sizes of one view.",
    "`preserve` is not the default.",
    "Some duplicated presentation logic is healthier than a universal component",
  ]],
  [".codex/skills/frontend-design-discipline/references/progressive-context.md", [
    "Do not retrieve everything relevant.",
    "Use artifacts as lossy interfaces",
    "Hard isolation is a control property.",
    "Minimum sufficient context is an empirical target, not a mechanically provable global property",
    "do not claim hard isolation or minimality.",
  ]],
  [".codex/skills/frontend-design-discipline/references/implementation-reconciliation.md", [
    "The existing implementation is evidence about behavior, integrations, and cost.",
    "Deletion is unrestricted within the approved change.",
    "Do not let implementation convenience silently revise the approved target.",
    "Inventory the component system before assigning new presentation owners.",
    "Do not replace it with hand-written markup merely because custom styling looks easier.",
  ]],
  [".codex/skills/frontend-design-discipline/references/visual-review.md", [
    "Review the actual result rather than inferring behavior from JSX, CSS, types, or a single screenshot.",
    "remove or replace one major design decision and attempt a materially different solution.",
    "Human review owns whether the representation is coherent, useful, and sufficiently quiet.",
    "Bind acceptance to the exact evidence IDs, content hashes, and Git revision that the human reviewed.",
  ]],
  [".codex/skills/frontend-design-discipline/references/frontend-stages.md", [
    "The current task should own one stage unless the user has approved a broader program.",
    "A stage is complete when its decisions and evidence can be trusted by the next owner.",
    "In a staged frontend program, the approved stage is the complete slice until product assembly begins.",
  ]],
  [".codex/skills/frontend-design-discipline/references/precedent-evidence.md", [
    "A phrase such as `quiet structural planes` is not evidence.",
    "A still image proves one frame.",
    "move every accepted artifact and its record to a durable project-owned path",
  ]],
  [".codex/skills/frontend-design-discipline/references/interaction-studies.md", [
    "Create a runnable study when a decision depends on behavior that prose or a still image cannot settle.",
    "A study is design evidence, not production architecture.",
    "Promote studies that still define behavior to the durable evidence path",
    "These are adapter choices, not ACF dependencies.",
  ]],
  [".codex/skills/frontend-design-discipline/references/composition-grammar.md", [
    "A semantic owner may render directly into a shared layout.",
    "A page has one primary surface or none.",
    "Do not nest surfaces to create hierarchy.",
    "Source code alone does not settle composition.",
  ]],
  [".codex/skills/responsive-css-architect/SKILL.md", [
    "express relationships rather than screenshot measurements",
    "Do not use a number to compensate for unresolved layout.",
    "Moving a component between its supported containers requires little or no CSS rewriting.",
  ]],
  [".codex/skills/responsive-css-architect/references/stylesheet-architecture.md", [
    "Adapt names to the project, but keep the ownership model.",
  ]],
  [".codex/skills/maintain-agent-context-framework/SKILL.md", [
    "Treat existing instructions as active constraints, not prose that can be freely summarized.",
    "Only the user's request can authorize a removal or weaker requirement.",
    "Assume the agent will take the least constrained reading that still appears compliant.",
    "A boundary without an observation is a wish. A boundary without a grace path often produces a no-op agent.",
    "Do not diagnose every drift as ignorance or refusal.",
    "Do not solve attention pressure by repeating the same rule in more places.",
    "Use prose for intent, ownership, permissions, judgment criteria, semantic boundaries, narrow exceptions, and grace paths.",
    "Use deterministic code for syntax, schemas, path containment, exact projections, hashes, dependency closure, generated output, changed-file selection, and limits derived from measured boundaries.",
    "Do not claim that a keyword check proves behavior it cannot observe",
    "Instruction language becomes an example of how the agent writes.",
    "Treat a skill's YAML `description` as its catalog trigger.",
    "Process that only records that work happened is ceremony. Delete it.",
    "Every changed boundary has an owner, observation, and grace path.",
    "Temporary work state is removed after durable evidence reaches its owner.",
  ]],
  [".codex/skills/maintain-agent-context-framework/references/prose-and-enforcement.md", [
    "Use the cheapest owner that can decide the rule without lying about what it observes.",
    "If the checker cannot observe the claimed behavior, narrow its claim or keep the rule in prose.",
    "A bare rejection encourages either repeated failure or a no-op.",
    "Phrase presence tests are useful for protected policy, but they prove only that the declared text remains.",
    "Programmatic checks must not write policy, choose a semantic interpretation, or silently repair the source they validate.",
  ]],
  [".codex/skills/maintain-agent-context-framework/agents/openai.yaml", [
    "allow_implicit_invocation: true",
  ]],
  [".codex/skills/orchestrate-codex-workflows/SKILL.md", [
    "This skill does not support recursive manager trees, sibling voting, or an open-ended scheduler.",
    "Define the stages, roles, budgets, permissions, return paths, and stopping conditions in project code.",
    "They may not create roles or recursively split the task.",
    "Store each result before using it to choose the next stage.",
    "Give each role only the filesystem, network, and approval access it needs.",
    "Run it against the current task only when the user asks you to operate it.",
    "Run the copied mock tests before any live Codex call.",
    "The JSONL file records events. It is not a process checkpoint",
    "requires exact coverage with every criterion true",
    "Confirm each delegation stays inside the fixed permission and budget envelope.",
    "Do not grant `danger-full-access` for convenience.",
    "unbounded retries, routes, transitions, or reviewer passes",
  ]],
  [".codex/skills/orchestrate-codex-workflows/references/git-transaction.md", [
    "A branch owns a logical work stream.",
    "Give one mutable branch and index to one active writer at a time.",
    "Never use `git stash`.",
    "If any identity, path, cleanliness check, or reachability proof differs from the ledger, stop cleanup.",
  ]],
]);

interface ContextGovernanceManifest {
  readonly schemaVersion: 3;
  readonly registryRevision: string;
  readonly decisionPath: string;
  readonly protectedSources: readonly ProtectedSource[];
  readonly projections: readonly ProtectedProjection[];
  readonly completeFileProjectionScopes: readonly CompleteFileProjectionScope[];
}

interface CompleteFileProjectionScope {
  readonly component: string;
  readonly sourcePrefix: string;
  readonly targetPrefix: string;
}

interface ProtectedSource {
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly sha256: string;
}

interface FileProjection {
  readonly kind: "file";
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
}

interface MarkdownSectionProjection {
  readonly kind: "markdown-section";
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly heading: string;
}

interface MarkdownPrefixProjection {
  readonly kind: "markdown-prefix";
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly beforeHeading: string;
}

type ProtectedProjection = FileProjection | MarkdownSectionProjection | MarkdownPrefixProjection;

export async function checkContextGovernance(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const manifest = decodeManifest(await readJson(repositoryPath(root, CONTEXT_GOVERNANCE_PATH)));
  if (manifest.registryRevision !== registry.revision) {
    throw new Error(
      `Context governance revision ${manifest.registryRevision} does not match registry ${registry.revision}.`,
    );
  }
  if (manifest.decisionPath !== registry.decisionPath) {
    throw new Error("Context governance and registry must name the same decision record.");
  }
  await readStrictUtf8(repositoryPath(root, manifest.decisionPath), "Context governance decision");
  await checkReviewOwnership(root);

  const protectedByPath = new Map<string, ProtectedSource>();
  for (const source of manifest.protectedSources) {
    const content = await readStrictUtf8(repositoryPath(root, source.sourcePath), source.sourcePath);
    checkProtectedSemantics(source.sourcePath, content);
    const actual = contentHash(content);
    if (actual !== source.sha256) {
      throw new Error(
        `Protected context source changed without a governance decision update: ${source.sourcePath}.`,
      );
    }
    protectedByPath.set(source.sourcePath, source);
  }

  for (const projection of manifest.projections) {
    const protectedSource = protectedByPath.get(projection.sourcePath);
    if (!protectedSource || protectedSource.invariantId !== projection.invariantId) {
      throw new Error(`Projection ${projection.invariantId} does not name its protected source.`);
    }
    const source = normalizeLf(await readStrictUtf8(
      repositoryPath(root, projection.sourcePath),
      projection.sourcePath,
    ));
    const target = normalizeLf(await readStrictUtf8(
      repositoryPath(root, projection.targetPath),
      projection.targetPath,
    ));
    const expected = projection.kind === "markdown-section"
      ? markdownHeadingRegion(source, projection.heading, projection.sourcePath)
      : source;
    const installed = projection.kind === "file"
      ? target
      : projection.kind === "markdown-section"
        ? markdownHeadingRegion(target, projection.heading, projection.targetPath)
        : markdownPrefixRegion(target, projection.beforeHeading, projection.targetPath);
    if (installed !== expected) {
      throw new Error(
        `Protected context projection differs from ${projection.sourcePath}: ${projection.targetPath}.`,
      );
    }
  }

  checkCompleteFileProjectionScopes(manifest, registry, protectedByPath);

  const protectedPaths = new Set(manifest.protectedSources.map((source) => source.sourcePath));
  for (const component of registry.components) {
    for (const artifact of component.artifacts) {
      if (artifact.operation === "text-section" && !protectedPaths.has(artifact.sourcePath)) {
        throw new Error(`Text instruction artifact is not protected by governance: ${artifact.sourcePath}.`);
      }
    }
  }
}

function checkCompleteFileProjectionScopes(
  manifest: ContextGovernanceManifest,
  registry: ContextRegistryV2,
  protectedByPath: ReadonlyMap<string, ProtectedSource>,
): void {
  const fileProjections = manifest.projections.filter(
    (projection): projection is FileProjection => projection.kind === "file",
  );
  for (const scope of manifest.completeFileProjectionScopes) {
    const component = registry.components.find((candidate) => candidate.name === scope.component);
    if (component === undefined) {
      throw new Error(`Complete file projection scope names missing component ${scope.component}.`);
    }
    const artifacts = component.artifacts.filter((artifact) =>
      artifact.sourcePath.startsWith(scope.sourcePrefix));
    if (artifacts.length === 0) {
      throw new Error(`Complete file projection scope ${scope.sourcePrefix} contains no artifacts.`);
    }
    const registryPairs = new Set<string>();
    for (const artifact of artifacts) {
      const relativePath = artifact.sourcePath.slice(scope.sourcePrefix.length);
      const expectedTarget = `${scope.targetPrefix}${relativePath}`;
      if (artifact.targetPath !== expectedTarget) {
        throw new Error(
          `Complete file projection maps ${artifact.sourcePath} to ${artifact.targetPath}; ` +
          `expected ${expectedTarget}.`,
        );
      }
      const protectedSource = protectedByPath.get(artifact.sourcePath);
      const projection = fileProjections.find((candidate) =>
        candidate.sourcePath === artifact.sourcePath && candidate.targetPath === artifact.targetPath);
      if (
        protectedSource === undefined ||
        projection === undefined ||
        projection.invariantId !== protectedSource.invariantId
      ) {
        throw new Error(
          `Complete file projection artifact lacks governed source and target coverage: ${artifact.sourcePath}.`,
        );
      }
      registryPairs.add(`${artifact.sourcePath}\n${artifact.targetPath}`);
    }
    for (const projection of fileProjections.filter((candidate) =>
      candidate.sourcePath.startsWith(scope.sourcePrefix) &&
      candidate.targetPath.startsWith(scope.targetPrefix))) {
      if (!registryPairs.has(`${projection.sourcePath}\n${projection.targetPath}`)) {
        throw new Error(
          `Governed file projection is absent from component ${scope.component}: ${projection.sourcePath}.`,
        );
      }
    }
  }
}

function checkProtectedSemantics(sourcePath: string, content: string): void {
  const normalized = content.replace(/\s+/gu, " ").trim();
  for (const requirement of PROTECTED_SEMANTIC_REQUIREMENTS.get(sourcePath) ?? []) {
    if (!normalized.includes(requirement)) {
      throw new Error(
        `Protected context source violates a maintainer-owned semantic requirement: ${sourcePath} (${requirement}).`,
      );
    }
  }
}

async function checkReviewOwnership(root: string): Promise<void> {
  const source = normalizeLf(await readStrictUtf8(
    repositoryPath(root, CONTEXT_CODEOWNERS_PATH),
    CONTEXT_CODEOWNERS_PATH,
  ));
  const entries = new Set(
    source.split("\n").map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#")),
  );
  for (const pattern of REQUIRED_REVIEW_PATTERNS) {
    if (!entries.has(`${pattern} ${REQUIRED_REVIEW_OWNER}`)) {
      throw new Error(`Context review ownership is missing ${pattern} ${REQUIRED_REVIEW_OWNER}.`);
    }
  }
}

function markdownHeadingRegion(document: string, heading: string, targetPath: string): string {
  if (!/^#{1,6}\s+\S/u.test(heading)) throw new Error(`Invalid governed heading: ${heading}.`);
  const start = document.indexOf(`${heading}\n`);
  if (start < 0 || document.indexOf(`${heading}\n`, start + heading.length + 1) >= 0) {
    throw new Error(`Governed heading must occur exactly once in ${targetPath}: ${heading}.`);
  }
  const level = heading.indexOf(" ");
  const afterHeading = start + heading.length + 1;
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, "gmu");
  nextHeading.lastIndex = afterHeading;
  const next = nextHeading.exec(document);
  const end = next?.index ?? document.length;
  return document.slice(start, end).replace(/\n+$/u, "\n");
}

function markdownPrefixRegion(document: string, beforeHeading: string, targetPath: string): string {
  if (!/^#{1,6}\s+\S/u.test(beforeHeading)) {
    throw new Error(`Invalid governed heading: ${beforeHeading}.`);
  }
  const end = document.indexOf(`${beforeHeading}\n`);
  if (end < 0 || document.indexOf(`${beforeHeading}\n`, end + beforeHeading.length + 1) >= 0) {
    throw new Error(`Governed heading must occur exactly once in ${targetPath}: ${beforeHeading}.`);
  }
  return document.slice(0, end).replace(/\n+$/u, "\n");
}

function decodeManifest(value: unknown): ContextGovernanceManifest {
  const record = strictRecord(value, "Context governance manifest", [
    "schemaVersion", "registryRevision", "decisionPath", "protectedSources", "projections",
    "completeFileProjectionScopes",
  ]);
  if (record.schemaVersion !== 3) throw new Error("Context governance schemaVersion must be 3.");
  const protectedSources = decodeArray(record.protectedSources, "protectedSources", decodeProtectedSource);
  const projections = decodeArray(record.projections, "projections", decodeProjection);
  const completeFileProjectionScopes = decodeArray(
    record.completeFileProjectionScopes,
    "completeFileProjectionScopes",
    decodeCompleteFileProjectionScope,
  );
  requireUnique(protectedSources.map((item) => item.invariantId), "protected invariant IDs");
  requireUnique(protectedSources.map((item) => item.sourcePath), "protected source paths");
  requireUnique(
    completeFileProjectionScopes.map((scope) =>
      `${scope.component}\n${scope.sourcePrefix}\n${scope.targetPrefix}`),
    "complete file projection scopes",
  );
  return {
    schemaVersion: 3,
    registryRevision: requiredString(record, "registryRevision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    protectedSources,
    projections,
    completeFileProjectionScopes,
  };
}

function decodeCompleteFileProjectionScope(value: unknown): CompleteFileProjectionScope {
  const record = strictRecord(value, "Complete file projection scope", [
    "component", "sourcePrefix", "targetPrefix",
  ]);
  return {
    component: identifier(record, "component"),
    sourcePrefix: portableRelativePrefix(record, "sourcePrefix"),
    targetPrefix: portableRelativePrefix(record, "targetPrefix"),
  };
}

function decodeProtectedSource(value: unknown): ProtectedSource {
  const record = strictRecord(value, "Protected context source", ["invariantId", "sourcePath", "sha256"]);
  const sha256 = requiredString(record, "sha256");
  if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new Error("Protected source sha256 must be a lowercase SHA-256 hash.");
  return {
    invariantId: identifier(record, "invariantId"),
    sourcePath: portableRelativePath(record, "sourcePath"),
    sha256,
  };
}

function decodeProjection(value: unknown): ProtectedProjection {
  const base = strictRecord(value, "Protected context projection", [
    "kind", "invariantId", "sourcePath", "targetPath", "heading", "beforeHeading",
  ]);
  const shared = {
    invariantId: identifier(base, "invariantId"),
    sourcePath: portableRelativePath(base, "sourcePath"),
    targetPath: portableRelativePath(base, "targetPath"),
  };
  if (base.kind === "file") {
    assertAbsent(base, "heading", "File projection");
    assertAbsent(base, "beforeHeading", "File projection");
    return { kind: "file", ...shared };
  }
  if (base.kind === "markdown-section") {
    assertAbsent(base, "beforeHeading", "Markdown section projection");
    return { kind: "markdown-section", ...shared, heading: requiredString(base, "heading") };
  }
  if (base.kind === "markdown-prefix") {
    assertAbsent(base, "heading", "Markdown prefix projection");
    return { kind: "markdown-prefix", ...shared, beforeHeading: requiredString(base, "beforeHeading") };
  }
  throw new Error("Protected context projection kind is invalid.");
}

async function readJson(candidate: string): Promise<unknown> {
  const source = await readStrictUtf8(candidate, CONTEXT_GOVERNANCE_PATH);
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error("Context governance manifest must contain valid JSON.", { cause: error });
  }
}

async function readStrictUtf8(candidate: string, label: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must be UTF-8 without a byte-order mark.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8.`, { cause: error });
  }
}

function repositoryPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (path.isAbsolute(candidate) || candidate.includes("\\") || relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Context governance path escapes the repository: ${candidate}.`);
  }
  return resolved;
}

function portableRelativePath(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${key} must be a normalized repository-relative path.`);
  }
  return value;
}

function portableRelativePrefix(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (!value.endsWith("/")) throw new Error(`${key} must end with a slash.`);
  portableRelativePath({ [key]: value.slice(0, -1) }, key);
  return value;
}

function strictRecord(value: unknown, label: string, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Readonly<Record<string, unknown>>;
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  return record;
}

function decodeArray<T>(value: unknown, label: string, decode: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function assertAbsent(record: Readonly<Record<string, unknown>>, key: string, label: string): void {
  if (record[key] !== undefined) throw new Error(`${label} must not define ${key}.`);
}

function identifier(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) throw new Error(`${key} must be kebab-case.`);
  return value;
}

function requireUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} contain duplicate ${duplicate}.`);
}

function normalizeLf(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
