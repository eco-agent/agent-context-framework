import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkContextRegistry,
  writeContextRegistry,
} from "./context-registry-builder.js";
import { findWorkspaceRoot } from "./workspace.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "build" && command !== "check") {
    throw new Error("Usage: context-registry <build|check>.");
  }
  const root = await findWorkspaceRoot(process.cwd());
  const registry = command === "build"
    ? await writeContextRegistry(root)
    : await checkContextRegistry(root);
  console.log(`${command}: registry ${registry.revision} (${registry.components.length} components)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
