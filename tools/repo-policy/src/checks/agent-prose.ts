import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeRelative, pathExists, resolvesInside } from "../filesystem.js";

export const agentProseRuleIds = [
  "chatbot-phrase",
  "curly-quote",
  "em-dash",
  "inline-header",
  "not-just-but",
] as const;

export type AgentProseRuleId = (typeof agentProseRuleIds)[number];

export interface AgentProseFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: AgentProseRuleId;
  readonly message: string;
  readonly excerpt: string;
}

export interface AgentProseReport {
  readonly ok: boolean;
  readonly files: readonly string[];
  readonly findings: readonly AgentProseFinding[];
}

interface TextRule {
  readonly rule: Exclude<AgentProseRuleId, "inline-header">;
  readonly pattern: RegExp;
  readonly message: string;
}

const supportedExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".toml",
  ".ts",
  ".tsx",
]);

const modelFacingFiles = new Set([
  "AGENTS.md",
  "docs/AGENTS.md",
]);

const modelFacingRoots = [
  ".codex/agents/",
  ".codex/skills/",
  ".codex/work/",
  "registry/decisions/",
  "registry/sources/codex/",
  "registry/sources/instructions/",
  "registry/sources/templates/",
  "tools/codex-workflows/",
] as const;

const textRules: readonly TextRule[] = [
  {
    rule: "chatbot-phrase",
    pattern: /\b(?:certainly|of course|great question|i hope this helps|let me know if|you(?:'|’)re absolutely right|found the smoking gun)\b/giu,
    message: "Remove the stock chatbot phrase and state the response directly.",
  },
  {
    rule: "curly-quote",
    pattern: /[“”‘’]/gu,
    message: "Use straight quotation marks in model-facing prose.",
  },
  {
    rule: "em-dash",
    pattern: /—/gu,
    message: "Replace the em dash with a sentence or comma.",
  },
  {
    rule: "not-just-but",
    pattern: /\bnot\s+(?:just|only)\b[^.\n]{0,120}\bbut\b/giu,
    message: "State the main point directly instead of using not-just-but framing.",
  },
];

export async function checkAgentProse(
  root: string,
  files: readonly string[],
): Promise<AgentProseReport> {
  const normalizedFiles = [...new Set(files.map((file) => file.replaceAll("\\", "/")))].sort();
  if (normalizedFiles.length === 0) {
    throw new Error("check-agent-prose requires at least one file.");
  }

  const findings: AgentProseFinding[] = [];
  const checkedFiles: string[] = [];
  for (const file of normalizedFiles) {
    const absolute = path.resolve(root, file);
    if (!(await resolvesInside(root, absolute))) {
      throw new Error(`Agent prose target resolves outside the repository: ${file}`);
    }
    if (!(await pathExists(absolute))) {
      throw new Error(`Agent prose target does not exist: ${file}`);
    }
    if (!supportedExtensions.has(path.extname(absolute).toLowerCase())) {
      throw new Error(`Agent prose target has an unsupported file type: ${file}`);
    }

    const relative = normalizeRelative(root, absolute);
    checkedFiles.push(relative);
    findings.push(...lintAgentProse(relative, await readFile(absolute, "utf8")));
  }

  return {
    ok: findings.length === 0,
    files: checkedFiles,
    findings: findings.sort(compareFindings),
  };
}

export async function agentProseFilesForChanges(
  root: string,
  files: readonly string[],
): Promise<readonly string[]> {
  const selected: string[] = [];
  for (const candidate of new Set(files.map((file) => file.replaceAll("\\", "/")))) {
    if (!isModelFacingFile(candidate)) continue;
    const absolute = path.resolve(root, candidate);
    if (!(await resolvesInside(root, absolute))) {
      throw new Error(`Changed agent prose target resolves outside the repository: ${candidate}`);
    }
    if (await pathExists(absolute)) selected.push(normalizeRelative(root, absolute));
  }
  return selected.sort();
}

export function lintAgentProse(
  file: string,
  content: string,
): readonly AgentProseFinding[] {
  const markdown = isMarkdown(file);
  const findings: AgentProseFinding[] = [];

  for (const line of sourceLines(file, content)) {
    const text = markdown ? blankInlineCode(line.text) : line.text;
    for (const rule of textRules) {
      const checked =
        line.quotedExamples && isPhraseRule(rule) ? blankDoubleQuotedExamples(text) : text;
      for (const match of checked.matchAll(rule.pattern)) {
        findings.push({
          file,
          line: line.number,
          column: match.index + 1,
          rule: rule.rule,
          message: rule.message,
          excerpt: line.text.trim(),
        });
      }
    }

    const match = text.match(/(?:^\s*|["'`]\s*)[-+*]\s+\*\*[^*\n]+:\*\*/u);
    if (match === null) continue;
    findings.push({
      file,
      line: line.number,
      column: (match.index ?? 0) + 1,
      rule: "inline-header",
      message: "Replace the bold label and colon with prose or a real heading.",
      excerpt: line.text.trim(),
    });
  }

  return findings.sort(compareFindings);
}

export function formatAgentProseFinding(finding: AgentProseFinding): string {
  return `${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}`;
}

function isPhraseRule(rule: TextRule): boolean {
  return rule.rule === "chatbot-phrase" || rule.rule === "not-just-but";
}

function sourceLines(file: string, content: string): readonly {
  readonly number: number;
  readonly text: string;
  readonly quotedExamples: boolean;
}[] {
  if (!isMarkdown(file)) {
    return content.replaceAll("\r\n", "\n").split("\n").map((text, index) => ({
      number: index + 1,
      text,
      quotedExamples: false,
    }));
  }

  const result: { number: number; text: string; quotedExamples: boolean }[] = [];
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const frontmatterEnd = lines[0]?.trim() === "---"
    ? lines.findIndex((line, index) => index > 0 && line.trim() === "---")
    : -1;
  let fenced = false;
  let marker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    const fence = text.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (fence !== undefined) {
      if (!fenced) {
        fenced = true;
        marker = fence[0] ?? "";
      } else if ((fence[0] ?? "") === marker) {
        fenced = false;
        marker = "";
      }
      continue;
    }
    if (!fenced) {
      result.push({
        number: index + 1,
        text,
        quotedExamples: frontmatterEnd < 0 || index > frontmatterEnd,
      });
    }
  }
  return result;
}

function isMarkdown(file: string): boolean {
  return file.endsWith(".md") || file.endsWith(".mdx");
}

function isModelFacingFile(file: string): boolean {
  if (!supportedExtensions.has(path.extname(file).toLowerCase())) return false;
  return modelFacingFiles.has(file) || modelFacingRoots.some((root) => file.startsWith(root));
}

function blankDoubleQuotedExamples(text: string): string {
  return blankMatches(text, /"[^"\n]*"/gu);
}

function blankInlineCode(text: string): string {
  return blankMatches(text, /`+[^`]*`+/gu);
}

function blankMatches(text: string, pattern: RegExp): string {
  const characters = text.split("");
  for (const match of text.matchAll(pattern)) {
    for (let index = match.index; index < match.index + match[0].length; index += 1) {
      characters[index] = " ";
    }
  }
  return characters.join("");
}

function compareFindings(left: AgentProseFinding, right: AgentProseFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule)
  );
}
