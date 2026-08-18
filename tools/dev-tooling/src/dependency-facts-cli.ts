import {
  collectDependencyFacts,
  compareAdoptionRecord,
} from "./dependency-facts.js";
import { findWorkspaceRoot } from "./workspace.js";

const args = process.argv.slice(2).filter((value) => value !== "--");
const packageSpec = args.find((value) => !value.startsWith("--"));
if (!packageSpec) {
  throw new Error(
    "Usage: pnpm dependency:facts -- <name>@<version> [--compare <record>]",
  );
}
const compareIndex = args.indexOf("--compare");
const comparePath =
  compareIndex === -1 ? undefined : args[compareIndex + 1];
const root = await findWorkspaceRoot(process.cwd());
const facts = await collectDependencyFacts(packageSpec);
const comparison =
  comparePath === undefined
    ? undefined
    : await compareAdoptionRecord(root, comparePath, facts);
process.stdout.write(
  `${JSON.stringify(
    comparison === undefined ? { facts } : { facts, comparison },
    null,
    2,
  )}\n`,
);
if (comparison !== undefined && !comparison.matches) {
  process.exitCode = 1;
}
