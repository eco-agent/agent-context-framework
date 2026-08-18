#!/usr/bin/env node

import process from "node:process";

import { loadActiveTask } from "./active-task.js";
import { findWorkspaceRoot, runCommand } from "./workspace.js";

const args = process.argv.slice(2).filter((value) => value !== "--");
const root = await findWorkspaceRoot(process.cwd());
const sessionId = argumentValue(args, "--session-id") ?? process.env.CODEX_THREAD_ID;
const active = await loadActiveTask(root, sessionId);
if (active === null) {
  throw new Error("No active task is bound to this worktree.");
}
const status = await runCommand("git", ["status", "--porcelain=v2", "--branch"], {
  cwd: root,
});
const branch = status.match(/^# branch\.head (.+)$/mu)?.[1] ?? "(detached)";
const head = status.match(/^# branch\.oid ([a-f0-9]+)$/mu)?.[1];
if (head === undefined) {
  throw new Error("Cannot resolve the current Git revision.");
}

process.stdout.write(
  [
    `Branch: ${branch}`,
    `Objective: ${active.binding.objectiveId}`,
    `Attempt: ${active.binding.attempt}; Lease: ${active.binding.leaseId}`,
    `Base: ${active.binding.baselineRevision}; Head: ${head}`,
    `Envelope: ${active.binding.envelopeArtifact.hash}`,
    `Contract: ${active.binding.contractPath}`,
    `Implementation contract: ${active.binding.implementationContract?.path ?? "not applicable"}`,
    `Precedent materialization: ${active.binding.productPrecedentMaterialization?.path ?? "not applicable"}`,
    `Capability: ${active.binding.requestPath}`,
    "",
  ].join("\n"),
);

function argumentValue(
  values: readonly string[],
  name: string,
): string | undefined {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}
