#!/usr/bin/env node
import { runInternalCheck } from "./check-support.js";
import { checkScope } from "./checks/scope.js";
import {
  collectBranchChangedFiles,
  collectTaskChangedFiles,
  type ChangeSet,
} from "./git.js";
import { isVerificationProfileId, type PolicyResult } from "./model.js";
import { profileForChanges } from "./profiles.js";
import { runProfile, runSingleCheck, runTechnicalProseCheck } from "./runner.js";
import { affectedWorkspaceUnits, discoverWorkspaceUnits } from "./workspace.js";

const root = process.cwd();

try {
  const result = await dispatch(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  const operation = process.argv[2] ?? "unknown";
  const result: PolicyResult = {
    ok: false,
    operation,
    changedFiles: [],
    affectedUnits: [],
    checks: [
      {
        id: operation === "check-technical-prose" ? "technical-prose" : "scope",
        ok: false,
        durationMs: 0,
        summary: "Repository policy could not run.",
        diagnostics: [error instanceof Error ? error.message : String(error)],
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
  process.exitCode = 1;
}

async function dispatch(args: readonly string[]): Promise<PolicyResult> {
  const operation = args[0];
  switch (operation) {
    case "verify":
      return await runProfile(root, { operation, profile: "full" });
    case "verify-profile": {
      const profile = args[1];
      if (profile === undefined || !isVerificationProfileId(profile)) {
        throw new Error(`verify-profile requires one of the registered profile IDs.`);
      }
      return await runProfile(root, { operation, profile });
    }
    case "verify-task":
    case "verify-changed":
      return await verifyChangeSet(operation, await collectTaskChangedFiles(root));
    case "verify-branch":
      return await verifyChangeSet(
        operation,
        await collectBranchChangedFiles(root, optionValue(args, "--base")),
      );
    case "check-agents":
      return await runSingleCheck(root, operation, "agents");
    case "check-boundaries":
      return await runSingleCheck(root, operation, "boundaries");
    case "check-dependency-adoptions":
      return await runSingleCheck(root, operation, "dependency-adoptions");
    case "check-technical-prose": {
      const files = optionValues(args, "--files");
      return await runTechnicalProseCheck(
        root,
        operation,
        files,
      );
    }
    case "check-typescript-projects":
      return await runSingleCheck(root, operation, "typescript-projects");
    case "check-scope": {
      const requestFile = optionValue(args, "--request");
      const base = optionValue(args, "--base");
      if (requestFile === undefined) {
        throw new Error("check-scope requires --request <file>.");
      }
      const check = await runInternalCheck(
        "scope",
        async () =>
          await checkScope(root, {
            requestFile,
            ...(base === undefined ? {} : { base }),
          }),
      );
      return {
        ok: check.ok,
        operation,
        changedFiles: [],
        affectedUnits: [],
        checks: [check],
      };
    }
    default:
      throw new Error(
        "Unknown operation. Use verify, verify-task, verify-branch, verify-profile, check-scope, check-boundaries, check-dependency-adoptions, check-technical-prose, check-typescript-projects, or check-agents.",
      );
  }
}

async function verifyChangeSet(operation: string, changeSet: ChangeSet): Promise<PolicyResult> {
  if (changeSet.files.length === 0) {
    return {
      ok: true,
      operation,
      base: changeSet.base,
      changedFiles: [],
      affectedUnits: [],
      checks: [],
    };
  }

  const units = await discoverWorkspaceUnits(root);
  return await runProfile(root, {
    operation,
    profile: profileForChanges(changeSet.files),
    base: changeSet.base,
    changedFiles: changeSet.files,
    affectedUnits: affectedWorkspaceUnits(changeSet.files, units),
  });
}

function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index < 0 ? undefined : args[index + 1];
}

function optionValues(args: readonly string[], option: string): readonly string[] {
  const index = args.indexOf(option);
  if (index < 0) {
    return [];
  }

  const values: string[] = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (value === undefined || value.startsWith("--")) {
      break;
    }
    values.push(value);
  }
  return values;
}
