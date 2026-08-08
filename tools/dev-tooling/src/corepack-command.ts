import process from "node:process";

export interface ProcessInvocation {
  readonly file: string;
  readonly arguments: readonly string[];
}

export function corepackInvocation(
  arguments_: readonly string[],
): ProcessInvocation {
  if (process.platform === "win32") {
    if (arguments_.some((argument) => !/^[A-Za-z0-9@./:_-]+$/u.test(argument))) {
      throw new Error("Corepack received an unsafe internal argument.");
    }
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      arguments: [
        "/d",
        "/s",
        "/c",
        ["corepack", ...arguments_].join(" "),
      ],
    };
  }
  return { file: "corepack", arguments: arguments_ };
}
