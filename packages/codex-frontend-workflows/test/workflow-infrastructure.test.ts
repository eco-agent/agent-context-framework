import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ContentAddressedArtifactStore,
  createFrontendSpecificationBundle,
  runWindowsFrontendWorkflowPreflight,
  transitionHumanAcceptance,
  type HumanAcceptanceSignal,
  type HumanAcceptanceStore,
  type RepresentationAcceptanceTarget,
} from "../src/index.js";

test("zero-model preflight covers all five mechanical boundaries", async () => {
  const result = await runWindowsFrontendWorkflowPreflight();
  assert.equal(result.status, "ready");
  assert.equal(result.modelTurnsStarted, 0);
  assert.deepEqual(result.checks.map((check) => check.id).sort(), [
    "cleanup",
    "evidence-idempotency",
    "process-launch",
    "schema-compatibility",
    "stdout-separation",
  ]);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test("content evidence is idempotent and verifies bytes on read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frontend-artifact-test-"));
  try {
    const store = new ContentAddressedArtifactStore(directory);
    const first = await store.store({ value: 1, kind: "evidence" });
    const second = await store.store({ kind: "evidence", value: 1 });
    assert.equal(first, second);
    assert.equal((await store.read(first)).reference, first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("composition manifest binds Markdown and requires the complete spatial pass", () => {
  const bundle = createFrontendSpecificationBundle(Buffer.from("# Approved frontend\n"), manifest());
  assert.match(bundle.bundleReference, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(bundle.manifest.surfaces.length, 1);

  const invalid = manifest();
  invalid.spatialPass[0]!.passed = false;
  assert.throws(
    () => createFrontendSpecificationBundle(Buffer.from("# Approved frontend\n"), invalid),
    /spatial pass must complete/u,
  );
});

test("human acceptance is exact and idempotent", async () => {
  const values = new Map<string, HumanAcceptanceSignal>();
  const store: HumanAcceptanceStore = {
    async load(key) {
      return values.get(key);
    },
    async save(key, signal) {
      values.set(key, signal);
    },
  };
  const target: RepresentationAcceptanceTarget = {
    kind: "representation",
    runId: "representation-run",
    specificationBundleReference: hash("a"),
    comparisonReference: hash("b"),
    selectedCandidateReference: hash("c"),
  };
  const signal = {
    schemaVersion: 1 as const,
    decision: "accept" as const,
    owner: "human-reviewer",
    decidedAt: "2026-08-24T10:00:00.000Z",
    target,
    note: "Approved after comparing both compositions.",
  };
  assert.equal((await transitionHumanAcceptance(target, signal, store)).replayed, false);
  assert.equal((await transitionHumanAcceptance(target, signal, store)).replayed, true);
  await assert.rejects(
    transitionHumanAcceptance(target, { ...signal, note: "Changed after acceptance." }, store),
    /already exists with different content/u,
  );
});

function manifest() {
  return {
    schemaVersion: 1 as const,
    representationThesis: "One operational flow",
    productJob: "Inspect and act on the selected record",
    contentIds: ["identity", "status", "details", "actions"],
    readingOrder: ["identity", "status", "details", "actions"],
    spatialGroups: [
      {
        semanticOwner: "RecordSummary",
        contentIds: ["identity", "status"],
        spatialGroup: "header",
        layoutOwner: "record-workspace",
        containment: "none" as const,
        reason: "Baseline alignment carries the relationship",
      },
      {
        semanticOwner: "RecordDetails",
        contentIds: ["details", "actions"],
        spatialGroup: "work",
        layoutOwner: "record-workspace",
        containment: "own-surface" as const,
        reason: "The independently scrolling work region is the primary surface",
      },
    ],
    surfaces: [{ id: "work", kind: "primary" as const, interactionReason: "Independent scrolling", stateIds: ["typical"] }],
    density: {
      source: "Existing product rows",
      rowHeightPx: 32,
      relatedGapPx: 12,
      sectionGapPx: 24,
      controlHeightPx: 28,
      typeRoles: ["title", "body", "metadata"],
      exceptions: [],
    },
    placementRelationships: ["Status shares the identity baseline"],
    negativeComponentDecisions: ["card", "badge", "heading", "tabs", "dialog", "separator", "button-label"].map((component) => ({
      component,
      decision: `${component} is omitted unless the recorded interaction requires it`,
    })),
    spatialPass: [
      "reading-order",
      "shared-alignment",
      "surface-count",
      "repeated-padding",
      "density",
      "placement-replaces-chrome",
      "semantic-visual-separation",
    ].map((check) => ({ check, passed: true, evidence: `${check} checked in the approved wireframe` })),
    renderMatrix: [{ stateId: "typical", viewportId: "desktop" }],
  };
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
