#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const DEFAULT_OUTPUT_CEILING = 10_000;
const OUTPUT_THRESHOLDS = [5_000, 10_000, 40_000];
const SHELL_TOOL_NAMES = new Set(["shell_command", "exec_command"]);
const KNOWN_COMMANDS = [
  "Add-Content",
  "Copy-Item",
  "Get-ChildItem",
  "Get-Content",
  "Get-Item",
  "Get-Location",
  "Invoke-WebRequest",
  "Move-Item",
  "New-Item",
  "Remove-Item",
  "Resolve-Path",
  "Select-String",
  "Set-Content",
  "Start-Process",
  "Stop-Process",
  "Test-Path",
  "Wait-Process",
  "curl",
  "git",
  "node",
  "npm",
  "npx",
  "pnpm",
  "rg",
  "tsx",
];

if (isMainModule(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const sessionFile =
    options.file === undefined
      ? await findSessionFile(options.session, options.codexHome)
      : path.resolve(options.file);
  const report = await analyzeSessionFile(sessionFile, options);
  process.stdout.write(`${JSON.stringify(report, undefined, 2)}\n`);
}

export async function analyzeSessionFile(
  sessionFile,
  {
    codexHome = path.join(os.homedir(), ".codex"),
    includeChildren = false,
    outputCeiling = DEFAULT_OUTPUT_CEILING,
    session,
    top = 12,
  } = {},
) {
  const turns = [];
  const pendingCalls = new Map();
  const requestedAgents = new Map();
  let currentTurn;
  let recordCount = 0;
  let sessionId = session;
  let threadId = session;
  let previousCompleteUsage = zeroUsage();
  let lastSessionUsage = zeroUsage();

  const lines = readline.createInterface({
    input: createReadStream(sessionFile, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    recordCount += 1;
    const record = JSON.parse(line);
    const payload = isRecord(record.payload) ? record.payload : {};

    if (record.type === "session_meta" && typeof payload.session_id === "string") {
      sessionId = payload.session_id;
      threadId = stringOrNull(payload.id) ?? payload.session_id;
    }

    if (record.type === "event_msg" && payload.type === "task_started") {
      currentTurn = makeTurn(payload, turns.length + 1, record.timestamp);
      turns.push(currentTurn);
      continue;
    }

    if (currentTurn === undefined) {
      continue;
    }

    if (
      record.type === "response_item" &&
      (payload.type === "function_call" ||
        payload.type === "custom_tool_call")
    ) {
      const callId = stringOrNull(payload.call_id) ?? stringOrNull(payload.id);
      const toolName = normalizeName(payload.name);
      if (toolName === "spawn_agent") {
        const argumentsValue = parseArgumentsJson(payload.arguments);
        increment(
          requestedAgents,
          stringOrNull(argumentsValue?.agent_type) ?? "default",
        );
      }
      addToolCall(currentTurn, toolName);
      if (callId !== null) {
        const commandSummary = summarizeCommandCall(toolName, payload.arguments);
        pendingCalls.set(callId, { toolName, commandSummary });
        addAdvisorySummary(currentTurn, commandSummary);
      }
    } else if (
      record.type === "response_item" &&
      (payload.type === "function_call_output" ||
        payload.type === "custom_tool_call_output")
    ) {
      const callId = stringOrNull(payload.call_id) ?? stringOrNull(payload.id);
      const pending = callId === null ? undefined : pendingCalls.get(callId);
      if (callId !== null) {
        pendingCalls.delete(callId);
      }
      addToolOutput(
        currentTurn,
        pending,
        decodeModelVisibleOutput(payload.output),
        outputCeiling,
      );
    } else if (record.type === "response_item" && payload.type === "reasoning") {
      currentTurn.reasoningItems += 1;
    } else if (
      record.type === "event_msg" &&
      payload.type === "agent_reasoning"
    ) {
      currentTurn.reasoningEvents += 1;
    } else if (
      record.type === "event_msg" &&
      payload.type === "agent_message"
    ) {
      if (payload.phase === "commentary") {
        currentTurn.commentaryMessages += 1;
      } else if (payload.phase === "final_answer") {
        currentTurn.finalMessages += 1;
      }
    } else if (
      record.type === "event_msg" &&
      payload.type === "user_message"
    ) {
      currentTurn.userMessages += 1;
    } else if (
      record.type === "event_msg" &&
      payload.type === "patch_apply_end"
    ) {
      currentTurn.patchApplications += 1;
      if (payload.success === true) {
        currentTurn.successfulPatchApplications += 1;
      } else {
        currentTurn.failedPatchApplications += 1;
      }
      if (isRecord(payload.changes)) {
        currentTurn.patchFileEvents += Object.keys(payload.changes).length;
      }
    } else if (record.type === "compacted") {
      currentTurn.compactionSnapshots.push(snapshot(currentTurn, record.timestamp));
    } else if (
      record.type === "event_msg" &&
      payload.type === "token_count" &&
      isRecord(payload.info)
    ) {
      const usage = normalizeUsage(payload.info.total_token_usage);
      currentTurn.lastCumulativeUsage = usage;
      lastSessionUsage = usage;
      const requestUsage = normalizeUsage(payload.info.last_token_usage);
      if (
        requestUsage.totalTokens > 0 &&
        !sameUsage(currentTurn.modelRequests.at(-1), requestUsage)
      ) {
        currentTurn.modelRequests.push(requestUsage);
      }
    } else if (
      record.type === "event_msg" &&
      payload.type === "mcp_tool_call_end"
    ) {
      currentTurn.nestedMcpCalls.push(decodeNestedMcpCall(payload));
    } else if (
      record.type === "event_msg" &&
      payload.type === "task_complete"
    ) {
      currentTurn.transportStatus = classifyTransportStatus(payload.error);
      currentTurn.durationMs = numberOrNull(payload.duration_ms);
      currentTurn.timeToFirstTokenMs = numberOrNull(
        payload.time_to_first_token_ms,
      );
      currentTurn.tokenUsage = subtractUsage(
        currentTurn.lastCumulativeUsage,
        previousCompleteUsage,
      );
      currentTurn.endTimestamp = timestampOrNull(record.timestamp);
      currentTurn.compactionWindows = buildCompactionWindows(
        currentTurn,
        previousCompleteUsage,
      );
      previousCompleteUsage = currentTurn.lastCumulativeUsage;
      currentTurn = undefined;
    }
  }

  const outputSizes = turns.flatMap((turn) => turn.outputSizes);
  const modelRequests = turns.flatMap((turn) => turn.modelRequests);
  const nestedMcpCalls = turns.flatMap((turn) => turn.nestedMcpCalls);
  const shellResults = combineShellResults(turns);
  const compactionWindows = turns.flatMap((turn) =>
    turn.compactionWindows.map((window) => ({
      turnIndex: turn.index,
      ...window,
    })),
  );
  const spawns =
    includeChildren && threadId !== undefined
      ? await summarizeChildRouting(
          threadId,
          codexHome,
          requestedAgents,
        )
      : null;

  return {
    schemaVersion: 3,
    sessionId,
    sessionFile: path.resolve(sessionFile),
    records: recordCount,
    ...(spawns === null ? {} : { spawns }),
    transportStatus: aggregateTransportStatus(turns),
    finalAnswerObserved: turns.some((turn) => turn.finalMessages > 0),
    semanticOutcome: null,
    totals: {
      turns: turns.length,
      durationMs: sum(turns.map((turn) => turn.durationMs)),
      tokenUsage: lastSessionUsage,
      modelRequests: summarizeModelRequests(modelRequests),
      toolCalls: sum(turns.map((turn) => turn.toolCalls)),
      toolOutputs: outputSizes.length,
      modelVisibleToolOutputCharacters: outputDistribution(
        outputSizes,
        outputCeiling,
      ),
      modelOutputBlocks: combineModelOutputBlocks(turns),
      nestedExecution: {
        mcp: summarizeNestedMcpCalls(nestedMcpCalls, outputCeiling, top),
      },
      shellResults,
      patchApplications: sum(turns.map((turn) => turn.patchApplications)),
      patchFileEvents: sum(turns.map((turn) => turn.patchFileEvents)),
      compactions: compactionWindows.length,
    },
    compactionWindows,
    advisory: {
      commandNames: combineMaps(turns.map((turn) => turn.commandNames), top),
      effects: combineMaps(turns.map((turn) => turn.effects), top),
    },
    turns: turns.map((turn) => ({
      index: turn.index,
      turnId: turn.turnId,
      transportStatus: turn.transportStatus,
      finalAnswerObserved: turn.finalMessages > 0,
      semanticOutcome: null,
      durationMs: turn.durationMs,
      timeToFirstTokenMs: turn.timeToFirstTokenMs,
      modelContextWindow: turn.modelContextWindow,
      tokenUsage: turn.tokenUsage,
      modelRequests: summarizeModelRequests(turn.modelRequests),
      inputCacheRatio:
        turn.tokenUsage.inputTokens === 0
          ? null
          : Number(
              (
                turn.tokenUsage.cachedInputTokens /
                turn.tokenUsage.inputTokens
              ).toFixed(3),
            ),
      userMessages: turn.userMessages,
      commentaryMessages: turn.commentaryMessages,
      finalMessages: turn.finalMessages,
      reasoningItems: turn.reasoningItems,
      reasoningEvents: turn.reasoningEvents,
      toolCalls: turn.toolCalls,
      toolOutputs: turn.outputSizes.length,
      modelVisibleToolOutputCharacters: outputDistribution(
        turn.outputSizes,
        outputCeiling,
      ),
      modelOutputBlocks: turn.modelOutputBlocks,
      nestedExecution: {
        mcp: summarizeNestedMcpCalls(
          turn.nestedMcpCalls,
          outputCeiling,
          top,
        ),
      },
      tools: sortedMap(turn.tools, top),
      shellResults: summarizeShellResults(turn.shellResults),
      advisory: {
        commandNames: sortedMap(turn.commandNames, top),
        effects: sortedMap(turn.effects, top),
      },
      patchApplications: turn.patchApplications,
      successfulPatchApplications: turn.successfulPatchApplications,
      failedPatchApplications: turn.failedPatchApplications,
      patchFileEvents: turn.patchFileEvents,
      compactionWindows: turn.compactionWindows,
    })),
    limitations: [
      "Transport status describes the Codex stream only; semanticOutcome is intentionally null pending repository-backed review.",
      "Expected-search misses are advisory classifications. Exact parsed shell exit codes remain available separately.",
      "Model-visible character counts flatten textual response content blocks and exclude image, audio, binary resource, and unknown block payloads.",
      "Provider-request counts require last_token_usage records; older rollouts without them report zero requests.",
      "Nested MCP result sizes describe lifecycle evidence and are not added to model-visible output totals.",
      "Command names and effects are advisory summaries extracted without retaining prompts, arguments, output text, secrets, reasoning, or file content.",
    ],
  };
}

function parseArguments(args) {
  const result = {
    codexHome: process.env.CODEX_HOME
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), ".codex"),
    outputCeiling: DEFAULT_OUTPUT_CEILING,
    top: 12,
    includeChildren: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "Usage: codex-session-metrics.mjs (--session <id> | --file <jsonl>) [options]",
          "",
          "Options:",
          "  --session <id>          Codex session/task ID",
          "  --file <jsonl>          Exact rollout JSONL file",
          "  --codex-home <path>     Codex home containing sessions/",
          "  --output-ceiling <n>    Comparison ceiling in characters (default: 10000)",
          "  --top <count>           Maximum advisory names per map (default: 12)",
          "  --include-children      Summarize requested and persisted child routing",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (argument === "--include-children") {
      result.includeChildren = true;
      continue;
    }
    if (
      ![
        "--session",
        "--file",
        "--codex-home",
        "--output-ceiling",
        "--top",
      ].includes(argument)
    ) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (argument === "--session") {
      result.session = value;
    } else if (argument === "--file") {
      result.file = value;
    } else if (argument === "--codex-home") {
      result.codexHome = path.resolve(value);
    } else if (argument === "--output-ceiling") {
      result.outputCeiling = Number(value);
    } else {
      result.top = Number(value);
    }
  }

  if ((result.session === undefined) === (result.file === undefined)) {
    throw new Error("Provide exactly one of --session or --file.");
  }
  if (!isPositiveInteger(result.top, 100)) {
    throw new Error("--top must be an integer from 1 through 100.");
  }
  if (!isPositiveInteger(result.outputCeiling, 10_000_000)) {
    throw new Error(
      "--output-ceiling must be an integer from 1 through 10000000.",
    );
  }
  return result;
}

export async function findSessionFile(id, codexHome) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(id)
  ) {
    throw new Error("The session ID is invalid.");
  }
  const root = path.join(codexHome, "sessions");
  const matches = [];
  await walk(root, matches, id);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one local session file for ${id}; found ${matches.length}.`,
    );
  }
  return matches[0];
}

export async function inspectAgentThread(threadId, codexHome) {
  const sessionFile = await findSessionFile(threadId, codexHome);
  const inspection = await inspectSessionFile(sessionFile);
  return {
    agentType: inspection.agentType,
    model: inspection.model,
    effort: inspection.effort,
    parentThreadId: inspection.parentThreadId,
    sandbox: inspection.sandbox,
  };
}

async function summarizeChildRouting(
  parentThreadId,
  codexHome,
  requestedAgents,
) {
  const sessionFiles = [];
  await collectSessionFiles(path.join(codexHome, "sessions"), sessionFiles);
  const children = [];
  for (const sessionFile of sessionFiles) {
    const metadata = await readFirstRecord(sessionFile);
    if (
      metadata?.type === "session_meta" &&
      isRecord(metadata.payload) &&
      metadata.payload.parent_thread_id === parentThreadId
    ) {
      children.push(await inspectSessionFile(sessionFile));
    }
  }
  const persisted = new Map();
  for (const child of children) {
    increment(
      persisted,
      `${child.model ?? "unknown"}/${child.effort ?? "unknown"}`,
    );
  }
  const requestedCount = sum([...requestedAgents.values()]);
  return {
    requested: requestedAgentCounts(requestedAgents),
    persisted: sortedMap(persisted),
    missing: Math.max(0, requestedCount - children.length),
  };
}

function requestedAgentCounts(requestedAgents) {
  const named = new Set(["default", "worker", "scout"]);
  return {
    default: requestedAgents.get("default") ?? 0,
    worker: requestedAgents.get("worker") ?? 0,
    scout: requestedAgents.get("scout") ?? 0,
    ...Object.fromEntries(
      [...requestedAgents.entries()]
        .filter(([name]) => !named.has(name))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

async function collectSessionFiles(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSessionFiles(candidate, files);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(candidate);
    }
  }
}

async function readFirstRecord(sessionFile) {
  const input = createReadStream(sessionFile, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim().length > 0) {
      lines.close();
      input.destroy();
      return JSON.parse(line);
    }
  }
  return null;
}

async function inspectSessionFile(sessionFile) {
  let agentType = null;
  let model = null;
  let effort = null;
  let parentThreadId = null;
  let sandbox = null;
  const input = createReadStream(sessionFile, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const record = JSON.parse(line);
    const payload = isRecord(record.payload) ? record.payload : {};
    if (record.type === "session_meta") {
      agentType = stringOrNull(payload.agent_role);
      parentThreadId = stringOrNull(payload.parent_thread_id);
    } else if (record.type === "turn_context") {
      model = stringOrNull(payload.model);
      effort = stringOrNull(payload.effort);
      sandbox = isRecord(payload.sandbox_policy)
        ? stringOrNull(payload.sandbox_policy.type)
        : null;
      break;
    }
  }
  lines.close();
  input.destroy();
  return { agentType, model, effort, parentThreadId, sandbox };
}

function parseArgumentsJson(value) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function walk(directory, matches, id) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(candidate, matches, id);
    } else if (
      entry.isFile() &&
      entry.name.includes(id) &&
      entry.name.endsWith(".jsonl")
    ) {
      matches.push(candidate);
    }
  }
}

function makeTurn(payload, index, timestamp) {
  return {
    index,
    turnId:
      typeof payload.turn_id === "string" ? payload.turn_id : `turn-${index}`,
    transportStatus: "unknown",
    startTimestamp: timestampOrNull(timestamp),
    endTimestamp: null,
    durationMs: null,
    timeToFirstTokenMs: null,
    modelContextWindow: numberOrNull(payload.model_context_window),
    lastCumulativeUsage: zeroUsage(),
    tokenUsage: zeroUsage(),
    modelRequests: [],
    userMessages: 0,
    commentaryMessages: 0,
    finalMessages: 0,
    reasoningItems: 0,
    reasoningEvents: 0,
    toolCalls: 0,
    outputSizes: [],
    modelOutputBlocks: {
      text: 0,
      nonText: 0,
      unknown: 0,
    },
    nestedMcpCalls: [],
    tools: new Map(),
    commandNames: new Map(),
    effects: new Map(),
    shellResults: [],
    patchApplications: 0,
    successfulPatchApplications: 0,
    failedPatchApplications: 0,
    patchFileEvents: 0,
    compactionSnapshots: [],
    compactionWindows: [],
  };
}

function addToolCall(turn, name) {
  turn.toolCalls += 1;
  increment(turn.tools, name);
}

function addToolOutput(turn, pending, decoded, outputCeiling) {
  turn.outputSizes.push(decoded.text.length);
  turn.modelOutputBlocks.text += decoded.blocks.text;
  turn.modelOutputBlocks.nonText += decoded.blocks.nonText;
  turn.modelOutputBlocks.unknown += decoded.blocks.unknown;
  if (pending === undefined || !SHELL_TOOL_NAMES.has(pending.toolName)) {
    return;
  }

  const exitCode = parseExitCode(decoded.text);
  const expectedSearchMiss =
    exitCode === 1 && pending.commandSummary?.searchOnly === true;
  const outcome =
    exitCode === null
      ? "unknown"
      : exitCode === 0
        ? "success"
        : expectedSearchMiss
          ? "no_match"
          : exitCode === 124 || /\b(?:timed out|timeout)\b/iu.test(decoded.text)
            ? "timeout"
            : "failed";

  turn.shellResults.push({
    tool: pending.toolName,
    exitCode,
    outcome,
    expectedSearchMiss,
    outputCharacters: decoded.text.length,
    charactersAboveCeiling: Math.max(0, decoded.text.length - outputCeiling),
  });
}

function summarizeCommandCall(toolName, rawArguments) {
  if (!SHELL_TOOL_NAMES.has(toolName)) {
    return null;
  }
  let parsed;
  try {
    parsed =
      typeof rawArguments === "string"
        ? JSON.parse(rawArguments)
        : rawArguments;
  } catch {
    return { commandNames: ["unknown"], effects: ["unknown"], searchOnly: false };
  }
  const command =
    isRecord(parsed) && typeof parsed.command === "string"
      ? parsed.command
      : "";
  const commandNames = KNOWN_COMMANDS.filter((name) =>
    new RegExp(`(?:^|[^\\w-])${escapeRegExp(name)}(?:$|[^\\w-])`, "imu").test(
      command,
    ),
  );
  const normalizedNames =
    commandNames.length === 0 ? ["unknown"] : commandNames;
  const effects = [...new Set(normalizedNames.map(classifyEffect))].sort();
  const nonSearchNames = normalizedNames.filter(
    (name) => !["rg", "Select-String", "Test-Path"].includes(name),
  );
  return {
    commandNames: normalizedNames,
    effects,
    searchOnly:
      commandNames.length > 0 &&
      commandNames.some((name) => ["rg", "Select-String"].includes(name)) &&
      nonSearchNames.length === 0,
  };
}

function classifyEffect(commandName) {
  if (["rg", "Select-String", "Test-Path"].includes(commandName)) {
    return "search";
  }
  if (
    [
      "Get-ChildItem",
      "Get-Content",
      "Get-Item",
      "Get-Location",
      "Resolve-Path",
    ].includes(commandName)
  ) {
    return "read";
  }
  if (
    [
      "Add-Content",
      "Copy-Item",
      "Move-Item",
      "New-Item",
      "Remove-Item",
      "Set-Content",
    ].includes(commandName)
  ) {
    return "filesystem_write";
  }
  if (commandName === "git") {
    return "version_control";
  }
  if (["pnpm", "npm", "npx", "node", "tsx"].includes(commandName)) {
    return "runtime_or_build";
  }
  if (["Start-Process", "Stop-Process", "Wait-Process"].includes(commandName)) {
    return "process_control";
  }
  if (["curl", "Invoke-WebRequest"].includes(commandName)) {
    return "network";
  }
  return "unknown";
}

function addAdvisorySummary(turn, summary) {
  if (summary === null) {
    return;
  }
  for (const commandName of summary.commandNames) {
    increment(turn.commandNames, commandName);
  }
  for (const effect of summary.effects) {
    increment(turn.effects, effect);
  }
}

function snapshot(turn, timestamp) {
  return {
    timestamp: timestampOrNull(timestamp),
    cumulativeUsage: turn.lastCumulativeUsage,
    calls: turn.toolCalls,
    outputCharacters: sum(turn.outputSizes),
  };
}

function buildCompactionWindows(turn, turnBaselineUsage) {
  return turn.compactionSnapshots.map((compaction, index) => {
    const previous =
      index === 0
        ? {
            timestamp: turn.startTimestamp,
            cumulativeUsage: turnBaselineUsage,
            calls: 0,
            outputCharacters: 0,
          }
        : turn.compactionSnapshots[index - 1];
    const next =
      index === turn.compactionSnapshots.length - 1
        ? {
            timestamp: turn.endTimestamp,
            cumulativeUsage: turn.lastCumulativeUsage,
            calls: turn.toolCalls,
            outputCharacters: sum(turn.outputSizes),
          }
        : turn.compactionSnapshots[index + 1];
    return {
      ordinal: index + 1,
      before: windowDelta(previous, compaction),
      after: windowDelta(compaction, next),
    };
  });
}

function windowDelta(start, end) {
  return {
    tokenDelta: subtractUsage(end.cumulativeUsage, start.cumulativeUsage),
    calls: Math.max(0, end.calls - start.calls),
    outputCharacters: Math.max(
      0,
      end.outputCharacters - start.outputCharacters,
    ),
    durationMs: durationBetween(start.timestamp, end.timestamp),
  };
}

function classifyTransportStatus(error) {
  if (error === undefined || error === null) {
    return "completed";
  }
  const text = inspectText(error);
  if (
    /\b(?:disconnect(?:ed|ion)?|connection (?:closed|lost|reset))\b/iu.test(
      text,
    )
  ) {
    return "disconnected";
  }
  if (/\b(?:cancelled|canceled|aborted)\b/iu.test(text)) {
    return "cancelled";
  }
  return "unknown";
}

function aggregateTransportStatus(turns) {
  const statuses = new Set(turns.map((turn) => turn.transportStatus));
  if (statuses.has("cancelled")) {
    return "cancelled";
  }
  if (statuses.has("disconnected")) {
    return "disconnected";
  }
  if (statuses.has("unknown")) {
    return "unknown";
  }
  return "completed";
}

function parseExitCode(text) {
  const match = /^Exit code:\s*(-?\d+)\s*$/imu.exec(text);
  return match === null ? null : Number(match[1]);
}

function outputDistribution(sizes, ceiling) {
  return {
    count: sizes.length,
    total: sum(sizes),
    max: sizes.length === 0 ? 0 : Math.max(...sizes),
    p50: percentile(sizes, 0.5),
    p90: percentile(sizes, 0.9),
    above5K: sizes.filter((size) => size > OUTPUT_THRESHOLDS[0]).length,
    above10K: sizes.filter((size) => size > OUTPUT_THRESHOLDS[1]).length,
    above40K: sizes.filter((size) => size > OUTPUT_THRESHOLDS[2]).length,
    comparisonCeiling: ceiling,
    charactersSuppressedAtCeiling: sum(
      sizes.map((size) => Math.max(0, size - ceiling)),
    ),
  };
}

function summarizeModelRequests(requests) {
  const inputTokens = requests.map((usage) => usage.inputTokens);
  const cachedInputTokens = sum(
    requests.map((usage) => usage.cachedInputTokens),
  );
  const totalInputTokens = sum(inputTokens);
  return {
    count: requests.length,
    inputTokens: {
      total: totalInputTokens,
      first: inputTokens[0] ?? null,
      peak: inputTokens.length === 0 ? null : Math.max(...inputTokens),
      final: inputTokens.at(-1) ?? null,
      p50: inputTokens.length === 0 ? null : percentile(inputTokens, 0.5),
      p90: inputTokens.length === 0 ? null : percentile(inputTokens, 0.9),
      growth:
        inputTokens.length === 0
          ? null
          : inputTokens.at(-1) - inputTokens[0],
    },
    cachedInputTokens,
    uncachedInputTokens: Math.max(0, totalInputTokens - cachedInputTokens),
    cacheRatio:
      totalInputTokens === 0
        ? null
        : Number((cachedInputTokens / totalInputTokens).toFixed(3)),
    outputTokens: sum(requests.map((usage) => usage.outputTokens)),
    reasoningOutputTokens: sum(
      requests.map((usage) => usage.reasoningOutputTokens),
    ),
  };
}

function summarizeNestedMcpCalls(calls, outputCeiling, top) {
  const outcomes = new Map();
  const tools = new Map();
  for (const call of calls) {
    increment(outcomes, call.outcome);
    increment(tools, `${call.server}/${call.tool}`);
  }
  return {
    calls: calls.length,
    durationMs: numericDistribution(calls.map((call) => call.durationMs)),
    resultCharacters: outputDistribution(
      calls.map((call) => call.resultCharacters),
      outputCeiling,
    ),
    outcomes: sortedMap(outcomes),
    tools: sortedMap(tools, top),
  };
}

function numericDistribution(values) {
  return {
    total: sum(values),
    max: values.length === 0 ? 0 : Math.max(...values),
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
  };
}

function combineModelOutputBlocks(turns) {
  return {
    text: sum(turns.map((turn) => turn.modelOutputBlocks.text)),
    nonText: sum(turns.map((turn) => turn.modelOutputBlocks.nonText)),
    unknown: sum(turns.map((turn) => turn.modelOutputBlocks.unknown)),
  };
}

function decodeNestedMcpCall(payload) {
  const invocation = isRecord(payload.invocation) ? payload.invocation : {};
  const duration = isRecord(payload.duration) ? payload.duration : {};
  const result = isRecord(payload.result) ? payload.result : {};
  return {
    server: normalizeName(invocation.server),
    tool: normalizeName(invocation.tool),
    durationMs:
      numberOrZero(duration.secs) * 1_000 +
      numberOrZero(duration.nanos) / 1_000_000,
    outcome: Object.hasOwn(result, "Ok")
      ? "success"
      : Object.hasOwn(result, "Err")
        ? "failed"
        : "unknown",
    resultCharacters: serializedLength(payload.result),
  };
}

function summarizeShellResults(results) {
  const exitCodes = new Map();
  const outcomes = new Map();
  const tools = new Map();
  for (const result of results) {
    increment(exitCodes, result.exitCode === null ? "unknown" : `${result.exitCode}`);
    increment(outcomes, result.outcome);
    const tool = tools.get(result.tool) ?? {
      results: 0,
      exitCodes: new Map(),
      outcomes: new Map(),
    };
    tool.results += 1;
    increment(
      tool.exitCodes,
      result.exitCode === null ? "unknown" : `${result.exitCode}`,
    );
    increment(tool.outcomes, result.outcome);
    tools.set(result.tool, tool);
  }
  return {
    results: results.length,
    nonzero: results.filter(
      (result) => result.exitCode !== null && result.exitCode !== 0,
    ).length,
    expectedSearchMisses: results.filter(
      (result) => result.expectedSearchMiss,
    ).length,
    exitCodes: sortedMap(exitCodes),
    outcomes: sortedMap(outcomes),
    tools: Object.fromEntries(
      [...tools.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => [
          name,
          {
            results: value.results,
            exitCodes: sortedMap(value.exitCodes),
            outcomes: sortedMap(value.outcomes),
          },
        ]),
    ),
  };
}

function combineShellResults(turns) {
  return summarizeShellResults(turns.flatMap((turn) => turn.shellResults));
}

function combineMaps(maps, limit) {
  const combined = new Map();
  for (const map of maps) {
    for (const [key, value] of map) {
      increment(combined, key, value);
    }
  }
  return sortedMap(combined, limit);
}

function sortedMap(map, limit = Number.POSITIVE_INFINITY) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(
        ([leftName, leftCount], [rightName, rightCount]) =>
          rightCount - leftCount || leftName.localeCompare(rightName),
      )
      .slice(0, limit),
  );
}

function normalizeUsage(value) {
  if (!isRecord(value)) {
    return zeroUsage();
  }
  return {
    inputTokens: numberOrZero(value.input_tokens),
    cachedInputTokens: numberOrZero(value.cached_input_tokens),
    cacheWriteInputTokens: numberOrZero(value.cache_write_input_tokens),
    outputTokens: numberOrZero(value.output_tokens),
    reasoningOutputTokens: numberOrZero(value.reasoning_output_tokens),
    totalTokens: numberOrZero(value.total_tokens),
  };
}

function subtractUsage(current, previous) {
  const result = {};
  for (const key of Object.keys(current)) {
    result[key] =
      current[key] >= previous[key] ? current[key] - previous[key] : current[key];
  }
  return result;
}

function sameUsage(left, right) {
  if (left === undefined) {
    return false;
  }
  return Object.keys(right).every((key) => left[key] === right[key]);
}

function zeroUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function decodeModelVisibleOutput(value) {
  const blocks = { text: 0, nonText: 0, unknown: 0 };
  const text = collectModelVisibleText(value, blocks);
  return { text, blocks };
}

function collectModelVisibleText(value, blocks) {
  if (typeof value === "string") {
    blocks.text += 1;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => collectModelVisibleText(item, blocks)).join("");
  }
  if (!isRecord(value)) {
    if (value !== undefined && value !== null) {
      blocks.unknown += 1;
    }
    return "";
  }
  if (
    ["input_text", "output_text", "text"].includes(value.type) &&
    typeof value.text === "string"
  ) {
    blocks.text += 1;
    return value.text;
  }
  if (
    value.type === "resource" &&
    isRecord(value.resource) &&
    typeof value.resource.text === "string"
  ) {
    blocks.text += 1;
    return value.resource.text;
  }
  if (Array.isArray(value.content)) {
    return collectModelVisibleText(value.content, blocks);
  }
  if (["image", "audio", "resource"].includes(value.type)) {
    blocks.nonText += 1;
  } else {
    blocks.unknown += 1;
  }
  return "";
}

function inspectText(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function serializedLength(value) {
  try {
    return JSON.stringify(value ?? "").length;
  } catch {
    return 0;
  }
}

function percentile(values, quantile) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

function durationBetween(start, end) {
  if (start === null || end === null) {
    return null;
  }
  return Math.max(0, end - start);
}

function timestampOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function normalizeName(value) {
  return typeof value === "string" ? value : "unknown";
}

function increment(map, key, count = 1) {
  map.set(key, (map.get(key) ?? 0) + count);
}

function sum(values) {
  return values.reduce(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
}

function isPositiveInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMainModule(url) {
  return process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === url;
}
