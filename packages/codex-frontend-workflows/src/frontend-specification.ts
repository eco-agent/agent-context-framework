import { createHash } from "node:crypto";

import { toJson, type JsonValue } from "@agent-context/codex-workflow-runtime";

import { decodeContentArtifactReference, type ContentArtifactReference } from "./content-addressed-artifacts.js";

const containmentKinds = ["shared", "own-surface", "none"] as const;
const surfaceKinds = ["primary", "additional"] as const;
const negativeComponents = ["card", "badge", "heading", "tabs", "dialog", "separator", "button-label"] as const;
const spatialChecks = [
  "reading-order",
  "shared-alignment",
  "surface-count",
  "repeated-padding",
  "density",
  "placement-replaces-chrome",
  "semantic-visual-separation",
] as const;

export interface FrontendCompositionManifestV1 {
  readonly schemaVersion: 1;
  readonly representationThesis: string;
  readonly productJob: string;
  readonly contentIds: readonly string[];
  readonly readingOrder: readonly string[];
  readonly spatialGroups: readonly {
    readonly semanticOwner: string;
    readonly contentIds: readonly string[];
    readonly spatialGroup: string;
    readonly layoutOwner: string;
    readonly containment: (typeof containmentKinds)[number];
    readonly reason: string;
  }[];
  readonly surfaces: readonly {
    readonly id: string;
    readonly kind: (typeof surfaceKinds)[number];
    readonly interactionReason: string;
    readonly stateIds: readonly string[];
  }[];
  readonly density: {
    readonly source: string;
    readonly rowHeightPx: number;
    readonly relatedGapPx: number;
    readonly sectionGapPx: number;
    readonly controlHeightPx: number;
    readonly typeRoles: readonly string[];
    readonly exceptions: readonly string[];
  };
  readonly placementRelationships: readonly string[];
  readonly negativeComponentDecisions: readonly {
    readonly component: (typeof negativeComponents)[number];
    readonly decision: string;
  }[];
  readonly spatialPass: readonly {
    readonly check: (typeof spatialChecks)[number];
    readonly passed: boolean;
    readonly evidence: string;
  }[];
  readonly renderMatrix: readonly {
    readonly stateId: string;
    readonly viewportId: string;
  }[];
}

export interface FrontendSpecificationBundleV1 {
  readonly schemaVersion: 1;
  readonly markdownSha256: string;
  readonly manifestSha256: string;
  readonly bundleReference: ContentArtifactReference;
  readonly manifest: FrontendCompositionManifestV1;
}

export function createFrontendSpecificationBundle(
  markdown: Uint8Array,
  manifestValue: unknown,
): FrontendSpecificationBundleV1 {
  if (markdown.byteLength === 0) throw new Error("Frontend specification Markdown must not be empty");
  const manifest = decodeFrontendCompositionManifest(manifestValue);
  const markdownSha256 = sha256(markdown);
  const manifestBytes = Buffer.from(canonicalJson(toJson(manifest)), "utf8");
  const manifestSha256 = sha256(manifestBytes);
  const bundleReference = decodeContentArtifactReference(`sha256:${sha256(Buffer.from(canonicalJson({
    schemaVersion: 1,
    markdownSha256,
    manifestSha256,
  }), "utf8"))}`);
  return { schemaVersion: 1, markdownSha256, manifestSha256, bundleReference, manifest };
}

export function decodeFrontendCompositionManifest(value: unknown): FrontendCompositionManifestV1 {
  const record = exactRecord(value, [
    "schemaVersion", "representationThesis", "productJob", "contentIds", "readingOrder",
    "spatialGroups", "surfaces", "density", "placementRelationships",
    "negativeComponentDecisions", "spatialPass", "renderMatrix",
  ], "Frontend composition manifest");
  if (record.schemaVersion !== 1) throw new Error("Frontend composition manifest schemaVersion must be 1");
  const contentIds = uniqueStrings(record.contentIds, "Manifest contentIds", 1);
  const readingOrder = uniqueStrings(record.readingOrder, "Manifest readingOrder", 1);
  sameSet(readingOrder, contentIds, "Manifest readingOrder");
  const spatialGroups = array(record.spatialGroups, "Manifest spatialGroups", 1).map((entry, index) => {
    const group = exactRecord(entry, ["semanticOwner", "contentIds", "spatialGroup", "layoutOwner", "containment", "reason"], `Manifest spatial group ${index}`);
    return {
      semanticOwner: string(group.semanticOwner, `Manifest spatial group ${index} semanticOwner`),
      contentIds: uniqueStrings(group.contentIds, `Manifest spatial group ${index} contentIds`, 1),
      spatialGroup: string(group.spatialGroup, `Manifest spatial group ${index} spatialGroup`),
      layoutOwner: string(group.layoutOwner, `Manifest spatial group ${index} layoutOwner`),
      containment: enumeration(group.containment, containmentKinds, `Manifest spatial group ${index} containment`),
      reason: string(group.reason, `Manifest spatial group ${index} reason`),
    };
  });
  sameSet(spatialGroups.flatMap((group) => group.contentIds), contentIds, "Manifest spatial group content");
  const surfaces = array(record.surfaces, "Manifest surfaces", 0).map((entry, index) => {
    const surface = exactRecord(entry, ["id", "kind", "interactionReason", "stateIds"], `Manifest surface ${index}`);
    return {
      id: string(surface.id, `Manifest surface ${index} id`),
      kind: enumeration(surface.kind, surfaceKinds, `Manifest surface ${index} kind`),
      interactionReason: string(surface.interactionReason, `Manifest surface ${index} interactionReason`),
      stateIds: uniqueStrings(surface.stateIds, `Manifest surface ${index} stateIds`, 0),
    };
  });
  unique(surfaces.map((surface) => surface.id), "Manifest surface IDs");
  if (surfaces.filter((surface) => surface.kind === "primary").length > 1) {
    throw new Error("Manifest permits at most one primary surface");
  }
  const density = exactRecord(record.density, ["source", "rowHeightPx", "relatedGapPx", "sectionGapPx", "controlHeightPx", "typeRoles", "exceptions"], "Manifest density");
  const negativeComponentDecisions = array(record.negativeComponentDecisions, "Manifest negativeComponentDecisions", negativeComponents.length).map((entry, index) => {
    const decision = exactRecord(entry, ["component", "decision"], `Manifest negative decision ${index}`);
    return {
      component: enumeration(decision.component, negativeComponents, `Manifest negative decision ${index} component`),
      decision: string(decision.decision, `Manifest negative decision ${index} decision`),
    };
  });
  sameSet(negativeComponentDecisions.map((item) => item.component), negativeComponents, "Manifest negative component coverage");
  const spatialPass = array(record.spatialPass, "Manifest spatialPass", spatialChecks.length).map((entry, index) => {
    const check = exactRecord(entry, ["check", "passed", "evidence"], `Manifest spatial check ${index}`);
    if (typeof check.passed !== "boolean") throw new Error(`Manifest spatial check ${index} passed must be boolean`);
    return {
      check: enumeration(check.check, spatialChecks, `Manifest spatial check ${index} check`),
      passed: check.passed,
      evidence: string(check.evidence, `Manifest spatial check ${index} evidence`),
    };
  });
  sameSet(spatialPass.map((item) => item.check), spatialChecks, "Manifest spatial pass coverage");
  if (spatialPass.some((item) => !item.passed)) throw new Error("Manifest spatial pass must complete before approval");
  const renderMatrix = array(record.renderMatrix, "Manifest renderMatrix", 1).map((entry, index) => {
    const render = exactRecord(entry, ["stateId", "viewportId"], `Manifest render matrix item ${index}`);
    return {
      stateId: string(render.stateId, `Manifest render matrix item ${index} stateId`),
      viewportId: string(render.viewportId, `Manifest render matrix item ${index} viewportId`),
    };
  });
  unique(renderMatrix.map((item) => `${item.stateId}:${item.viewportId}`), "Manifest render matrix identities");
  return {
    schemaVersion: 1,
    representationThesis: string(record.representationThesis, "Manifest representationThesis"),
    productJob: string(record.productJob, "Manifest productJob"),
    contentIds,
    readingOrder,
    spatialGroups,
    surfaces,
    density: {
      source: string(density.source, "Manifest density source"),
      rowHeightPx: positiveInteger(density.rowHeightPx, "Manifest rowHeightPx"),
      relatedGapPx: positiveInteger(density.relatedGapPx, "Manifest relatedGapPx"),
      sectionGapPx: positiveInteger(density.sectionGapPx, "Manifest sectionGapPx"),
      controlHeightPx: positiveInteger(density.controlHeightPx, "Manifest controlHeightPx"),
      typeRoles: uniqueStrings(density.typeRoles, "Manifest density typeRoles", 1),
      exceptions: uniqueStrings(density.exceptions, "Manifest density exceptions", 0),
    },
    placementRelationships: uniqueStrings(record.placementRelationships, "Manifest placementRelationships", 1),
    negativeComponentDecisions,
    spatialPass,
    renderMatrix,
  };
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unknown.length > 0 || missing.length > 0) throw new Error(`${label} keys differ from the contract`);
  return record;
}

function array(value: unknown, label: string, minimum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum) throw new Error(`${label} must contain at least ${minimum} items`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function uniqueStrings(value: unknown, label: string, minimum: number): readonly string[] {
  const values = array(value, label, minimum).map((entry, index) => string(entry, `${label} ${index}`));
  unique(values, label);
  return values;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new Error(`${label} must be a positive integer no greater than 1000`);
  }
  return value;
}

function enumeration<const Values extends readonly string[]>(value: unknown, values: Values, label: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new Error(`${label} has an unsupported value`);
  return value as Values[number];
}

function sameSet(actual: readonly string[], expected: readonly string[], label: string): void {
  unique(actual, label);
  if (actual.length !== expected.length || actual.some((item) => !expected.includes(item))) throw new Error(`${label} must exactly match the declared values`);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Specification JSON contains an unsupported value");
  return encoded;
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
