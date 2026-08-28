import {
  CONTEXT_CAPSULE_FORMAT_V1,
  CONTEXT_CAPSULE_LOCK_SCHEMA_VERSION,
  CONTEXT_CAPSULE_PATH,
  decodeContextCapsuleLock,
  type ContextCapsuleActivationLock,
  type ContextCapsuleLockV3,
} from "@agent-context/repo-policy";

import type { BuiltContextCapsule } from "./context-capsule.js";

export interface ContextCapsuleLockVerification {
  readonly ok: boolean;
  readonly mismatches: readonly string[];
}

export function createContextCapsuleLock(
  capsule: BuiltContextCapsule,
  activation: readonly ContextCapsuleActivationLock[],
  materialization: readonly ContextCapsuleActivationLock[] = [],
): ContextCapsuleLockV3 {
  return decodeContextCapsuleLock({
    schemaVersion: CONTEXT_CAPSULE_LOCK_SCHEMA_VERSION,
    registryRevision: capsule.payload.registry.revision,
    frameworkRevision: capsule.payload.frameworkRevision,
    capsule: {
      format: CONTEXT_CAPSULE_FORMAT_V1,
      path: CONTEXT_CAPSULE_PATH,
      sha256: capsule.capsuleSha256,
      treeSha256: capsule.treeSha256,
      compressedBytes: capsule.capsuleBytes,
      expandedBytes: capsule.payload.entries.reduce(
        (total, entry) => total + entry.byteLength,
        0,
      ),
      entryCount: capsule.entryCount,
    },
    components: {
      direct: capsule.payload.selection.directComponents,
      resolved: capsule.payload.selection.resolvedComponents.map((component) => ({
        name: component.name,
        revision: component.revision,
      })),
    },
    activation: [...activation].sort((left, right) =>
      compareStrings(left.identity, right.identity)),
    materialization: {
      capsuleSha256: capsule.capsuleSha256,
      treeSha256: capsule.treeSha256,
      files: [...materialization].sort((left, right) =>
        compareStrings(left.identity, right.identity)),
    },
  });
}

export function verifyContextCapsuleLock(
  lock: ContextCapsuleLockV3,
  capsule: BuiltContextCapsule,
  expectedActivation: readonly ContextCapsuleActivationLock[],
  expectedMaterialization: readonly ContextCapsuleActivationLock[] = [],
): ContextCapsuleLockVerification {
  const expected = createContextCapsuleLock(
    capsule,
    expectedActivation,
    expectedMaterialization,
  );
  const mismatches: string[] = [];
  if (lock.registryRevision !== expected.registryRevision) {
    mismatches.push("Registry revision differs from the capsule.");
  }
  if (lock.frameworkRevision !== expected.frameworkRevision) {
    mismatches.push("Framework revision differs from the capsule.");
  }
  if (lock.capsule.sha256 !== expected.capsule.sha256) {
    mismatches.push("Capsule file digest differs from the lock.");
  }
  if (lock.capsule.treeSha256 !== expected.capsule.treeSha256) {
    mismatches.push("Capsule tree digest differs from the lock.");
  }
  if (lock.capsule.compressedBytes !== expected.capsule.compressedBytes) {
    mismatches.push("Capsule byte count differs from the lock.");
  }
  if (lock.capsule.expandedBytes !== expected.capsule.expandedBytes) {
    mismatches.push("Expanded source byte count differs from the lock.");
  }
  if (lock.capsule.entryCount !== expected.capsule.entryCount) {
    mismatches.push("Capsule entry count differs from the lock.");
  }
  if (!sameJson(lock.components, expected.components)) {
    mismatches.push("Component selection or revisions differ from the capsule.");
  }
  if (!sameJson(lock.activation, expected.activation)) {
    mismatches.push("Activation records differ from the expected installed scopes.");
  }
  if (!sameJson(lock.materialization, expected.materialization)) {
    mismatches.push("Materialization records differ from the capsule projection.");
  }
  return { ok: mismatches.length === 0, mismatches };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
