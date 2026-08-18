#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  decodeActiveTaskBinding,
  type ActiveTaskBinding,
} from "@agent-context/repo-policy";

interface HookInput {
  readonly hook_event_name?: unknown;
  readonly cwd?: unknown;
  readonly session_id?: unknown;
  readonly source?: unknown;
  readonly tool_name?: unknown;
  readonly tool_input?: unknown;
}

interface BoundTask {
  readonly root: string;
  readonly binding: ActiveTaskBinding;
  readonly writablePaths: readonly string[];
}

const input = readHookInput();

if (
  input.hook_event_name === "PreToolUse" &&
  input.tool_name === "apply_patch" &&
  isRecord(input.tool_input) &&
  typeof input.tool_input.command === "string"
) {
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const sessionId =
    typeof input.session_id === "string" ? input.session_id : null;
  try {
    const task = sessionId === null ? null : loadBoundTask(cwd, sessionId);
    if (task !== null) {
      const outsideScope = extractPatchPaths(input.tool_input.command).find(
        (candidate) =>
          !task.writablePaths.some((pattern) =>
            matchesWritablePath(candidate, pattern),
          ),
      );
      if (outsideScope !== undefined) {
        deny(`${outsideScope} is outside the active task's writable paths.`);
      }
    }
  } catch {
    deny("Active task binding is invalid; patching is disabled.");
  }
}

if (
  input.hook_event_name === "SessionStart" &&
  input.source === "compact" &&
  typeof input.session_id === "string"
) {
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  try {
    const task = loadBoundTask(cwd, input.session_id);
    if (task !== null) {
      sessionContext(
        `Objective: ${task.binding.objectiveId}\nContract: ${task.binding.contractPath}\nCapability: ${task.binding.requestPath}\nEnvelope: ${task.binding.envelopeArtifact.hash}`,
      );
    }
  } catch {
    sessionContext("Active task binding is invalid; execution is fail-closed.");
  }
}

function readHookInput(): HookInput {
  try {
    const value = readFileSync(0, "utf8");
    return JSON.parse(value) as HookInput;
  } catch {
    return {};
  }
}

function findRepositoryRoot(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function loadBoundTask(cwd: string, sessionId: string): BoundTask | null {
  if (!/^[A-Za-z0-9._-]+$/u.test(sessionId)) {
    throw new Error("Invalid session ID.");
  }
  const root = findRepositoryRoot(cwd);
  if (root === null) {
    return null;
  }
  const gitDirectory = resolveGitDirectory(root);
  const sessionBindingPath = path.join(
    gitDirectory,
    "codex",
    "active-tasks",
    `${sessionId}.json`,
  );
  const currentBindingPath = path.join(gitDirectory, "codex", "active-task.json");
  const bindingPath = existsSync(sessionBindingPath)
    ? sessionBindingPath
    : currentBindingPath;
  if (!existsSync(bindingPath)) {
    return null;
  }
  const binding = decodeActiveTaskBinding(JSON.parse(readFileSync(bindingPath, "utf8")));
  if (
    binding.state === "session" &&
    binding.sessionId !== sessionId
  ) {
    throw new Error("Session binding mismatch.");
  }
  if (path.resolve(binding.executionDirectory) !== path.resolve(root)) {
    throw new Error("Active task execution directory mismatch.");
  }
  const requestPath = repositoryPath(root, binding.requestPath);
  const contractPath = repositoryPath(root, binding.contractPath);
  if (
    sha256File(requestPath) !== binding.requestHash ||
    sha256File(contractPath) !== binding.contractHash
  ) {
    throw new Error("Active task source changed.");
  }
  const request = JSON.parse(readFileSync(requestPath, "utf8")) as unknown;
  if (
    !isRecord(request) ||
    request.objectiveId !== binding.objectiveId ||
    request.contractPath !== binding.contractPath ||
    !Array.isArray(request.writablePaths) ||
    request.writablePaths.some((value) => typeof value !== "string")
  ) {
    throw new Error("Capability request has invalid writable paths.");
  }
  return {
    root,
    binding,
    writablePaths: request.writablePaths as string[],
  };
}

function resolveGitDirectory(root: string): string {
  const dotGit = path.join(root, ".git");
  if (statSync(dotGit).isDirectory()) {
    return dotGit;
  }
  const declaration = readFileSync(dotGit, "utf8").trim();
  const match = /^gitdir:\s*(.+)$/iu.exec(declaration);
  if (match?.[1] === undefined) {
    throw new Error("Invalid worktree git directory.");
  }
  return path.resolve(root, match[1]);
}

function repositoryPath(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  if (!isInside(root, absolute) || absolute === root) {
    throw new Error("Active task path is outside the repository.");
  }
  return absolute;
}

function sha256File(candidate: string): string {
  return createHash("sha256")
    .update(readFileSync(candidate))
    .digest("hex");
}

function extractPatchPaths(patch: string): readonly string[] {
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/u)) {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/u.exec(
      line,
    );
    if (match?.[1] !== undefined) {
      paths.push(normalizeRepositoryPath(match[1]));
    }
  }
  return paths;
}

function matchesWritablePath(file: string, pattern: string): boolean {
  const normalizedFile = normalizeRepositoryPath(file);
  const normalizedPattern = normalizeRepositoryPath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  return normalizedFile === normalizedPattern;
}

function normalizeRepositoryPath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function deny(reason: string): never {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
  process.exit(0);
}

function sessionContext(additionalContext: string): never {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })}\n`,
  );
  process.exit(0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
