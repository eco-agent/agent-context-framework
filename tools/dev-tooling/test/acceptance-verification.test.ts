import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acceptanceProcessExecutor,
  verifyAcceptanceSequence,
  type AcceptanceCommandExecutor,
  type AcceptanceProcessExecution,
  type AcceptanceProcessRequest,
} from "../src/acceptance-verification.js";
import { parseAcceptanceVerificationArguments } from "../src/acceptance-verification-cli.js";

const FRAMEWORK_REVISION = "a".repeat(40);
const FIXTURE_REVISION = "b".repeat(40);

test("acceptance verification runs each proof layer once in order", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(fixture.framework, fixture.downstream);
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "passed");
    assert.deepEqual(
      result.stages.map((stage) => [stage.id, stage.status]),
      [
        ["workspace", "passed"],
        ["isolation", "passed"],
        ["downstream", "passed"],
      ],
    );
    assert.deepEqual(executor.proofCalls, [
      "typecheck",
      "test",
      "check",
      "registry:check",
      "verify:isolation",
      "downstream-policy",
    ]);
    assert.equal(result.framework?.revision, FRAMEWORK_REVISION);
    assert.equal(result.fixture?.revision, FIXTURE_REVISION);
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification stops after the first failed proof stage", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(
    fixture.framework,
    fixture.downstream,
    "verify:isolation",
  );
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "failed");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "isolation");
    assert.deepEqual(
      result.stages.map((stage) => [stage.id, stage.status]),
      [
        ["workspace", "passed"],
        ["isolation", "failed"],
        ["downstream", "not-run"],
      ],
    );
    assert.deepEqual(executor.proofCalls, [
      "typecheck",
      "test",
      "check",
      "registry:check",
      "verify:isolation",
    ]);
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification stops within the workspace stage", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(
    fixture.framework,
    fixture.downstream,
    "test",
  );
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "failed");
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "workspace");
    assert.deepEqual(executor.proofCalls, ["typecheck", "test"]);
    assert.deepEqual(
      result.stages.map((stage) => [stage.id, stage.status]),
      [
        ["workspace", "failed"],
        ["isolation", "not-run"],
        ["downstream", "not-run"],
      ],
    );
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification refuses a dirty framework before proofs run", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(
    fixture.framework,
    fixture.downstream,
    null,
    fixture.framework,
  );
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "failed");
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "preflight");
    assert.match(result.failure.detail, /must be clean/u);
    assert.equal(executor.proofCalls.length, 0);
    assert.equal(result.stages.every((stage) => stage.status === "not-run"), true);
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification requires a distinct downstream worktree", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(fixture.framework, fixture.framework);
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.framework },
      executor,
    );
    assert.equal(result.status, "failed");
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "preflight");
    assert.match(result.failure.detail, /different Git worktree/u);
    assert.equal(executor.proofCalls.length, 0);
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification rejects a revision change during the sequence", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(
    fixture.framework,
    fixture.downstream,
    null,
    null,
    fixture.framework,
  );
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "failed");
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "postflight");
    assert.match(result.failure.detail, /revision changed/u);
    assert.equal(result.stages.every((stage) => stage.status === "passed"), true);
  } finally {
    await fixture.remove();
  }
});

test("acceptance verification reports postflight mutation after a proof failure", async () => {
  const fixture = await createRoots();
  const executor = new SequencedExecutor(
    fixture.framework,
    fixture.downstream,
    "test",
    null,
    null,
    fixture.framework,
  );
  try {
    const result = await verifyAcceptanceSequence(
      { frameworkRoot: fixture.framework, fixtureRoot: fixture.downstream },
      executor,
    );
    assert.equal(result.status, "failed");
    if (result.ok) throw new Error("Expected failed acceptance result.");
    assert.equal(result.failure.phase, "postflight");
    assert.match(result.failure.detail, /Command test exited with code 1/u);
    assert.match(result.failure.detail, /postflight also failed/u);
    assert.match(result.failure.detail, /must be clean/u);
  } finally {
    await fixture.remove();
  }
});

test("acceptance CLI requires one absolute downstream fixture path", () => {
  const fixture = path.resolve("fixture");
  assert.deepEqual(parseAcceptanceVerificationArguments(["--fixture", fixture]), {
    fixtureRoot: fixture,
  });
  assert.deepEqual(parseAcceptanceVerificationArguments(["--", "--fixture", fixture]), {
    fixtureRoot: fixture,
  });
  assert.throws(
    () => parseAcceptanceVerificationArguments(["--fixture", "relative"]),
    /absolute path/u,
  );
  assert.throws(
    () => parseAcceptanceVerificationArguments([]),
    /Usage/u,
  );
});

test("acceptance process execution retains a disclosed bounded failure tail", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "acceptance-output-"));
  try {
    const result = await acceptanceProcessExecutor.run({
      file: process.execPath,
      arguments: [
        "-e",
        'process.stdout.write("x".repeat(40000)); process.stderr.write("y".repeat(41000)); process.exitCode = 1;',
      ],
      cwd: root,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdoutBytes, 40_000);
    assert.equal(result.stderrBytes, 41_000);
    assert.equal(Buffer.byteLength(result.stdout), 32_768);
    assert.equal(Buffer.byteLength(result.stderr), 32_768);
    assert.equal(result.outputTruncated, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class SequencedExecutor implements AcceptanceCommandExecutor {
  readonly proofCalls: string[] = [];
  readonly #headReads = new Map<string, number>();

  constructor(
    private readonly frameworkRoot: string,
    private readonly fixtureRoot: string,
    private readonly failedProof: string | null = null,
    private readonly dirtyRoot: string | null = null,
    private readonly changedRevisionRoot: string | null = null,
    private readonly dirtyAfterProofRoot: string | null = null,
  ) {}

  async run(request: AcceptanceProcessRequest): Promise<AcceptanceProcessExecution> {
    if (request.file === "git") return this.#git(request);
    const proof = proofId(request);
    this.proofCalls.push(proof);
    return execution(
      proof === this.failedProof ? 1 : 0,
      proof === this.failedProof ? "proof failed" : "",
    );
  }

  #git(request: AcceptanceProcessRequest): AcceptanceProcessExecution {
    const command = request.arguments.join(" ");
    if (command === "rev-parse --show-toplevel") {
      return execution(0, "", `${request.cwd}\n`);
    }
    if (command === "status --porcelain=v1 --untracked-files=all") {
      const dirty = request.cwd === this.dirtyRoot ||
        (request.cwd === this.dirtyAfterProofRoot && this.proofCalls.length > 0);
      return execution(0, "", dirty ? " M changed.ts\n" : "");
    }
    if (command === "rev-parse HEAD") {
      const reads = (this.#headReads.get(request.cwd) ?? 0) + 1;
      this.#headReads.set(request.cwd, reads);
      const initial = request.cwd === this.frameworkRoot
        ? FRAMEWORK_REVISION
        : FIXTURE_REVISION;
      const revision = request.cwd === this.changedRevisionRoot && reads > 1
        ? "c".repeat(40)
        : initial;
      return execution(0, "", `${revision}\n`);
    }
    return execution(1, `Unexpected Git command: ${command}`);
  }
}

function proofId(request: AcceptanceProcessRequest): string {
  if (request.file === process.execPath) return "downstream-policy";
  const command = request.arguments.join(" ");
  for (const id of ["registry:check", "verify:isolation", "typecheck", "test", "check"]) {
    if (command.includes(id)) return id;
  }
  throw new Error(`Unexpected proof command: ${command}`);
}

function execution(
  exitCode: number,
  stderr = "",
  stdout = "",
): AcceptanceProcessExecution {
  return {
    exitCode,
    durationMs: 1,
    stdout,
    stderr,
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    outputTruncated: false,
    error: null,
  };
}

async function createRoots(): Promise<{
  readonly framework: string;
  readonly downstream: string;
  readonly remove: () => Promise<void>;
}> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "acceptance-verification-"));
  const framework = await mkdtemp(path.join(parent, "framework-"));
  const downstream = await mkdtemp(path.join(parent, "downstream-"));
  await writeFile(
    path.join(framework, "package.json"),
    '{"packageManager":"pnpm@10.22.0"}\n',
    "utf8",
  );
  return {
    framework,
    downstream,
    remove: async () => await rm(parent, { recursive: true, force: true }),
  };
}
