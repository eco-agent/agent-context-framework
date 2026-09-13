#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "context-installer-cli.ts",
);
const child = spawn(
  process.execPath,
  ["--import", "tsx", cliPath, ...process.argv.slice(2)],
  { stdio: "inherit", windowsHide: true },
);

child.once("error", (error) => {
  process.stderr.write(`acf could not start: ${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
