import { realpath } from "node:fs/promises";
import path from "node:path";

import { CONTEXT_CAPSULE_PATH } from "@agent-context/repo-policy";

import { readContextCapsuleFile } from "./context-capsule.js";
import {
  verifyContextCapsuleV3Installation,
  type ContextCapsuleV3InstallationVerification,
} from "./context-capsule-installation.js";
import {
  materializeContextCapsule,
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
  readonly verification: ContextCapsuleV3InstallationVerification;
  readonly materialization: ContextMaterializationResult;
}

export async function bootstrapContextCapsule(
  projectRoot: string,
): Promise<ContextCapsuleBootstrapResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const recovery = await resumeContextTransaction(resolvedProjectRoot);
  const capsulePath = path.join(resolvedProjectRoot, CONTEXT_CAPSULE_PATH);
  const capsule = await readContextCapsuleFile(capsulePath);
  const verification = await verifyContextCapsuleV3Installation(
    capsule,
    resolvedProjectRoot,
  );
  if (!verification.ok) {
    throw new Error(
      `Context capsule bootstrap verification failed: ${verification.mismatches.map((mismatch) => `${mismatch.targetPath ?? mismatch.identity}: ${mismatch.detail}`).join(" ")}`,
    );
  }
  const materialization = await materializeContextCapsule(capsule, resolvedProjectRoot);
  return {
    command: "bootstrap-capsule",
    projectRoot: resolvedProjectRoot,
    capsulePath,
    recovery,
    verification,
    materialization,
  };
}
