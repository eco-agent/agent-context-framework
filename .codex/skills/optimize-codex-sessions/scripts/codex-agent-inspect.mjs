#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";

import { inspectAgentThread } from "./codex-session-metrics.mjs";

const args = process.argv.slice(2).filter((value) => value !== "--");
const threadId = argumentValue(args, "--thread");
if (threadId === undefined) {
  throw new Error("Usage: node .codex/skills/optimize-codex-sessions/scripts/codex-agent-inspect.mjs --thread <child-thread-id>");
}
const codexHome = path.resolve(
  argumentValue(args, "--codex-home") ??
    process.env.CODEX_HOME ??
    path.join(os.homedir(), ".codex"),
);
const inspection = await inspectAgentThread(threadId, codexHome);
process.stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);

function argumentValue(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}
