#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { verifyAcceptanceSequence } from "./acceptance-verification.js";

export interface AcceptanceVerificationCliRequest {
  readonly fixtureRoot: string;
}

export function parseAcceptanceVerificationArguments(
  arguments_: readonly string[],
): AcceptanceVerificationCliRequest {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (values.length !== 2 || values[0] !== "--fixture") {
    throw new Error("Usage: pnpm --silent verify:acceptance -- --fixture <absolute-path>.");
  }
  const fixtureRoot = values[1];
  if (fixtureRoot === undefined || !path.isAbsolute(fixtureRoot)) {
    throw new Error("--fixture must be an absolute path.");
  }
  return { fixtureRoot };
}

const invokedPath = process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const frameworkRoot = path.resolve(import.meta.dirname, "../../..");
  try {
    const request = parseAcceptanceVerificationArguments(process.argv.slice(2));
    const result = await verifyAcceptanceSequence({
      frameworkRoot,
      fixtureRoot: request.fixtureRoot,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: false,
        status: "failed",
        framework: null,
        fixture: null,
        failure: {
          phase: "preflight",
          detail: error instanceof Error ? error.message : String(error),
        },
        stages: [
          { id: "workspace", status: "not-run" },
          { id: "isolation", status: "not-run" },
          { id: "downstream", status: "not-run" },
        ],
      })}\n`,
    );
    process.exitCode = 1;
  }
}
