import type { CheckId, CheckResult } from "./model.js";

export async function runInternalCheck(
  id: CheckId,
  action: () => Promise<readonly string[]>,
): Promise<CheckResult> {
  const started = performance.now();
  try {
    const diagnostics = await action();
    return {
      id,
      ok: diagnostics.length === 0,
      durationMs: Math.round(performance.now() - started),
      summary: diagnostics.length === 0 ? `${id} passed.` : `${id} found ${diagnostics.length} issue(s).`,
      diagnostics: diagnostics.slice(0, 20),
    };
  } catch (error) {
    return {
      id,
      ok: false,
      durationMs: Math.round(performance.now() - started),
      summary: `${id} could not run.`,
      diagnostics: [error instanceof Error ? error.message : String(error)],
    };
  }
}
