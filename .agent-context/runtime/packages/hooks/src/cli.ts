#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

import {
  classifyHookFailureEvent,
  decodeHookInput,
  evaluateHook,
  failureEventForHookInput,
  loadScopedSessionBinding,
  type HookDecision,
  type HookFailureEvent,
} from "./index.js";

let failureEvent: HookFailureEvent = "unclassified";
try {
  const request = parseArguments(process.argv.slice(2));
  const rawInput = readFileSync(0, "utf8");
  const parsedInput = JSON.parse(rawInput) as unknown;
  failureEvent = classifyHookFailureEvent(parsedInput);
  const input = decodeHookInput(parsedInput);
  failureEvent = failureEventForHookInput(input);
  if (input.event === "unsupported") {
    process.exitCode = 0;
  } else {
    const binding = await loadScopedSessionBinding(
      request.root,
      request.bindingPath,
      input.sessionId,
    );
    writeDecision(evaluateHook(input, binding));
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

function parseArguments(arguments_: readonly string[]): {
  readonly root: string;
  readonly bindingPath: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if ((name !== "--root" && name !== "--binding") || value === undefined) {
      throw new Error(`Invalid hook argument: ${name ?? ""}.`);
    }
    values.set(name, value);
  }
  const root = values.get("--root");
  const bindingPath = values.get("--binding");
  if (root === undefined || bindingPath === undefined) {
    throw new Error("Hook requires explicit --root and --binding paths.");
  }
  return { root, bindingPath };
}

function writeDecision(decision: HookDecision): void {
  if (decision.kind === "noop") {
    return;
  }
  const hookSpecificOutput =
    decision.kind === "context"
      ? {
          hookEventName: "SessionStart",
          additionalContext: decision.additionalContext,
        }
      : {
          hookEventName: "PreToolUse",
          permissionDecision: decision.kind,
          ...(decision.kind === "deny"
            ? { permissionDecisionReason: decision.reason }
            : {}),
        };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}
