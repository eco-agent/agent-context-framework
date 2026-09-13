import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(packageRoot, ".output", "public");
const destination = path.resolve(packageRoot, "..", "dev-tooling", "repository-ui");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

const indexPath = path.join(destination, "index.html");
const index = await readFile(indexPath, "utf8");
await writeFile(indexPath, index.replace(/\bu:\d{10,}/gu, "u:0"), "utf8");
await normalizePublishedText(destination);

async function normalizePublishedText(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizePublishedText(target);
      continue;
    }
    if (!/\.(?:css|html|js|json|map|mjs|svg)$/u.test(entry.name)) continue;
    const source = await readFile(target, "utf8");
    const normalized = source
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
    if (normalized !== source) await writeFile(target, normalized, "utf8");
  }
}
