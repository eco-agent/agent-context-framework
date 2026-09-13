#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  checkContextGovernance,
  decodeContextRegistry,
  discoverWorkspaceUnits,
  doctorRepositoryPolicy,
  inspectRepository,
  REPOSITORY_POLICY_CONFIG_PATH,
  REPOSITORY_POLICY_INVARIANTS_PATH,
  verifyRepositoryPolicy,
} from "./index.js";

try {
  const request = parseArguments(process.argv.slice(2));
  const result = await dispatch(request);
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
  process.exitCode = "ok" in result && result.ok === false ? 1 : 0;
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      operation: process.argv[2] ?? "unknown",
      ok: false,
      status: "invalid",
      diagnostics: [error instanceof Error ? error.message : String(error)],
    })}\n`,
  );
  process.exitCode = 1;
}

type PolicyCliRequest =
  | { readonly operation: "inspect" | "inspect-workspace"; readonly root: string }
  | {
      readonly operation: "doctor";
      readonly root: string;
      readonly configPath: string;
      readonly invariantPath: string;
    }
  | {
      readonly operation: "verify";
      readonly root: string;
      readonly configPath: string;
      readonly invariantPath: string;
      readonly profile: string | null;
    }
  | {
      readonly operation: "check-registry" | "check-governance";
      readonly root: string;
      readonly registryPath: string;
    };

async function dispatch(request: PolicyCliRequest): Promise<object> {
  const root = await realpath(request.root);
  switch (request.operation) {
    case "inspect":
      return await inspectRepository(root);
    case "inspect-workspace":
      return await discoverWorkspaceUnits(root);
    case "doctor":
      return await doctorRepositoryPolicy(root, request.configPath, request.invariantPath);
    case "verify":
      return await verifyRepositoryPolicy(
        root,
        request.profile,
        request.configPath,
        request.invariantPath,
      );
    case "check-registry":
    case "check-governance": {
      const registry = decodeContextRegistry(
        JSON.parse(await readFile(repositoryPath(root, request.registryPath), "utf8")) as unknown,
      );
      if (request.operation === "check-governance") {
        await checkContextGovernance(root, registry);
      }
      return {
        operation: request.operation,
        registryRevision: registry.revision,
        components: registry.components.length,
        ok: true,
      };
    }
  }
}

function parseArguments(arguments_: readonly string[]): PolicyCliRequest {
  const operation = arguments_[0];
  if (
    operation !== "inspect" &&
    operation !== "inspect-workspace" &&
    operation !== "doctor" &&
    operation !== "verify" &&
    operation !== "check-registry" &&
    operation !== "check-governance"
  ) {
    throw new Error(
      "First argument must be inspect, inspect-workspace, doctor, verify, check-registry, or check-governance.",
    );
  }
  const values = optionValues(arguments_.slice(1));
  const root = values.get("--root");
  if (root === undefined || root.length === 0) {
    throw new Error("--root is required.");
  }
  if (operation === "inspect" || operation === "inspect-workspace") {
    requireOnly(values, ["--root"], operation);
    return { operation, root };
  }
  if (operation === "check-registry" || operation === "check-governance") {
    requireOnly(values, ["--root", "--registry"], operation);
    return {
      operation,
      root,
      registryPath: values.get("--registry") ?? "registry/registry.json",
    };
  }
  requireOnly(
    values,
    operation === "verify"
      ? ["--root", "--config", "--invariants", "--profile"]
      : ["--root", "--config", "--invariants"],
    operation,
  );
  const configPath = values.get("--config") ?? REPOSITORY_POLICY_CONFIG_PATH;
  const invariantPath = values.get("--invariants") ?? REPOSITORY_POLICY_INVARIANTS_PATH;
  return operation === "doctor"
    ? { operation, root, configPath, invariantPath }
    : {
        operation,
        root,
        configPath,
        invariantPath,
        profile: values.get("--profile") ?? null,
      };
}

function optionValues(arguments_: readonly string[]): ReadonlyMap<string, string> {
  if (arguments_.length % 2 !== 0) {
    throw new Error(`Invalid argument: ${arguments_.at(-1) ?? ""}.`);
  }
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined || value.length === 0) {
      throw new Error(`Invalid argument: ${name ?? ""}.`);
    }
    if (values.has(name)) throw new Error(`Duplicate argument: ${name}.`);
    values.set(name, value);
  }
  return values;
}

function requireOnly(
  values: ReadonlyMap<string, string>,
  allowed: readonly string[],
  operation: string,
): void {
  const invalid = [...values.keys()].find((name) => !allowed.includes(name));
  if (invalid !== undefined) throw new Error(`${invalid} is not valid for ${operation}.`);
}

function repositoryPath(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    path.isAbsolute(candidate) ||
    candidate.includes("\\") ||
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Policy path escapes the repository: ${candidate}.`);
  }
  return absolute;
}
