import { realpath } from "node:fs/promises";
import path from "node:path";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "./context-capsule.js";
import {
  materializeContextCapsuleSkills,
  type ContextMaterializationResult,
} from "./context-capsule-materialization.js";
import {
  resumeContextTransaction,
  type ContextTransactionRecoveryResult,
} from "./context-transaction.js";

export interface ContextCapsuleBootstrapResult {
  readonly command: "bootstrap-capsule";
  readonly projectRoot: string;
  readonly capsulePath: string;
  readonly recovery: ContextTransactionRecoveryResult;
  readonly materialization: ContextMaterializationResult;
}

export async function bootstrapContextCapsule(
  projectRoot: string,
): Promise<ContextCapsuleBootstrapResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const recovery = await resumeContextTransaction(resolvedProjectRoot);
  const capsulePath = path.join(resolvedProjectRoot, CONTEXT_CAPSULE_PATH);
  const capsule = await readContextCapsuleFile(capsulePath);
  const materialization = await materializeContextCapsuleSkills(capsule, resolvedProjectRoot);
  return {
    command: "bootstrap-capsule",
    projectRoot: resolvedProjectRoot,
    capsulePath,
    recovery,
    materialization,
  };
}
