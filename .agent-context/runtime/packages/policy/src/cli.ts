#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { realpath } from "node:fs/promises";

import {
  checkContextGovernance,
  decodeContextRegistry,
  discoverWorkspaceUnits,
} from "./index.js";

try {
  const request = parseArguments(process.argv.slice(2));
  const root = await realpath(request.root);
  if (request.operation === "inspect-workspace") {
    process.stdout.write(`${JSON.stringify(await discoverWorkspaceUnits(root), undefined, 2)}\n`);
  } else {
    const registry = decodeContextRegistry(
      JSON.parse(await readFile(repositoryPath(root, request.registryPath), "utf8")) as unknown,
    );
    if (request.operation === "check-governance") {
      await checkContextGovernance(root, registry);
    }
    process.stdout.write(
      `${JSON.stringify({
        operation: request.operation,
        registryRevision: registry.revision,
        components: registry.components.length,
        ok: true,
      })}\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

type PolicyCliRequest =
  | { readonly operation: "inspect-workspace"; readonly root: string }
  | {
      readonly operation: "check-registry" | "check-governance";
      readonly root: string;
      readonly registryPath: string;
    };

function parseArguments(arguments_: readonly string[]): PolicyCliRequest {
  const [operation, ...rest] = arguments_;
  if (
    operation !== "inspect-workspace" &&
    operation !== "check-registry" &&
    operation !== "check-governance"
  ) {
    throw new Error(
      "First argument must be inspect-workspace, check-registry, or check-governance.",
    );
  }
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (
      (name !== "--root" && name !== "--registry") ||
      value === undefined
    ) {
      throw new Error(`Invalid argument: ${name ?? ""}.`);
    }
    values.set(name, value);
  }
  const root = values.get("--root");
  if (root === undefined || root.length === 0) {
    throw new Error("--root is required.");
  }
  if (operation === "inspect-workspace") {
    if (values.has("--registry")) {
      throw new Error("--registry is not valid for inspect-workspace.");
    }
    return { operation, root };
  }
  return {
    operation,
    root,
    registryPath: values.get("--registry") ?? "registry/registry.json",
  };
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
