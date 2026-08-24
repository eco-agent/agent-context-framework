import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  resolveContextComponents,
  type ContextRegistryArtifact,
  type ContextRegistryComponent,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";

import type {
  SetupComponentArtifact,
  SetupComponentDetail,
  SetupSourceOverride,
  SetupToolSummary,
} from "./setup-contract.js";

const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  core: "Core",
  engineering: "Engineering",
  "typescript-engineering": "TypeScript engineering",
  frontend: "Frontend",
  "frontend-tailwind": "Frontend with Tailwind CSS",
  "session-quality": "Session quality",
  "skill-authoring": "Skill authoring",
  "runtime-base": "Runtime base",
  "repository-policy": "Repository policy",
  "codex-agents": "Codex agents",
  "codex-hooks": "Codex hooks",
  "codex-repo-context": "Codex repository context",
  "codex-runtime": "Codex runtime",
  "integration-oxfmt": "Oxfmt integration",
  "workflow-frontend-composition": "Frontend composition workflows",
};

const COMPONENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  core: "Repository-wide operating instructions, line endings, and ACF ownership records.",
  "runtime-base": "The isolated Node workspace used by ACF runtime packages.",
  "repository-policy": "Repository policy, verification profiles, and their isolated runtime package.",
  "codex-agents": "Default, scout, and worker agent roles for Codex.",
  "codex-hooks": "Codex hooks that run ACF checks before patches and after context compaction.",
  "codex-repo-context": "The repo_context MCP tool for bounded repository reads and fixed-string search.",
  "codex-runtime": "The complete Codex agent, hook, and repository-context bundle.",
  "integration-oxfmt": "ACF-owned oxfmt configuration.",
  "workflow-frontend-composition": "Bounded frontend representation, rendered review, repair, preflight, and human acceptance controllers.",
};

const REPOSITORY_CONTEXT_TOOL: SetupToolSummary = {
  name: "repo_context",
  description: "Read or fixed-string search within the explicitly authorized repository root.",
  sourcePath: ".agent-context/runtime/packages/repo-context/src/mcp-server.ts",
  modes: [
    {
      name: "read",
      description: "Read a bounded range from one repository file.",
      arguments: [
        argument("operation", 'literal "read"', true, "Selects file reading.", ['accepted: "read"']),
        argument("path", "string", true, "Repository-relative file path.", ["1 to 500 characters"]),
        argument("startLine", "positive integer", false, "First one-based line to return.", []),
        argument("lines", "positive integer", false, "Maximum lines to return.", ["maximum: 200"]),
        argument("cursor", "string", false, "Continuation cursor from a previous result.", ["1 to 512 characters"]),
      ],
    },
    {
      name: "search",
      description: "Find fixed-string matches within one repository path.",
      arguments: [
        argument("operation", 'literal "search"', true, "Selects fixed-string search.", ['accepted: "search"']),
        argument("path", "string", true, "Repository-relative file or directory path.", ["1 to 500 characters"]),
        argument("query", "string", true, "Fixed string to find.", ["1 to 1,000 characters"]),
        argument("maxMatches", "positive integer", false, "Maximum matches to return.", ["maximum: 50"]),
        argument("contextLines", "non-negative integer", false, "Context lines around each match.", ["maximum: 10"]),
        argument("cursor", "string", false, "Continuation cursor from a previous result.", ["1 to 512 characters"]),
      ],
    },
  ],
};

export function setupComponentDisplayName(name: string): string {
  const exact = DISPLAY_NAMES[name];
  if (exact !== undefined) return exact;
  const normalized = name.startsWith("skill-") ? name.slice("skill-".length) : name;
  return normalized
    .split("-")
    .filter(Boolean)
    .map((token, index) => displayToken(token, index))
    .join(" ");
}

export async function recommendSetupComponents(
  projectRoot: string,
  availableComponents: ReadonlySet<string>,
): Promise<readonly string[]> {
  const facts = await readRepositoryFacts(projectRoot);
  const recommendations: string[] = [];
  if (facts.languages.includes("typescript")) recommendations.push("typescript-engineering");
  if (facts.frontend) recommendations.push("frontend");
  if (recommendations.length === 0) recommendations.push("engineering");
  return recommendations.filter((component) => availableComponents.has(component));
}

export async function readSetupComponentDetail(
  frameworkRoot: string,
  registry: ContextRegistryV2,
  componentName: string,
): Promise<SetupComponentDetail> {
  const component = registry.components.find((candidate) => candidate.name === componentName);
  if (component === undefined) throw new Error(`Unknown setup component ${componentName}.`);
  const resolvedRoot = await realpath(frameworkRoot);
  const artifacts = await Promise.all(component.artifacts.map(async (artifact) => {
    const content = await readRegistrySource(resolvedRoot, artifact);
    return toSetupArtifact(artifact, content);
  }));
  return {
    status: "ready",
    name: component.name,
    displayName: setupComponentDisplayName(component.name),
    kind: componentKind(component),
    description: componentDescription(component, artifacts),
    dependencies: component.dependencies.map((dependency) => ({
      name: dependency,
      displayName: setupComponentDisplayName(dependency),
    })),
    capabilities: component.capabilities,
    artifacts,
    tools: component.name === "codex-repo-context" ? [REPOSITORY_CONTEXT_TOOL] : [],
  };
}

export function validateSetupSourceOverrides(
  registry: ContextRegistryV2,
  directComponents: readonly string[],
  overrides: readonly SetupSourceOverride[],
): ReadonlyMap<string, string> {
  const resolved = resolveContextComponents(registry, directComponents);
  const editableSources = new Set(
    resolved.flatMap((component) => component.artifacts
      .filter(isEditableArtifact)
      .map((artifact) => artifact.sourcePath)),
  );
  for (const override of overrides) {
    if (!editableSources.has(override.sourcePath)) {
      throw new Error(
        `Setup source override ${override.sourcePath} is not editable in the selected component set.`,
      );
    }
  }
  return new Map(overrides.map((override) => [override.sourcePath, override.content]));
}

export function componentKind(
  component: ContextRegistryComponent,
): SetupComponentDetail["kind"] {
  return component.dependencies.length > 0 && component.artifacts.length === 0
    ? "bundle"
    : "component";
}

function componentDescription(
  component: ContextRegistryComponent,
  artifacts: readonly SetupComponentArtifact[],
): string {
  const skill = artifacts.find((artifact) => artifact.sourcePath.endsWith("/SKILL.md"));
  const skillDescription = skill === undefined ? undefined : frontmatterDescription(skill.content);
  if (skillDescription !== undefined) return skillDescription;
  const exact = COMPONENT_DESCRIPTIONS[component.name];
  if (exact !== undefined) return exact;
  if (componentKind(component) === "bundle") {
    const names = component.dependencies.map(setupComponentDisplayName);
    return `Includes ${formatList(names)}.`;
  }
  return component.artifacts.length === 1
    ? `Installs ${component.artifacts[0]?.targetPath ?? "one project file"}.`
    : `Installs ${component.artifacts.length} project files.`;
}

function frontmatterDescription(content: string): string | undefined {
  const match = /^---\r?\n[\s\S]*?^description:\s*(.+)\r?\n[\s\S]*?^---\s*$/mu.exec(content);
  if (match?.[1] === undefined) return undefined;
  const value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(value);
      return typeof decoded === "string" && decoded.length > 0 ? decoded : undefined;
    } catch {
      return undefined;
    }
  }
  return value.length > 0 ? value : undefined;
}

function toSetupArtifact(
  artifact: ContextRegistryArtifact,
  content: string,
): SetupComponentArtifact {
  return {
    sourcePath: artifact.sourcePath,
    targetPath: artifact.targetPath,
    operation: artifact.operation,
    mediaType: "mediaType" in artifact ? artifact.mediaType : mediaTypeFor(artifact.sourcePath),
    editable: isEditableArtifact(artifact),
    content,
  };
}

function isEditableArtifact(artifact: ContextRegistryArtifact): boolean {
  const name = path.posix.basename(artifact.sourcePath);
  return artifact.operation !== "seed-file" &&
    !name.startsWith("LICENSE") &&
    name !== "SOURCE.json" &&
    !artifact.sourcePath.includes("/licenses/") &&
    !artifact.sourcePath.includes("/attributions/");
}

async function readRegistrySource(
  frameworkRoot: string,
  artifact: ContextRegistryArtifact,
): Promise<string> {
  const candidate = path.resolve(frameworkRoot, artifact.sourcePath);
  const resolved = await realpath(candidate);
  const relative = path.relative(frameworkRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Registry source escapes the framework root: ${artifact.sourcePath}.`);
  }
  const bytes = await readFile(resolved);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== artifact.sourceSha256) {
    throw new Error(
      `Registry source hash mismatch for ${artifact.sourcePath}: expected ${artifact.sourceSha256}, got ${hash}.`,
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Registry source is not valid UTF-8: ${artifact.sourcePath}.`, { cause: error });
  }
}

async function readRepositoryFacts(projectRoot: string): Promise<RepositoryFacts> {
  try {
    const text = await readFile(path.join(projectRoot, ".agent-context", "policy.json"), "utf8");
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.state !== "configured" || !isRecord(value.repository)) {
      return EMPTY_REPOSITORY_FACTS;
    }
    const languages = value.repository.languages;
    return {
      languages: Array.isArray(languages)
        ? languages.filter((entry): entry is string => typeof entry === "string")
        : [],
      frontend: value.repository.frontend === true,
    };
  } catch {
    return EMPTY_REPOSITORY_FACTS;
  }
}

function displayToken(token: string, index: number): string {
  const exact: Readonly<Record<string, string>> = {
    acf: "ACF",
    codex: "Codex",
    css: "CSS",
    mcp: "MCP",
    oxfmt: "Oxfmt",
    react: "React",
    typescript: "TypeScript",
    ui: "UI",
  };
  const known = exact[token];
  if (known !== undefined) return known;
  return index === 0 ? token.charAt(0).toUpperCase() + token.slice(1) : token;
}

function mediaTypeFor(sourcePath: string): string {
  const extension = path.posix.extname(sourcePath);
  if (extension === ".md") return "text/markdown";
  if (extension === ".json") return "application/json";
  if (extension === ".toml") return "application/toml";
  if (extension === ".ts" || extension === ".tsx") return "text/typescript";
  if (extension === ".js" || extension === ".mjs") return "text/javascript";
  if (extension === ".yaml" || extension === ".yml") return "application/yaml";
  return "text/plain";
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) return "no additional components";
  if (values.length === 1) return values[0] ?? "one component";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function argument(
  name: string,
  type: string,
  required: boolean,
  description: string,
  constraints: readonly string[],
) {
  return { name, type, required, description, constraints };
}

interface RepositoryFacts {
  readonly languages: readonly string[];
  readonly frontend: boolean;
}

const EMPTY_REPOSITORY_FACTS: RepositoryFacts = { languages: [], frontend: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
