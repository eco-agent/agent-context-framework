import { readFile } from "node:fs/promises";
import path from "node:path";
import { findFiles, pathExists } from "../filesystem.js";

export async function checkDocs(root: string): Promise<readonly string[]> {
  const diagnostics: string[] = [];
  const markdownFiles = await findFiles(root, (relativePath) => relativePath.endsWith(".md"));

  for (const relativePath of markdownFiles) {
    const content = await readFile(path.join(root, relativePath), "utf8");
    for (const target of markdownTargets(content)) {
      if (
        target.startsWith("#") ||
        target.startsWith("/") ||
        /^[a-z][a-z0-9+.-]*:/iu.test(target)
      ) {
        continue;
      }

      const withoutFragment = target.split("#", 1)[0]?.split("?", 1)[0];
      if (withoutFragment === undefined || withoutFragment.length === 0) {
        continue;
      }

      const resolved = path.resolve(root, path.dirname(relativePath), decodeURIComponent(withoutFragment));
      if (!(await pathExists(resolved))) {
        diagnostics.push(`${relativePath} has a broken local link: ${target}`);
      }
    }
  }

  return diagnostics;
}

function markdownTargets(content: string): readonly string[] {
  return [...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1])
    .filter((target): target is string => target !== undefined);
}
