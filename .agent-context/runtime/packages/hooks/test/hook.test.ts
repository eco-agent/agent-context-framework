import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHookInput,
  decodeScopedSessionBinding,
  evaluateHook,
} from "../src/index.js";

const binding = decodeScopedSessionBinding({
  schemaVersion: 1,
  sessionId: "session-1",
  writablePaths: ["src/**", "README.md"],
  sources: [],
  compactContext: "Continue within the recorded scope.",
});

test("hook permits only patch paths inside the scoped session", () => {
  const allowed = decodeHookInput({
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    session_id: "session-1",
    tool_input: { command: "*** Update File: src/index.ts" },
  });
  assert.deepEqual(evaluateHook(allowed, binding), { kind: "allow" });

  const denied = decodeHookInput({
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    session_id: "session-1",
    tool_input: { command: "*** Update File: package.json" },
  });
  assert.deepEqual(evaluateHook(denied, binding), {
    kind: "deny",
    reason: "package.json is outside the active session's writable paths.",
  });
});

test("hook restores compact-session context without objective state", () => {
  const input = decodeHookInput({
    hook_event_name: "SessionStart",
    source: "compact",
    session_id: "session-1",
  });
  assert.deepEqual(evaluateHook(input, binding), {
    kind: "context",
    additionalContext: "Continue within the recorded scope.",
  });
  assert.equal(JSON.stringify(binding).includes("objective"), false);
  assert.equal(JSON.stringify(binding).includes("lease"), false);
  assert.equal(JSON.stringify(binding).includes("envelope"), false);
});
