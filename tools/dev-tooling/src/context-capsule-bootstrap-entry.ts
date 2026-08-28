import { bootstrapContextCapsule } from "./context-capsule-bootstrap.js";

interface BootstrapArguments {
  readonly projectRoot: string;
  readonly json: boolean;
}

function parseArguments(values: readonly string[]): BootstrapArguments {
  let projectRoot = process.cwd();
  let projectRootSet = false;
  let json = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cwd") {
      if (projectRootSet) throw new Error("--cwd may be specified only once.");
      const next = values[index + 1];
      if (next === undefined) throw new Error("--cwd requires a project path.");
      projectRoot = next;
      projectRootSet = true;
      index += 1;
    } else if (value === "--json") {
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else {
      throw new Error(`Unknown bootstrap argument ${value ?? ""}.`);
    }
  }
  return { projectRoot, json };
}

try {
  const request = parseArguments(process.argv.slice(2));
  const result = await bootstrapContextCapsule(request.projectRoot);
  const output = request.json
    ? JSON.stringify(result, null, 2)
    : [
        `project: ${result.projectRoot}`,
        `capsule: ${result.capsulePath}`,
        `recovery: ${result.recovery.status}`,
        `materialization: ${result.materialization.status}`,
        ...result.materialization.conflicts.map((conflict) =>
          `conflict ${conflict.targetPath}: ${conflict.detail}`),
      ].join("\n");
  process.stdout.write(`${output}\n`);
  if (result.materialization.status === "blocked") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
