import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CODEX_SESSION_BINDING_DIRECTORY,
  decodeHookInput,
  decodeScopedSessionBinding,
  evaluateHook,
} from "../src/index.js";

const binding = decodeScopedSessionBinding({
  schemaVersion: 1,
  sessionId: "session-1",
  expiresAtEpochMs: 4_102_444_800_000,
  writablePaths: ["src/**", "README.md"],
  sources: [],
  compactContext: "Continue within the recorded scope.",
});

test("Codex hook is inert without a session binding and enforces valid session state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-codex-hook-"));
  const cli = new URL("../src/codex-cli.js", import.meta.url);
  const bindingDirectory = path.join(root, ...CODEX_SESSION_BINDING_DIRECTORY.split("/"));
  const bindingPath = path.join(bindingDirectory, "session-1.json");
  const patchInput = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    session_id: "session-1",
    tool_input: { command: "*** Update File: src/index.ts" },
  });
  const compactInput = JSON.stringify({
    hook_event_name: "SessionStart",
    source: "compact",
    session_id: "session-1",
  });
  try {
    assert.equal(runCodexHookCli(cli, root, patchInput), "");
    assert.equal(runCodexHookCli(cli, root, compactInput), "");

    await mkdir(bindingDirectory, { recursive: true });
    await writeFile(bindingPath, `${JSON.stringify(binding)}\n`, "utf8");
    const allowed = parseHookOutput(runCodexHookCli(cli, root, patchInput));
    assert.equal(allowed.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
    const context = parseHookOutput(runCodexHookCli(cli, root, compactInput));
    assert.equal(context.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(context.hookSpecificOutput.additionalContext, "Continue within the recorded scope.");

    await writeFile(bindingPath, `${JSON.stringify({ ...binding, expiresAtEpochMs: 1 })}\n`, "utf8");
    const stale = parseHookOutput(runCodexHookCli(cli, root, patchInput));
    assert.equal(stale.hookSpecificOutput.permissionDecision, "deny");
    assert.match(stale.hookSpecificOutput.permissionDecisionReason ?? "", /stale/u);

    await writeFile(bindingPath, `${JSON.stringify({ ...binding, sessionId: "other-session" })}\n`, "utf8");
    const mismatched = parseHookOutput(runCodexHookCli(cli, root, patchInput));
    assert.equal(mismatched.hookSpecificOutput.permissionDecision, "deny");
    assert.match(mismatched.hookSpecificOutput.permissionDecisionReason ?? "", /does not match/u);

    await writeFile(bindingPath, "{\"schemaVersion\":1", "utf8");
    const malformed = parseHookOutput(runCodexHookCli(cli, root, patchInput));
    assert.equal(malformed.hookSpecificOutput.permissionDecision, "deny");
    const invalidJson = parseHookOutput(runCodexHookCli(cli, root, "{"));
    assert.equal(invalidJson.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(invalidJson.hookSpecificOutput.permissionDecision, "deny");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

function runCodexHookCli(cli: URL, root: string, input: string): string {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(cli), "--root", root],
    { input, encoding: "utf8", shell: false, windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function parseHookOutput(source: string): {
  readonly hookSpecificOutput: {
    readonly hookEventName: string;
    readonly additionalContext?: string;
    readonly permissionDecision?: string;
    readonly permissionDecisionReason?: string;
  };
} {
  return JSON.parse(source) as {
    readonly hookSpecificOutput: {
      readonly hookEventName: string;
      readonly additionalContext?: string;
      readonly permissionDecision?: string;
      readonly permissionDecisionReason?: string;
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
