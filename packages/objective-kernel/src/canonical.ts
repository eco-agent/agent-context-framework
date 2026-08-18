import { canonicalize } from "json-canonicalize";
import type { ObjectiveCommand } from "./contracts.js";

export const OBJECTIVE_COMMAND_CANONICALIZATION = "rfc8785";
export const OBJECTIVE_COMMAND_DIGEST_ALGORITHM = "sha256";

export function canonicalizeObjectiveCommand(command: ObjectiveCommand): string {
  return canonicalize(command);
}

export function formatCommandDigest(hexDigest: string): string {
  if (!/^[0-9a-f]{64}$/u.test(hexDigest)) {
    throw new TypeError("Expected a lowercase SHA-256 hexadecimal digest.");
  }
  return `sha256:${hexDigest}`;
}
