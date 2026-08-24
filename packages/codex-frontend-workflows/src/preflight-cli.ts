#!/usr/bin/env node
import process from "node:process";

import { runWindowsFrontendWorkflowPreflight } from "./preflight.js";

try {
  const result = await runWindowsFrontendWorkflowPreflight();
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
  process.exitCode = result.status === "ready" ? 0 : 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "failed",
    modelTurnsStarted: 0,
    platform: process.platform,
    checks: [],
    issue: error instanceof Error ? error.message : String(error),
  }, undefined, 2)}\n`);
  process.exitCode = 1;
}
