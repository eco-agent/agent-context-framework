import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckId, CheckResult } from "./model.js";

type RegisteredCommandId = Extract<CheckId, "test" | "typecheck" | "workflow-test">;

interface RegisteredCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

function pnpmCommand(...args: readonly string[]): Pick<RegisteredCommand, "args" | "executable"> {
  if (process.platform === "win32") {
    return {
      executable: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm", ...args],
    };
  }
  return { executable: "pnpm", args };
}

const commandRegistry: Readonly<Record<RegisteredCommandId, RegisteredCommand>> = {
  typecheck: {
    ...pnpmCommand("typecheck"),
    timeoutMs: 120_000,
  },
  test: {
    ...pnpmCommand("test"),
    timeoutMs: 120_000,
  },
  "workflow-test": {
    ...pnpmCommand("workflow:test"),
    timeoutMs: 120_000,
  },
};

export async function runRegisteredCommand(
  root: string,
  id: RegisteredCommandId,
  runDirectory: string,
): Promise<CheckResult> {
  const command = commandRegistry[id];
  const started = performance.now();
  const artifact = path.posix.join(".codex", "artifacts", runDirectory, `${id}.log`);
  const artifactPath = path.join(root, artifact);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    `$ ${command.executable} ${command.args.join(" ")}\n\n`,
    "utf8",
  );
  const outcome = await execute(root, command, artifactPath);

  return {
    id,
    ok: outcome.exitCode === 0,
    durationMs: Math.round(performance.now() - started),
    summary: outcome.exitCode === 0 ? `${id} passed.` : `${id} exited with code ${outcome.exitCode}.`,
    diagnostics: outcome.exitCode === 0 ? [] : [`See ${artifact}.`],
    artifact,
  };
}

interface ProcessOutcome {
  readonly exitCode: number;
}

async function execute(
  root: string,
  command: RegisteredCommand,
  artifactPath: string,
): Promise<ProcessOutcome> {
  return await new Promise<ProcessOutcome>((resolve) => {
    const log = createWriteStream(artifactPath, { flags: "a" });
    const child = spawn(command.executable, command.args, {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      windowsHide: true,
    });
    let timedOut = false;
    let completed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, command.timeoutMs);

    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", (error) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      log.end(`\n${error.message}\n`, () => {
        resolve({ exitCode: 1 });
      });
    });
    child.on("close", (code) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      log.end(timedOut ? "\nCommand timed out.\n" : "", () => {
        resolve({
          exitCode: timedOut ? 124 : (code ?? 1),
        });
      });
    });
  });
}
