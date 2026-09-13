import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
