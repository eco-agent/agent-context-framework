import path from "node:path";

import { verifyInstalledCodexRuntime } from "./codex-runtime-verification.js";

const rootIndex = process.argv.indexOf("--root");
const candidate = rootIndex >= 0 ? process.argv[rootIndex + 1] : undefined;
if (!candidate || !path.isAbsolute(candidate)) throw new Error("Usage: codex-runtime-verification --root <absolute-project-root>");
console.log(JSON.stringify(await verifyInstalledCodexRuntime(candidate)));
