import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  generateTestApplicationFixture,
  type TestApplicationAcfState,
  type TestApplicationGitState,
} from "./test-application-fixture.js";

interface TestApplicationFixtureArguments {
  readonly outputRoot: string;
  readonly gitState: TestApplicationGitState;
  readonly acfState: TestApplicationAcfState;
  readonly replace: boolean;
  readonly json: boolean;
}

export const TEST_APPLICATION_FIXTURE_HELP = `ACF test application generator

Usage:
  pnpm fixture:test-app -- --output <absolute-path> [--state clean|dirty] [--acf none|core|capsule] [--replace] [--json]

The command creates a deterministic Git repository. A dirty fixture contains one
tracked application edit and one untracked note. --replace works only when the
target contains the ACF fixture marker.`;

export function parseTestApplicationFixtureArguments(
  arguments_: readonly string[],
): TestApplicationFixtureArguments {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  let outputRoot: string | null = null;
  let gitState: TestApplicationGitState = "clean";
  let acfState: TestApplicationAcfState = "none";
  let replace = false;
  let json = false;
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--output") {
      const value = values[index + 1];
      if (value === undefined) throw new Error("--output requires an absolute path.");
      if (outputRoot !== null) throw new Error("--output may be specified only once.");
      outputRoot = value;
      index += 1;
    } else if (argument === "--state") {
      const value = values[index + 1];
      if (value !== "clean" && value !== "dirty") {
        throw new Error("--state must be clean or dirty.");
      }
      gitState = value;
      index += 1;
    } else if (argument === "--acf") {
      const value = values[index + 1];
      if (value !== "none" && value !== "core" && value !== "capsule") {
        throw new Error("--acf must be none, core, or capsule.");
      }
      acfState = value;
      index += 1;
    } else if (argument === "--replace") {
      if (replace) throw new Error("--replace may be specified only once.");
      replace = true;
    } else if (argument === "--json") {
      if (json) throw new Error("--json may be specified only once.");
      json = true;
    } else if (argument === "--help" || argument === "-h") {
      throw new Error(TEST_APPLICATION_FIXTURE_HELP);
    } else {
      throw new Error(`Unknown fixture argument ${argument ?? ""}.`);
    }
  }
  if (outputRoot === null) throw new Error("--output requires an absolute path.");
  if (!path.isAbsolute(outputRoot)) throw new Error("--output requires an absolute path.");
  return { outputRoot, gitState, acfState, replace, json };
}

export async function runTestApplicationFixtureCli(arguments_: readonly string[]): Promise<void> {
  const request = parseTestApplicationFixtureArguments(arguments_);
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frameworkRoot = path.resolve(moduleDirectory, "../../..");
  const result = await generateTestApplicationFixture({
    frameworkRoot,
    outputRoot: request.outputRoot,
    gitState: request.gitState,
    acfState: request.acfState,
    replace: request.replace,
  });
  if (request.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Generated ${result.gitState} ACF test application at ${result.outputRoot}.`,
      `ACF state: ${result.acfState}.`,
      `Baseline revision: ${result.baselineRevision}.`,
      result.installationRevision === null
        ? "Installation revision: none."
        : `Installation revision: ${result.installationRevision}.`,
      result.status.length === 0
        ? "Git status: clean."
        : `Git status:\n${result.status.join("\n")}`,
    ].join("\n") + "\n",
  );
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href) {
  runTestApplicationFixtureCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
