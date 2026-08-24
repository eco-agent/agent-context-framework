import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import type { JsonValue } from "@agent-context/codex-workflow-runtime";

import { ContentAddressedArtifactStore } from "./content-addressed-artifacts.js";
import { composeOutputSchemasForPreflight, type ComposeRefineRequest } from "./frontend-compose-refine.js";
import { representationOutputSchemasForPreflight, type RepresentationRequest } from "./frontend-representation.js";

const execFileAsync = promisify(execFile);
const stdoutMarker = "frontend-preflight-stdout";
const stderrMarker = "frontend-preflight-stderr";

export type FrontendWorkflowPreflightCheckId =
  | "process-launch"
  | "schema-compatibility"
  | "stdout-separation"
  | "evidence-idempotency"
  | "cleanup";

export interface FrontendWorkflowPreflightCheck {
  readonly id: FrontendWorkflowPreflightCheckId;
  readonly ok: boolean;
  readonly summary: string;
  readonly diagnostics: readonly string[];
}

export interface FrontendWorkflowPreflightResult {
  readonly schemaVersion: 1;
  readonly status: "ready" | "failed";
  readonly modelTurnsStarted: 0;
  readonly platform: NodeJS.Platform;
  readonly checks: readonly FrontendWorkflowPreflightCheck[];
}

export async function runWindowsFrontendWorkflowPreflight(): Promise<FrontendWorkflowPreflightResult> {
  const checks: FrontendWorkflowPreflightCheck[] = [];
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "codex-frontend-preflight-"));
  let processResult: { readonly stdout: string; readonly stderr: string } | undefined;
  try {
    try {
      const result = await execFileAsync(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(stdoutMarker)});process.stderr.write(${JSON.stringify(stderrMarker)})`],
        { cwd: temporaryRoot, encoding: "utf8", windowsHide: true, timeout: 10_000 },
      );
      processResult = { stdout: result.stdout, stderr: result.stderr };
      checks.push(pass("process-launch", `Node child process launched with ${process.execPath}`));
    } catch (error) {
      checks.push(fail("process-launch", "Node child process did not launch cleanly", error));
    }

    if (processResult?.stdout === stdoutMarker && processResult.stderr === stderrMarker) {
      checks.push(pass("stdout-separation", "Child stdout and stderr remained distinct"));
    } else {
      checks.push({
        id: "stdout-separation",
        ok: false,
        summary: "Child stdout and stderr were missing or mixed",
        diagnostics: processResult === undefined
          ? ["Process launch produced no streams"]
          : [`stdout=${JSON.stringify(processResult.stdout)}`, `stderr=${JSON.stringify(processResult.stderr)}`],
      });
    }

    try {
      const schemas = [
        ...representationOutputSchemasForPreflight(representationRequest()),
        ...composeOutputSchemasForPreflight(composeRequest()),
      ];
      schemas.forEach((schema, index) => validateStructuredOutputSchema(schema, `schema ${index + 1}`));
      checks.push(pass("schema-compatibility", `${schemas.length} controller schemas use the supported structured-output subset`));
    } catch (error) {
      checks.push(fail("schema-compatibility", "A controller schema is outside the supported structured-output subset", error));
    }

    try {
      const artifactDirectory = path.join(temporaryRoot, "evidence");
      const store = new ContentAddressedArtifactStore(artifactDirectory);
      const value = { kind: "preflight", references: ["prepared-evidence"] } as const;
      const first = await store.store(value);
      const second = await store.store(value);
      const files = await readdir(artifactDirectory);
      await store.read(first);
      if (first !== second || files.length !== 1) {
        throw new Error(`Repeated evidence produced ${files.length} files and references ${first}, ${second}`);
      }
      checks.push(pass("evidence-idempotency", `Repeated evidence retained one content reference ${first}`));
    } catch (error) {
      checks.push(fail("evidence-idempotency", "Repeated evidence was not idempotent", error));
    }
  } finally {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
      let exists = true;
      try {
        await access(temporaryRoot);
      } catch {
        exists = false;
      }
      if (exists) throw new Error(`Temporary directory still exists at ${temporaryRoot}`);
      checks.push(pass("cleanup", "Preflight removed its temporary directory"));
    } catch (error) {
      checks.push(fail("cleanup", "Preflight did not remove its temporary directory", error));
    }
  }

  return {
    schemaVersion: 1,
    status: checks.every((check) => check.ok) ? "ready" : "failed",
    modelTurnsStarted: 0,
    platform: process.platform,
    checks,
  };
}

export function validateStructuredOutputSchema(value: JsonValue, label = "schema"): void {
  schemaNode(value, label);
}

function schemaNode(value: JsonValue, label: string): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set(["type", "additionalProperties", "required", "properties", "items", "enum", "minLength", "minItems", "maxItems", "minimum", "maximum"]);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) throw new Error(`${label} uses unsupported keywords: ${unsupported.join(", ")}`);
  if (typeof value.type !== "string" || !["object", "array", "string", "number", "integer", "boolean"].includes(value.type)) {
    throw new Error(`${label} has an unsupported type`);
  }
  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== "boolean") {
    throw new Error(`${label} additionalProperties must be boolean`);
  }
  if (value.required !== undefined) stringArray(value.required, `${label} required`);
  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) throw new Error(`${label} properties must be an object`);
    for (const [key, child] of Object.entries(value.properties)) schemaNode(child, `${label}.properties.${key}`);
    const required = value.required === undefined ? [] : stringArray(value.required, `${label} required`);
    const missing = required.filter((key) => !Object.hasOwn(value.properties as object, key));
    if (missing.length > 0) throw new Error(`${label} required properties are missing schemas: ${missing.join(", ")}`);
  }
  if (value.items !== undefined) schemaNode(value.items, `${label}.items`);
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length === 0)) throw new Error(`${label} enum must be non-empty`);
  for (const key of ["minLength", "minItems", "maxItems", "minimum", "maximum"] as const) {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
      throw new Error(`${label} ${key} must be a finite number`);
    }
  }
}

function representationRequest(): RepresentationRequest {
  return {
    schemaVersion: 1,
    subject: "Preflight frontend",
    decision: "How should the supplied content share space?",
    audience: "Preflight operator",
    productJob: "Validate controller contracts",
    contentIds: ["primary", "detail"],
    requiredStates: [{ id: "typical", description: "Typical state", userNeed: "Read the result" }],
    evidence: [{ id: "prepared-evidence", kind: "constraint", reference: "prepared", observation: "Synthetic preflight evidence" }],
    constraints: ["No model turn may start"],
  };
}

function composeRequest(): ComposeRefineRequest {
  return {
    schemaVersion: 1,
    objective: "Validate compose schemas",
    baselineRevision: "a".repeat(40),
    approvedCandidateReference: `sha256:${"b".repeat(64)}`,
    approvedCandidatePath: "evidence/candidate.json",
    specificationPath: "evidence/specification.md",
    specificationSha256: "c".repeat(64),
    writablePaths: ["src/frontend.tsx"],
    verificationChecks: ["typecheck"],
    renderStates: [{ id: "typical", beforeReference: "before/typical.png", screenshotName: "typical.png", observation: "Typical state" }],
    constraints: ["No model turn may start"],
    repairBudget: 1,
  };
}

function pass(id: FrontendWorkflowPreflightCheckId, summary: string): FrontendWorkflowPreflightCheck {
  return { id, ok: true, summary, diagnostics: [] };
}

function fail(id: FrontendWorkflowPreflightCheckId, summary: string, error: unknown): FrontendWorkflowPreflightCheck {
  return { id, ok: false, summary, diagnostics: [error instanceof Error ? error.message : String(error)] };
}

function stringArray(value: JsonValue, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must contain strings`);
  }
  return value as readonly string[];
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
