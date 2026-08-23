import type { CheckId, VerificationProfileId } from "./model.js";

export interface VerificationProfile {
  readonly checks: readonly CheckId[];
  readonly timeoutMs: number;
}

const fullChecks = [
  "agents",
  "agent-prose",
  "docs",
  "dependency-adoptions",
  "typescript-projects",
  "boundaries",
  "typecheck",
  "test",
] as const satisfies readonly CheckId[];

export const verificationProfiles: Readonly<Record<VerificationProfileId, VerificationProfile>> = {
  docs: {
    checks: ["agents", "agent-prose", "docs"],
    timeoutMs: 30_000,
  },
  frontend: {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
  "product-topology": {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
  backend: {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
  "domain-module": {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
  "workspace-structure": {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
  workflow: {
    checks: ["agents", "agent-prose", "dependency-adoptions", "boundaries", "workflow-test"],
    timeoutMs: 240_000,
  },
  full: {
    checks: fullChecks,
    timeoutMs: 240_000,
  },
};

export function profileForChanges(changedFiles: readonly string[]): VerificationProfileId {
  if (
    changedFiles.length > 0 &&
    changedFiles.every(
      (file) =>
        file === "README.md" ||
        file.startsWith("docs/") ||
        file.startsWith(".codex/work/"),
    )
  ) {
    return "docs";
  }

  if (
    changedFiles.length > 0 &&
    changedFiles.every(
      (file) =>
        file.startsWith("packages/codex-workflow-runtime/") ||
        file.startsWith("tools/codex-workflows/"),
    )
  ) {
    return "workflow";
  }

  if (
    changedFiles.some(
      (file) =>
        file === "package.json" ||
        file === "pnpm-lock.yaml" ||
        file === "pnpm-workspace.yaml" ||
        file.startsWith("tsconfig") ||
        file.startsWith("tools/repo-policy/"),
    )
  ) {
    return "workspace-structure";
  }

  return "full";
}
