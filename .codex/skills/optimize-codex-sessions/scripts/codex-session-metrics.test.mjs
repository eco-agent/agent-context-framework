import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeSessionFile } from "./codex-session-metrics.mjs";

test("separates transport, semantic, exit, output, and compaction metrics", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "codex-session-metrics-"),
  );
  const file = path.join(directory, "rollout.jsonl");
  const records = [
    record("session_meta", { session_id: "test-session" }, 0),
    record(
      "event_msg",
      {
        type: "task_started",
        turn_id: "turn-1",
        model_context_window: 100_000,
      },
      1,
    ),
    record(
      "response_item",
      {
        type: "function_call",
        name: "shell_command",
        call_id: "call-1",
        arguments: JSON.stringify({ command: "rg missing src" }),
      },
      2,
    ),
    record(
      "response_item",
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "Exit code: 1\nWall time: 0.1 seconds\nOutput:\n",
      },
      3,
    ),
    tokenRecord(10, 4),
    record("compacted", {}, 5),
    record(
      "response_item",
      {
        type: "function_call",
        name: "shell_command",
        call_id: "call-2",
        arguments: JSON.stringify({ command: "pnpm test" }),
      },
      6,
    ),
    record(
      "response_item",
      {
        type: "function_call_output",
        call_id: "call-2",
        output: `Exit code: 2\nWall time: 0.2 seconds\nOutput:\n${"x".repeat(12)}`,
      },
      7,
    ),
    record(
      "event_msg",
      { type: "agent_message", phase: "final_answer" },
      8,
    ),
    tokenRecord(25, 9, 15),
    record(
      "event_msg",
      {
        type: "task_complete",
        duration_ms: 8_000,
        error: { message: "stream disconnected before completion" },
      },
      10,
    ),
  ];

  try {
    await writeFile(
      file,
      `${records.map((item) => JSON.stringify(item)).join("\n")}\n`,
      "utf8",
    );
    const report = await analyzeSessionFile(file, {
      outputCeiling: 50,
      top: 10,
    });

    assert.equal(report.schemaVersion, 3);
    assert.equal(report.transportStatus, "disconnected");
    assert.equal(report.finalAnswerObserved, true);
    assert.equal(report.semanticOutcome, null);
    assert.deepEqual(report.totals.shellResults.exitCodes, { "1": 1, "2": 1 });
    assert.deepEqual(report.totals.shellResults.outcomes, {
      failed: 1,
      no_match: 1,
    });
    assert.equal(report.totals.shellResults.expectedSearchMisses, 1);
    assert.equal(report.totals.shellResults.nonzero, 2);
    assert.equal(report.totals.modelVisibleToolOutputCharacters.count, 2);
    assert.equal(report.totals.modelVisibleToolOutputCharacters.max, 56);
    assert.equal(
      report.totals.modelVisibleToolOutputCharacters.charactersSuppressedAtCeiling,
      6,
    );
    assert.equal(report.totals.modelRequests.count, 2);
    assert.equal(report.totals.modelRequests.inputTokens.total, 25);
    assert.equal(report.totals.modelRequests.inputTokens.first, 10);
    assert.equal(report.totals.modelRequests.inputTokens.final, 15);
    assert.equal(report.totals.modelRequests.inputTokens.growth, 5);
    assert.equal(report.totals.compactions, 1);
    assert.equal(report.compactionWindows[0].before.calls, 1);
    assert.equal(report.compactionWindows[0].after.calls, 1);
    assert.equal(
      report.compactionWindows[0].before.tokenDelta.totalTokens,
      10,
    );
    assert.equal(
      report.compactionWindows[0].after.tokenDelta.totalTokens,
      15,
    );
    assert.deepEqual(report.advisory.effects, {
      runtime_or_build: 1,
      search: 1,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("measures content blocks and nested MCP without double counting", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "codex-session-content-blocks-"),
  );
  const file = path.join(directory, "rollout.jsonl");
  const records = [
    record("event_msg", { type: "task_started", turn_id: "turn-1" }, 1),
    record(
      "response_item",
      {
        type: "custom_tool_call",
        name: "exec",
        call_id: "call-1",
        input: "text(await tools.mcp__repo_context__repo_context({}));",
      },
      2,
    ),
    record(
      "response_item",
      {
        type: "custom_tool_call_output",
        call_id: "call-1",
        output: [
          { type: "input_text", text: "alpha" },
          { type: "resource", resource: { text: "beta" } },
          { type: "image", data: "not-model-text" },
          { type: "future_block", payload: "ignored" },
        ],
      },
      3,
    ),
    record(
      "event_msg",
      {
        type: "mcp_tool_call_end",
        invocation: { server: "repo_context", tool: "repo_context" },
        duration: { secs: 0, nanos: 95_700_000 },
        result: { Ok: { content: [{ type: "text", text: "internal" }] } },
      },
      4,
    ),
    record("event_msg", { type: "task_complete" }, 5),
  ];

  try {
    await writeFile(
      file,
      `${records.map((item) => JSON.stringify(item)).join("\n")}\n`,
      "utf8",
    );
    const report = await analyzeSessionFile(file);

    assert.equal(report.totals.modelVisibleToolOutputCharacters.total, 9);
    assert.deepEqual(report.totals.modelOutputBlocks, {
      text: 2,
      nonText: 1,
      unknown: 1,
    });
    assert.equal(report.totals.nestedExecution.mcp.calls, 1);
    assert.equal(report.totals.nestedExecution.mcp.durationMs.total, 95.7);
    assert.deepEqual(report.totals.nestedExecution.mcp.outcomes, {
      success: 1,
    });
    assert.deepEqual(report.totals.nestedExecution.mcp.tools, {
      "repo_context/repo_context": 1,
    });
    assert.equal(JSON.stringify(report).includes("internal"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not retain command arguments or output text in the report", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "codex-session-privacy-"),
  );
  const file = path.join(directory, "rollout.jsonl");
  const secret = "do-not-retain-this-secret";
  const records = [
    record(
      "event_msg",
      { type: "task_started", turn_id: "turn-1" },
      1,
    ),
    record(
      "response_item",
      {
        type: "function_call",
        name: "shell_command",
        call_id: "call-1",
        arguments: JSON.stringify({ command: `Get-Content ${secret}` }),
      },
      2,
    ),
    record(
      "response_item",
      {
        type: "function_call_output",
        call_id: "call-1",
        output: `Exit code: 0\nOutput:\n${secret}`,
      },
      3,
    ),
    record("event_msg", { type: "task_complete" }, 4),
  ];

  try {
    await writeFile(
      file,
      `${records.map((item) => JSON.stringify(item)).join("\n")}\n`,
      "utf8",
    );
    const serialized = JSON.stringify(await analyzeSessionFile(file));
    assert.equal(serialized.includes(secret), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function tokenRecord(totalTokens, seconds, lastTokens = totalTokens) {
  return record(
    "event_msg",
    {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: totalTokens,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: totalTokens,
        },
        last_token_usage: {
          input_tokens: lastTokens,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: lastTokens,
        },
      },
    },
    seconds,
  );
}

function record(type, payload, seconds) {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
    type,
    payload,
  };
}
