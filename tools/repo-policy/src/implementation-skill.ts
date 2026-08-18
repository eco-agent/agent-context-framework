const IMPLEMENTATION_SKILL_PATH = /^\.codex\/skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/u;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ALLOWED_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
]);

export interface ValidatedImplementationSkill {
  readonly path: string;
  readonly name: string;
  readonly description: string;
}

export function validateImplementationSkill(
  skillPath: string,
  content: string,
): ValidatedImplementationSkill {
  const normalizedPath = skillPath.replaceAll("\\", "/");
  const pathMatch = IMPLEMENTATION_SKILL_PATH.exec(normalizedPath);
  if (pathMatch === null) {
    throw new Error(
      "Implementation skill path must match .codex/skills/<name>/SKILL.md.",
    );
  }
  const directoryName = pathMatch[1];
  if (directoryName === undefined) {
    throw new Error("Implementation skill path has no skill name.");
  }
  const frontmatter = parseFrontmatter(content);
  const name = requiredFrontmatterValue(frontmatter, "name");
  const description = requiredFrontmatterValue(frontmatter, "description");
  if (!SKILL_NAME.test(name)) {
    throw new Error("Implementation skill name must use non-empty hyphen-case text.");
  }
  if (name !== directoryName) {
    throw new Error(
      `Implementation skill name ${name} does not match directory ${directoryName}.`,
    );
  }
  if (/[<>]/u.test(description)) {
    throw new Error(
      "Implementation skill description must not contain angle brackets.",
    );
  }
  return { path: normalizedPath, name, description };
}

function parseFrontmatter(content: string): ReadonlyMap<string, string> {
  const normalized = content.replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized);
  if (match === null || match[1] === undefined) {
    throw new Error("Implementation skill must start with YAML frontmatter.");
  }
  const values = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    if (line.trim().length === 0 || /^\s/u.test(line)) continue;
    const property = /^([a-z][a-z0-9-]*):(?:\s*(.*))?$/u.exec(line);
    if (property === null || property[1] === undefined) {
      throw new Error(`Implementation skill frontmatter line is invalid: ${line}`);
    }
    const key = property[1];
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      throw new Error(`Implementation skill frontmatter contains unknown field: ${key}.`);
    }
    if (values.has(key)) {
      throw new Error(`Implementation skill frontmatter repeats field: ${key}.`);
    }
    values.set(key, unquote((property[2] ?? "").trim()));
  }
  return values;
}

function requiredFrontmatterValue(
  frontmatter: ReadonlyMap<string, string>,
  key: "name" | "description",
): string {
  const value = frontmatter.get(key)?.trim();
  if (!value) {
    throw new Error(`Implementation skill frontmatter requires non-empty ${key}.`);
  }
  return value;
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
