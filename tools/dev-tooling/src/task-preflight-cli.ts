import { collectTaskPreflight, formatTaskPreflight } from "./task-preflight.js";
import { findWorkspaceRoot } from "./workspace.js";

const args = process.argv.slice(2).filter((value) => value !== "--");
const request = argumentValue(args, "--request");
if (!request) {
  throw new Error(
    "Usage: pnpm task:doctor -- --request <path> [--json]",
  );
}
const root = await findWorkspaceRoot(process.cwd());
const result = await collectTaskPreflight(root, request);
process.stdout.write(
  args.includes("--json")
    ? `${JSON.stringify(result, null, 2)}\n`
    : `${formatTaskPreflight(result)}\n`,
);

function argumentValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
