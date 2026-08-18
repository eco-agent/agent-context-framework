#!/usr/bin/env node

import { findWorkspaceRoot } from "./workspace.js";
import { materializeProductPrecedent } from "./product-precedent-materializer.js";

const args = process.argv.slice(2).filter((value) => value !== "--");
const contract = argumentValue(args, "--contract");
if (contract === undefined) {
  throw new Error("Usage: product-precedent-materialize --contract <implementation-contract.json>");
}
const root = await findWorkspaceRoot(process.cwd());
const result = await materializeProductPrecedent(root, contract);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function argumentValue(values: readonly string[], name: string): string | undefined {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}
