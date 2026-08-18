#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const tscPath = path.resolve(path.dirname(require.resolve("typescript")), "../bin/tsc");
const projectDirectory = fileURLToPath(new URL("..", import.meta.url));

try {
  await execFileAsync(process.execPath, [tscPath, "-b", projectDirectory]);
} catch (error) {
  const detail = error instanceof Error
    ? error.stack ?? error.message
    : String(error);
  process.stderr.write(`Failed to build the repository-context MCP dependencies.\n${detail}\n`);
  process.exit(1);
}

await import("./repo-context-server.js");
