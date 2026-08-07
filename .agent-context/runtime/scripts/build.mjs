#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  runtimePackageProjects,
  runtimeRoot,
  typescriptCli,
} from "./tooling.mjs";

try {
  const result = spawnSync(
    process.execPath,
    [typescriptCli(), "-b", ...runtimePackageProjects()],
    {
    cwd: runtimeRoot,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
    windowsHide: true,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
