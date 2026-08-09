#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

import {
  classifyHookFailureEvent,
  decodeHookInput,
  evaluateHook,
  failureEventForHookInput,
  lookupCodexSessionBinding,
  type HookDecision,
  type HookFailureEvent,
} from "./index.js";

let failureEvent: HookFailureEvent = "unclassified";
try {
  const root = parseArguments(process.argv.slice(2));
  const rawInput = readFileSync(0, "utf8");
  const parsedInput = JSON.parse(rawInput) as unknown;
  failureEvent = classifyHookFailureEvent(parsedInput);
  const input = decodeHookInput(parsedInput);
  failureEvent = failureEventForHookInput(input);
  if (input.event !== "unsupported") {
    const lookup = await lookupCodexSessionBinding(root, input.sessionId);
    if (lookup.state === "valid") writeDecision(evaluateHook(input, lookup.binding));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (failureEvent === "session-start") {
    writeDecision({
      kind: "context",
      additionalContext: `Scoped session binding is invalid: ${message}`,
    });
  } else {
    writeDecision({
      kind: "deny",
      reason: `Scoped session binding is invalid; patching is disabled: ${message}`,
    });
  }
}

function parseArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--root" || arguments_[1] === undefined) {
    throw new Error("Codex hook requires exactly one explicit --root path.");
  }
  return arguments_[1];
}

function writeDecision(decision: HookDecision): void {
  if (decision.kind === "noop") return;
  const hookSpecificOutput = decision.kind === "context"
    ? {
        hookEventName: "SessionStart",
        additionalContext: decision.additionalContext,
      }
    : {
        hookEventName: "PreToolUse",
        permissionDecision: decision.kind,
        ...(decision.kind === "deny" ? { permissionDecisionReason: decision.reason } : {}),
      };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}
