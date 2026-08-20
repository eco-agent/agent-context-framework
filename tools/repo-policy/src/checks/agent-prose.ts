import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeRelative, pathExists, resolvesInside } from "../filesystem.js";
import { proseBlocks, type ProseBlock } from "./technical-prose.js";

export const agentProseRuleIds = [
  "catalog-description",
  "chatbot-phrase",
  "curly-quote",
  "em-dash",
  "inline-header",
  "not-just-but",
  "title-case-heading",
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
  readonly rule: Exclude<
    AgentProseRuleId,
    "catalog-description" | "inline-header" | "title-case-heading"
  >;
  readonly pattern: RegExp;
  readonly message: string;
}

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
    if (!absolute.endsWith(".md")) {
      throw new Error(`Agent prose target must be Markdown: ${file}`);
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

export function lintAgentProse(
  file: string,
  markdown: string,
): readonly AgentProseFinding[] {
  const findings: AgentProseFinding[] = [];

  const description = frontmatterDescription(markdown);
  if (description !== null) {
    const words = description.value.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
    const hasSecondSentence = /[.!?]\s+[\p{Lu}\p{N}]/gu.test(description.value);
    if (words.length > 30 || hasSecondSentence) {
      findings.push({
        file,
        line: description.line,
        column: description.column,
        rule: "catalog-description",
        message: "Keep a skill description to one discriminating sentence of at most 30 words.",
        excerpt: description.source,
      });
    }
    for (const rule of textRules) {
      for (const match of description.value.matchAll(rule.pattern)) {
        findings.push({
          file,
          line: description.line,
          column: description.column + match.index,
          rule: rule.rule,
          message: rule.message,
          excerpt: description.source,
        });
      }
    }
  }

  for (const block of proseBlocks(markdown)) {
    for (const rule of textRules) {
      for (const match of block.text.matchAll(rule.pattern)) {
        findings.push(findingAt(file, block, match.index, rule.rule, rule.message));
      }
    }
  }

  for (const line of markdownLinesOutsideFences(markdown)) {
    const inlineHeader = line.text.match(/^\s*[-+*]\s+\*\*[^*\n]+:\*\*/u);
    if (inlineHeader !== null) {
      findings.push({
        file,
        line: line.number,
        column: (inlineHeader.index ?? 0) + 1,
        rule: "inline-header",
        message: "Replace the bold label and colon with prose or a real heading.",
        excerpt: line.text.trim(),
      });
    }

    const heading = line.text.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/u);
    if (heading !== null && looksTitleCased(heading[1] ?? "")) {
      findings.push({
        file,
        line: line.number,
        column: line.text.indexOf(heading[1] ?? "") + 1,
        rule: "title-case-heading",
        message: "Use sentence case for this heading.",
        excerpt: line.text.trim(),
      });
    }
  }

  return findings.sort(compareFindings);
}

export function formatAgentProseFinding(finding: AgentProseFinding): string {
  return `${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}`;
}

function frontmatterDescription(markdown: string): {
  readonly value: string;
  readonly line: number;
  readonly column: number;
  readonly source: string;
} | null {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return null;
  for (let index = 1; index < end; index += 1) {
    const source = lines[index] ?? "";
    const match = source.match(/^\s*description:\s*(.+?)\s*$/u);
    if (match === null) continue;
    const raw = match[1] ?? "";
    const value = raw.replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
    return {
      value,
      line: index + 1,
      column: source.indexOf(raw) + 1,
      source: source.trim(),
    };
  }
  return null;
}

function markdownLinesOutsideFences(markdown: string): readonly {
  readonly number: number;
  readonly text: string;
}[] {
  const result: { number: number; text: string }[] = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
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
    if (!fenced) result.push({ number: index + 1, text });
  }
  return result;
}

function looksTitleCased(heading: string): boolean {
  const plain = heading.replace(/`[^`]*`/gu, "");
  const words = plain.match(/[\p{L}][\p{L}'-]*/gu) ?? [];
  const candidates = words.filter((word) => word.length > 2 && word !== word.toUpperCase());
  if (candidates.length < 2) return false;
  return candidates.every((word) => /^\p{Lu}/u.test(word));
}

function findingAt(
  file: string,
  block: ProseBlock,
  index: number,
  rule: AgentProseRuleId,
  message: string,
): AgentProseFinding {
  const bounded = Math.max(0, Math.min(index, block.positions.length - 1));
  const position = block.positions[bounded] ?? { line: 1, column: 1 };
  return {
    file,
    line: position.line,
    column: position.column,
    rule,
    message,
    excerpt: block.excerptLines.get(position.line) ?? "",
  };
}

function compareFindings(left: AgentProseFinding, right: AgentProseFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule)
  );
}
