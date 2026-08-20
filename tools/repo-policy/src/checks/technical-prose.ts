import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRelative, pathExists, resolvesInside } from "../filesystem.js";

export const technicalProseRuleIds = [
  "semicolon",
  "contraction",
  "formal-phrase",
  "marketing-language",
] as const;

export type TechnicalProseRuleId = (typeof technicalProseRuleIds)[number];

export interface TechnicalProseFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: TechnicalProseRuleId;
  readonly message: string;
  readonly excerpt: string;
}

export interface TechnicalProseReport {
  readonly ok: boolean;
  readonly files: readonly string[];
  readonly findings: readonly TechnicalProseFinding[];
}

interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface ProseBlock {
  readonly text: string;
  readonly positions: readonly SourcePosition[];
  readonly excerptLines: ReadonlyMap<number, string>;
}

interface PhraseRule {
  readonly rule: "formal-phrase" | "marketing-language";
  readonly pattern: RegExp;
  readonly replacement: string;
}

const phraseRules: readonly PhraseRule[] = [
  {
    rule: "formal-phrase",
    pattern: /\bat this point in time\b/giu,
    replacement: 'Use "now".',
  },
  {
    rule: "formal-phrase",
    pattern: /\bdue to the fact that\b/giu,
    replacement: 'Use "because".',
  },
  {
    rule: "formal-phrase",
    pattern: /\bhas the capability to\b/giu,
    replacement: 'Use "can".',
  },
  {
    rule: "formal-phrase",
    pattern: /\bin order to\b/giu,
    replacement: 'Use "to".',
  },
  {
    rule: "formal-phrase",
    pattern: /\bit is important to note that\b/giu,
    replacement: "State the fact directly.",
  },
  {
    rule: "formal-phrase",
    pattern: /\bmake use of\b/giu,
    replacement: 'Use "use".',
  },
  {
    rule: "formal-phrase",
    pattern: /\bmay perhaps\b/giu,
    replacement: "State the actual condition or remove the hedge.",
  },
  {
    rule: "formal-phrase",
    pattern: /\bwith regard to\b/giu,
    replacement: 'Use "about".',
  },
  {
    rule: "marketing-language",
    pattern: /\b(?:best-in-class|cutting-edge|game-changing|revolutionary|seamless(?:ly)?)\b/giu,
    replacement: "Replace promotional language with an observable property.",
  },
];

const contractionPattern =
  /\b(?:aren't|can't|couldn't|didn't|doesn't|don't|hadn't|hasn't|haven't|isn't|mustn't|shouldn't|wasn't|weren't|won't|wouldn't|you'll|you're|you've|we'll|we're|we've|they'll|they're|they've|it's|that's|there's)\b/giu;

export async function checkTechnicalProse(
  root: string,
  files: readonly string[],
): Promise<TechnicalProseReport> {
  const normalizedFiles = [...new Set(files.map((file) => file.replaceAll("\\", "/")))].sort();
  if (normalizedFiles.length === 0) {
    throw new Error("check-technical-prose requires at least one file.");
  }

  const findings: TechnicalProseFinding[] = [];
  const checkedFiles: string[] = [];
  for (const file of normalizedFiles) {
    const absolute = path.resolve(root, file);
    if (!(await resolvesInside(root, absolute))) {
      throw new Error(`Technical prose target resolves outside the repository: ${file}`);
    }
    if (!(await pathExists(absolute))) {
      throw new Error(`Technical prose target does not exist: ${file}`);
    }
    if (!absolute.endsWith(".md") && !absolute.endsWith(".mdx")) {
      throw new Error(`Technical prose target must be Markdown: ${file}`);
    }

    const relative = normalizeRelative(root, absolute);
    checkedFiles.push(relative);
    const content = await readFile(absolute, "utf8");
    findings.push(...lintTechnicalProse(relative, content));
  }

  return {
    ok: findings.length === 0,
    files: checkedFiles,
    findings: findings.sort(compareFindings),
  };
}

export function lintTechnicalProse(
  file: string,
  markdown: string,
): readonly TechnicalProseFinding[] {
  const findings: TechnicalProseFinding[] = [];
  for (const block of proseBlocks(markdown)) {
    for (const rule of phraseRules) {
      for (const match of block.text.matchAll(rule.pattern)) {
        findings.push(
          findingAt(
            file,
            block,
            match.index,
            rule.rule,
            `${JSON.stringify(match[0])} is indirect. ${rule.replacement}`,
          ),
        );
      }
    }

    for (const match of block.text.matchAll(/;/gu)) {
      findings.push(
        findingAt(
          file,
          block,
          match.index,
          "semicolon",
          "Split the clauses into separate sentences.",
        ),
      );
    }

    for (const match of block.text.matchAll(contractionPattern)) {
      findings.push(
        findingAt(
          file,
          block,
          match.index,
          "contraction",
          `Expand ${JSON.stringify(match[0])} in technical prose.`,
        ),
      );
    }
  }

  return findings.sort(compareFindings);
}

export function formatTechnicalProseFinding(finding: TechnicalProseFinding): string {
  return `${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}`;
}

export function proseBlocks(markdown: string): readonly ProseBlock[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const tableLines = markdownTableLines(lines);
  const frontmatterEnd =
    lines[0]?.trim() === "---"
      ? lines.findIndex((line, index) => index > 0 && line.trim() === "---")
      : -1;
  const blocks: ProseBlock[] = [];
  let paragraph: readonly number[] = [];
  let fenced = false;
  let fenceMarker = "";

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(buildBlock(lines, paragraph));
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (frontmatterEnd > 0 && index <= frontmatterEnd) {
      continue;
    }
    const line = lines[index] ?? "";
    const fence = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (fence !== undefined) {
      if (!fenced) {
        flushParagraph();
        fenced = true;
        fenceMarker = fence[0] ?? "";
      } else if ((fence[0] ?? "") === fenceMarker) {
        fenced = false;
        fenceMarker = "";
      }
      continue;
    }
    if (fenced || tableLines.has(index)) {
      flushParagraph();
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    if (/^\s*(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+)/u.test(line)) {
      flushParagraph();
      blocks.push(buildBlock(lines, [index]));
      continue;
    }

    paragraph = [...paragraph, index];
  }

  flushParagraph();
  return blocks.filter((block) => block.text.trim().length > 0);
}

function buildBlock(lines: readonly string[], indexes: readonly number[]): ProseBlock {
  let text = "";
  const positions: SourcePosition[] = [];
  const excerptLines = new Map<number, string>();

  for (const [blockLineIndex, sourceIndex] of indexes.entries()) {
    const source = lines[sourceIndex] ?? "";
    const sanitized = sanitizeMarkdownLine(source);
    excerptLines.set(sourceIndex + 1, source.trim());
    if (blockLineIndex > 0) {
      text += "\n";
      positions.push({ line: sourceIndex + 1, column: 1 });
    }
    text += sanitized;
    positions.push(
      ...sanitized.split("").map((_, column) => ({
        line: sourceIndex + 1,
        column: column + 1,
      })),
    );
  }

  return { text, positions, excerptLines };
}

function sanitizeMarkdownLine(source: string): string {
  const characters = source.split("");
  blankMatch(characters, source.match(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/u));

  for (const match of source.matchAll(/`+[^`]*`+/gu)) {
    blankRange(characters, match.index, match[0].length);
  }

  for (const match of source.matchAll(/!?\[([^\]]*)\]\(([^)]*)\)/gu)) {
    const label = match[1] ?? "";
    const labelOffset = match[0].indexOf(label);
    for (let index = 0; index < match[0].length; index += 1) {
      if (index < labelOffset || index >= labelOffset + label.length) {
        const target = match.index + index;
        if (target < characters.length) {
          characters[target] = " ";
        }
      }
    }
  }

  return characters.join("");
}

function markdownTableLines(lines: readonly string[]): ReadonlySet<number> {
  const result = new Set<number>();
  const delimiter = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u;
  for (let index = 0; index < lines.length; index += 1) {
    if (!delimiter.test(lines[index] ?? "")) {
      continue;
    }
    if (index > 0 && (lines[index - 1] ?? "").includes("|")) {
      result.add(index - 1);
    }
    result.add(index);
    for (let row = index + 1; row < lines.length; row += 1) {
      const line = lines[row] ?? "";
      if (line.trim().length === 0 || !line.includes("|")) {
        break;
      }
      result.add(row);
    }
  }
  return result;
}

function findingAt(
  file: string,
  block: ProseBlock,
  index: number,
  rule: TechnicalProseRuleId,
  message: string,
): TechnicalProseFinding {
  const boundedIndex = Math.max(0, Math.min(index, block.positions.length - 1));
  const position = block.positions[boundedIndex] ?? { line: 1, column: 1 };
  return {
    file,
    line: position.line,
    column: position.column,
    rule,
    message,
    excerpt: block.excerptLines.get(position.line) ?? "",
  };
}

function blankMatch(characters: string[], match: RegExpMatchArray | null): void {
  if (match === null) {
    return;
  }
  blankRange(characters, match.index ?? 0, match[0].length);
}

function blankRange(characters: string[], start: number, length: number): void {
  for (let index = start; index < start + length && index < characters.length; index += 1) {
    characters[index] = " ";
  }
}

function compareFindings(left: TechnicalProseFinding, right: TechnicalProseFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule)
  );
}
