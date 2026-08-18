import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export async function findWorkspaceRoot(start: string): Promise<string> {
  let candidate = path.resolve(start);
  for (;;) {
    if (await exists(path.join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`Cannot find pnpm-workspace.yaml above ${start}.`);
    }
    candidate = parent;
  }
}

export async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(candidate: string): Promise<unknown> {
  return JSON.parse(await readFile(candidate, "utf8")) as unknown;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): Promise<string> {
  const result = await execFileAsync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeoutMs ?? 30_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

export function platformCommand(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

export async function runPnpm(
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): Promise<string> {
  if (process.platform !== "win32") {
    return await runCommand("pnpm", args, options);
  }
  if (args.some((argument) => !/^[A-Za-z0-9_@./:=+?&%,-]+$/u.test(argument))) {
    throw new Error("pnpm argument contains unsupported command-shell characters.");
  }
  const commandProcessor = process.env.ComSpec;
  if (!commandProcessor) {
    throw new Error("ComSpec is unavailable.");
  }
  return await runCommand(
    commandProcessor,
    ["/d", "/s", "/c", `pnpm ${args.join(" ")}`],
    options,
  );
}

export function assertPathWithin(parent: string, candidate: string): string {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (
    relative.length === 0 ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${resolvedCandidate} must be below ${resolvedParent}.`);
  }
  return resolvedCandidate;
}
