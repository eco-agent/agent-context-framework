#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { runtimeRoot } from "./tooling.mjs";

const requiredSources = [
  "packages/shared/src/index.ts",
  "packages/policy/src/index.ts",
  "packages/repo-context/src/index.ts",
  "packages/hooks/src/index.ts",
];
const requiredOutputs = [
  "packages/shared/dist/src/index.js",
  "packages/policy/dist/src/index.js",
  "packages/repo-context/dist/src/index.js",
  "packages/hooks/dist/src/index.js",
];

const state = classify();
process.stdout.write(`${JSON.stringify(state, undefined, 2)}\n`);
process.exitCode = state.status === "invalid" ? 1 : 0;

function classify() {
  try {
    const manifestPath = path.join(runtimeRoot, "package.json");
    const lockPath = path.join(runtimeRoot, "pnpm-lock.yaml");
    if (!existsSync(manifestPath) || !existsSync(lockPath)) {
      return invalid("Runtime manifest and lockfile are required.");
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      manifest?.packageManager !== "pnpm@10.22.0" ||
      manifest?.engines?.node !== "24.14.0"
    ) {
      return invalid("Runtime package-manager and Node versions must match the fixed contract.");
    }
    const missingSource = requiredSources.find(
      (candidate) => !existsSync(path.join(runtimeRoot, candidate)),
    );
    if (missingSource !== undefined) {
      return invalid(`Required runtime source is missing: ${missingSource}.`);
    }
    if (!existsSync(path.join(runtimeRoot, "node_modules", "typescript"))) {
      return {
        status: "dependencies-missing",
        operational: false,
        message: "Runtime source is materialized but dependencies are not installed.",
      };
    }
    const missingOutput = requiredOutputs.find(
      (candidate) => !existsSync(path.join(runtimeRoot, candidate)),
    );
    if (missingOutput !== undefined) {
      return {
        status: "build-missing",
        operational: false,
        message: `Runtime dependencies are installed but output is missing: ${missingOutput}.`,
      };
    }
    return {
      status: "operational",
      operational: true,
      message: "Runtime dependencies and generated entry points are present.",
    };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
}

function invalid(message) {
  return { status: "invalid", operational: false, message };
}
