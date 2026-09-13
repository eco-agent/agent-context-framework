import {
  artifactIdentity,
  type ContextRegistryArtifact,
} from "@agent-context/repo-policy";

import type { BuiltContextCapsule } from "./context-capsule.js";

export type ContextCapsuleRestartReasonKind = "activation" | "runtime" | "skills";

export interface ContextCapsuleRestartReason {
  readonly kind: ContextCapsuleRestartReasonKind;
  readonly targetPaths: readonly string[];
}

export interface ContextCapsuleRestartClassification {
  readonly required: boolean;
  readonly reasons: readonly ContextCapsuleRestartReason[];
}

export function classifyContextCapsuleRestart(
  before: BuiltContextCapsule,
  after: BuiltContextCapsule,
): ContextCapsuleRestartClassification {
  const beforeArtifacts = capsuleArtifacts(before);
  const afterArtifacts = capsuleArtifacts(after);
  const changedTargets = new Set<string>();
  for (const identity of new Set([...beforeArtifacts.keys(), ...afterArtifacts.keys()])) {
    const previous = beforeArtifacts.get(identity);
    const next = afterArtifacts.get(identity);
    if (
      previous === undefined ||
      next === undefined ||
      JSON.stringify(previous) !== JSON.stringify(next)
    ) {
      if (previous !== undefined) changedTargets.add(previous.targetPath);
      if (next !== undefined) changedTargets.add(next.targetPath);
    }
  }

  const targetsByKind = new Map<ContextCapsuleRestartReasonKind, string[]>();
  for (const targetPath of [...changedTargets].sort(compareStrings)) {
    const kind = restartKind(targetPath);
    if (kind === null) continue;
    const targets = targetsByKind.get(kind) ?? [];
    targets.push(targetPath);
    targetsByKind.set(kind, targets);
  }
  const order: readonly ContextCapsuleRestartReasonKind[] = [
    "activation",
    "skills",
    "runtime",
  ];
  const reasons = order.flatMap((kind) => {
    const targetPaths = targetsByKind.get(kind);
    return targetPaths === undefined ? [] : [{ kind, targetPaths }];
  });
  return { required: reasons.length > 0, reasons };
}

function capsuleArtifacts(
  capsule: BuiltContextCapsule,
): ReadonlyMap<string, ContextRegistryArtifact> {
  const artifacts = new Map<string, ContextRegistryArtifact>();
  for (const component of capsule.payload.selection.resolvedComponents) {
    for (const artifact of component.artifacts) {
      artifacts.set(artifactIdentity(artifact), artifact);
    }
  }
  return artifacts;
}

function restartKind(targetPath: string): ContextCapsuleRestartReasonKind | null {
  if (targetPath.startsWith(".codex/skills/")) return "skills";
  if (
    targetPath.startsWith(".codex/acf/runtime-source/") ||
    targetPath === ".codex/acf/bootstrap.mjs"
  ) {
    return "runtime";
  }
  if (
    targetPath === "AGENTS.md" ||
    targetPath === ".codex/config.toml" ||
    targetPath === ".codex/hooks.json" ||
    targetPath.startsWith(".codex/agents/")
  ) {
    return "activation";
  }
  return null;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
