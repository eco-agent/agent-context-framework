import { runInternalCheck } from "./check-support.js";
import { checkAgents } from "./checks/agents.js";
import { checkBoundaries } from "./checks/boundaries.js";
import { checkDependencyAdoptions } from "./checks/dependency-adoptions.js";
import { checkDocs } from "./checks/docs.js";
import {
  checkTechnicalProse,
  formatTechnicalProseFinding,
} from "./checks/technical-prose.js";
import { checkTypeScriptProjects } from "./checks/typescript-projects.js";
import { runRegisteredCommand } from "./command-registry.js";
import {
  collectWorktreeStatus,
  worktreeMutationDiagnostics,
} from "./git.js";
import type { CheckId, CheckResult, PolicyResult, VerificationProfileId } from "./model.js";
import { verificationProfiles } from "./profiles.js";

export interface RunProfileOptions {
  readonly operation: string;
  readonly profile: VerificationProfileId;
  readonly base?: string;
  readonly changedFiles?: readonly string[];
  readonly affectedUnits?: readonly string[];
}

export async function runProfile(root: string, options: RunProfileOptions): Promise<PolicyResult> {
  const profile = verificationProfiles[options.profile];
  const runDirectory = createRunDirectoryName();
  const checks: CheckResult[] = [];
  const initialStatus = await collectWorktreeStatus(root);

  for (const checkId of profile.checks) {
    const result = await runCheck(root, checkId, runDirectory);
    checks.push(result);
    if (!result.ok) {
      break;
    }
  }

  checks.push(
    await runInternalCheck(
      "verification-cleanliness",
      async () =>
        worktreeMutationDiagnostics(initialStatus, await collectWorktreeStatus(root)),
    ),
  );

  return {
    ok: checks.every((check) => check.ok),
    operation: options.operation,
    profile: options.profile,
    ...(options.base === undefined ? {} : { base: options.base }),
    changedFiles: options.changedFiles ?? [],
    affectedUnits: options.affectedUnits ?? [],
    checks,
  };
}

export async function runSingleCheck(
  root: string,
  operation: string,
  checkId: Exclude<
    CheckId,
    "scope" | "test" | "typecheck" | "verification-cleanliness"
  >,
): Promise<PolicyResult> {
  const result = await runCheck(root, checkId, createRunDirectoryName());
  return {
    ok: result.ok,
    operation,
    changedFiles: [],
    affectedUnits: [],
    checks: [result],
  };
}

export async function runTechnicalProseCheck(
  root: string,
  operation: string,
  files: readonly string[],
): Promise<PolicyResult> {
  const started = performance.now();
  const report = await checkTechnicalProse(root, files);
  const check: CheckResult = {
    id: "technical-prose",
    ok: report.ok,
    durationMs: Math.round(performance.now() - started),
    summary: report.ok
      ? `technical-prose passed for ${report.files.length} file(s).`
      : `technical-prose found ${report.findings.length} issue(s) in ${report.files.length} file(s).`,
    diagnostics: report.findings.slice(0, 50).map(formatTechnicalProseFinding),
  };
  return {
    ok: check.ok,
    operation,
    changedFiles: report.files,
    affectedUnits: [],
    checks: [check],
  };
}

async function runCheck(root: string, id: CheckId, runDirectory: string): Promise<CheckResult> {
  switch (id) {
    case "agents":
      return await runInternalCheck(id, async () => await checkAgents(root));
    case "boundaries":
      return await runInternalCheck(id, async () => await checkBoundaries(root));
    case "dependency-adoptions":
      return await runInternalCheck(id, async () => await checkDependencyAdoptions(root));
    case "docs":
      return await runInternalCheck(id, async () => await checkDocs(root));
    case "typescript-projects":
      return await runInternalCheck(
        id,
        async () => await checkTypeScriptProjects(root),
      );
    case "test":
    case "typecheck":
    case "workflow-test":
      return await runRegisteredCommand(root, id, runDirectory);
    case "technical-prose":
      throw new Error("Technical prose checks require explicit files.");
    case "scope":
      throw new Error("Scope checks require a capability request.");
    case "verification-cleanliness":
      throw new Error("Verification cleanliness wraps a complete profile.");
  }
}

function createRunDirectoryName(): string {
  return `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`;
}
