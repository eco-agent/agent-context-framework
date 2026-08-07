#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

try {
  const [operation, profile, ...rest] = process.argv.slice(2);
  if (
    (operation !== "inspect" && operation !== "doctor" && operation !== "verify") ||
    rest.length > 0 ||
    ((operation === "inspect" || operation === "doctor") && profile !== undefined)
  ) {
    throw new Error("Usage: node .agent-context/policy.mjs <inspect|doctor|verify [PROFILE]>.");
  }
  const contextRoot = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.dirname(contextRoot);
  const policyCli = path.join(
    contextRoot,
    "runtime",
    "packages",
    "policy",
    "dist",
    "src",
    "cli.js",
  );
  const arguments_ = [policyCli, operation, "--root", projectRoot];
  if (operation === "doctor" || operation === "verify") {
    arguments_.push(
      "--config",
      ".agent-context/policy.json",
      "--invariants",
      ".agent-context/policy-invariants.json",
    );
  }
  if (operation === "verify" && profile !== undefined) {
    arguments_.push("--profile", profile);
  }
  const result = spawnSync(process.execPath, arguments_, {
    cwd: projectRoot,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
