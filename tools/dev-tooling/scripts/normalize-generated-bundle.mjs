#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  throw new Error("normalize-generated-bundle requires at least one generated file.");
}

for (const target of targets) {
  const source = await readFile(target, "utf8");
  const normalized = source
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  if (normalized !== source) await writeFile(target, normalized, "utf8");
}
