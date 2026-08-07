import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("hook CLI preserves event identity across JSON formatting and malformed input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-hook-"));
  const cli = new URL("../src/cli.js", import.meta.url);
  try {
    for (const input of [
      JSON.stringify({
        hook_event_name: "SessionStart",
        source: "compact",
        session_id: "session-1",
      }),
      JSON.stringify(
        {
          hook_event_name: "SessionStart",
          source: "compact",
          session_id: "session-1",
        },
        null,
        2,
      ),
      JSON.stringify({
        hook_event_name: "SessionStart",
        source: "compact",
        session_id: "invalid session id",
      }),
    ]) {
      const output = runHookCli(cli, root, input);
      assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
      assert.match(output.hookSpecificOutput.additionalContext ?? "", /invalid/u);
      assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
    }

    const malformedJson = runHookCli(cli, root, '{"hook_event_name":"SessionStart"');
    assert.equal(malformedJson.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(malformedJson.hookSpecificOutput.permissionDecision, "deny");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runHookCli(
  cli: URL,
  root: string,
  input: string,
): {
  readonly hookSpecificOutput: {
    readonly hookEventName: string;
    readonly additionalContext?: string;
    readonly permissionDecision?: string;
  };
} {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(cli),
      "--root",
      root,
      "--binding",
      ".agent-context/missing-binding.json",
    ],
    { input, encoding: "utf8", shell: false, windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    readonly hookSpecificOutput: {
      readonly hookEventName: string;
      readonly additionalContext?: string;
      readonly permissionDecision?: string;
    };
  };
}

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
