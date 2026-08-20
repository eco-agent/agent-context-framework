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
  "/registry/",
  "/tools/dev-tooling/",
  "/tools/repo-policy/",
] as const;

const PROTECTED_SEMANTIC_REQUIREMENTS = new Map<string, readonly string[]>([
  ["registry/sources/instructions/core.md", [
    "Treat this framework-managed section as maintainer-owned policy.",
    "Do not edit, remove, override, or weaken it from project work.",
    "repository.projectContracts",
    "For code changes, run the narrowest applicable type and behavior checks before handoff.",
    "Read-only review, explanation, and status work do not authorize tests.",
    "Use a branch for each logical work stream.",
    "Never use `git stash`",
    "Do not change global Git configuration.",
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
  ["registry/sources/instructions/frontend.md", [
    "Treat schemas and the current implementation as evidence, not as the default interface.",
    "Treat desktop and mobile as projections of the same product model.",
    "Preservation is not the default.",
  ]],
  [".codex/skills/frontend-design-discipline/SKILL.md", [
    "Design the product independently of its schema and current implementation",
    "Load the smallest context that can support the current decision.",
    "Transfer only the approved thesis and its evidence, not discarded alternatives or exploratory discussion.",
    "The first acceptable design is a draft.",
    "A specialist must not revise the approved representation",
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
  ]],
  [".codex/skills/frontend-design-discipline/references/visual-review.md", [
    "Review the actual result rather than inferring behavior from JSX, CSS, types, or a single screenshot.",
    "remove or replace one major design decision and attempt a materially different solution.",
    "Human review owns whether the representation is coherent, useful, and sufficiently quiet.",
  ]],
  [".codex/skills/responsive-css-architect/SKILL.md", [
    "express relationships rather than screenshot measurements",
    "Do not use a number to compensate for unresolved layout.",
    "Moving a component between its supported containers requires little or no CSS rewriting.",
  ]],
  [".codex/skills/orchestrate-codex-workflows/SKILL.md", [
    "Exclude adaptive orchestrator holarchies and sibling quorum loops.",
    "Fix the workflow topology, role registry, budgets, and authority before execution.",
    "Do not let agents invent new agents or recursively decompose work.",
    "Persist evidence before each state transition.",
    "Give each role the least filesystem, network, and approval authority it needs.",
    "Do not run the harness as a hidden method for completing the current task unless the user asks to operate it.",
    "Run the mock tests before any live Codex execution.",
    "The JSONL ledger is an audit record, not a complete process checkpoint",
  ]],
  [".codex/skills/orchestrate-codex-workflows/references/git-transaction.md", [
    "A branch owns a logical work stream.",
    "Give one mutable branch and index to one active writer at a time.",
    "Never use `git stash`.",
    "If any identity, path, cleanliness check, or reachability proof differs from the ledger, stop cleanup.",
  ]],
]);

interface ContextGovernanceManifest {
  readonly schemaVersion: 1;
  readonly registryRevision: string;
  readonly decisionPath: string;
  readonly protectedSources: readonly ProtectedSource[];
  readonly projections: readonly ProtectedProjection[];
}

interface ProtectedSource {
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly sha256: string;
}

interface ProtectedProjection {
  readonly invariantId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly heading: string;
}

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
    const region = markdownHeadingRegion(target, projection.heading, projection.targetPath);
    if (region !== source) {
      throw new Error(
        `Protected context projection differs from ${projection.sourcePath}: ${projection.targetPath} ${projection.heading}.`,
      );
    }
  }

  const protectedPaths = new Set(manifest.protectedSources.map((source) => source.sourcePath));
  for (const component of registry.components) {
    for (const artifact of component.artifacts) {
      if (artifact.operation === "text-section" && !protectedPaths.has(artifact.sourcePath)) {
        throw new Error(`Text instruction artifact is not protected by governance: ${artifact.sourcePath}.`);
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

function decodeManifest(value: unknown): ContextGovernanceManifest {
  const record = strictRecord(value, "Context governance manifest", [
    "schemaVersion", "registryRevision", "decisionPath", "protectedSources", "projections",
  ]);
  if (record.schemaVersion !== 1) throw new Error("Context governance schemaVersion must be 1.");
  const protectedSources = decodeArray(record.protectedSources, "protectedSources", decodeProtectedSource);
  const projections = decodeArray(record.projections, "projections", decodeProjection);
  requireUnique(protectedSources.map((item) => item.invariantId), "protected invariant IDs");
  requireUnique(protectedSources.map((item) => item.sourcePath), "protected source paths");
  return {
    schemaVersion: 1,
    registryRevision: requiredString(record, "registryRevision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    protectedSources,
    projections,
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
  const record = strictRecord(value, "Protected context projection", [
    "invariantId", "sourcePath", "targetPath", "heading",
  ]);
  return {
    invariantId: identifier(record, "invariantId"),
    sourcePath: portableRelativePath(record, "sourcePath"),
    targetPath: portableRelativePath(record, "targetPath"),
    heading: requiredString(record, "heading"),
  };
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
