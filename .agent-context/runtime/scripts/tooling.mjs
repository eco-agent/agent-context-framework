import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function typescriptCli() {
  const executable = path.join(
    runtimeRoot,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  if (!existsSync(executable)) {
    throw new Error(
      "Runtime dependencies are missing. Bootstrap .agent-context/runtime before building.",
    );
  }
  return executable;
}
