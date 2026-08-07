#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { verifyRuntimeIsolation } from "./runtime-isolation.js";

const frameworkRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

try {
  const result = await verifyRuntimeIsolation(frameworkRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
