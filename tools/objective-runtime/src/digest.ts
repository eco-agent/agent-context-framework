import { createHash } from "node:crypto";
import {
  canonicalizeObjectiveCommand,
  formatCommandDigest,
  type ObjectiveCommand,
} from "@agent-context/objective-kernel";

export function digestObjectiveCommand(command: ObjectiveCommand): string {
  return formatCommandDigest(
    createHash("sha256").update(canonicalizeObjectiveCommand(command)).digest("hex"),
  );
}
