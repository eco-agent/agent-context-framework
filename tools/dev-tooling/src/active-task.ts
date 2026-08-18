import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeActiveTaskBinding,
  decodeCapabilityRequest,
  decodeImplementationContract,
  decodeProductPrecedentMaterialization,
  type ActiveTaskAttemptBinding,
  type ActiveTaskBinding,
  type ActiveTaskSessionBinding,
  type CapabilityRequest,
  type ImplementationContractV2,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import { VerifiedProductPrecedentMaterializationV2 } from "@agent-context/codex-workflows";

import { readJson, runCommand } from "./workspace.js";

export interface ActiveTaskActivation<TBinding extends ActiveTaskBinding = ActiveTaskBinding> {
  readonly binding: TBinding;
  readonly bindingPath: string;
}

export interface TaskSourceBinding {
  readonly requestPath: string;
  readonly requestHash: string;
  readonly contractPath: string;
  readonly contractHash: string;
  readonly implementationContract: {
    readonly path: string;
    readonly hash: string;
  } | null;
  readonly productPrecedentMaterialization: {
    readonly path: string;
    readonly hash: string;
  } | null;
  readonly baselineRevision: string;
}

export interface PreparedTaskActivation {
  readonly capability: CapabilityRequest;
  readonly implementationContract: ImplementationContractV2 | null;
  readonly productPrecedentMaterialization: ProductPrecedentMaterializationV2 | null;
  readonly binding: TaskSourceBinding;
}

export async function prepareTaskActivation(
  root: string,
  requestPath: string,
): Promise<PreparedTaskActivation> {
  const request = await repositoryFile(root, requestPath, "request");
  const capability = decodeCapabilityRequest(await readJson(request.absolute));
  const contract = await repositoryFile(root, capability.contractPath, "contract");
  const implementationContract = capability.implementationContractPath === undefined
    ? null
    : await repositoryFile(
        root,
        capability.implementationContractPath,
        "implementation contract",
      );
  const [requestHash, contractHash] = await Promise.all([
    fileHash(request.absolute),
    fileHash(contract.absolute),
  ]);
  const implementationBinding = implementationContract === null
    ? null
    : {
        path: implementationContract.relative,
        hash: await fileHash(implementationContract.absolute),
      };
  const decodedImplementationContract = implementationContract === null
    ? null
    : decodeImplementationContract(await readJson(implementationContract.absolute));
  const precedent = decodedImplementationContract?.productPrecedent ?? null;
  const materialization = precedent === null
    ? null
    : await repositoryFile(root, precedent.materializationPath, "product precedent materialization");
  const decodedMaterialization = materialization === null
    ? null
    : decodeProductPrecedentMaterialization(await readJson(materialization.absolute));
  if (decodedImplementationContract !== null && decodedMaterialization !== null) {
    await VerifiedProductPrecedentMaterializationV2.create(
      root,
      decodedImplementationContract,
      decodedMaterialization,
    );
  }
  return {
    capability,
    implementationContract: decodedImplementationContract,
    productPrecedentMaterialization: decodedMaterialization,
    binding: {
      requestPath: request.relative,
      requestHash,
      contractPath: contract.relative,
      contractHash,
      implementationContract: implementationBinding,
      productPrecedentMaterialization: materialization === null
        ? null
        : {
            path: materialization.relative,
            hash: await fileHash(materialization.absolute),
          },
      baselineRevision: capability.baselineRevision,
    },
  };
}

export async function activateTaskAttempt(
  root: string,
  binding: ActiveTaskAttemptBinding,
): Promise<ActiveTaskActivation<ActiveTaskAttemptBinding>> {
  const decoded = decodeActiveTaskBinding(binding);
  if (decoded.state !== "attempt") {
    throw new Error("Active task attempt binding decoded as a session binding.");
  }
  await validateBindingSources(root, decoded);
  const bindingPath = await activeTaskCurrentPath(root);
  await writeBinding(bindingPath, decoded);
  return { binding: decoded, bindingPath };
}

export async function bindActiveTaskSession(
  root: string,
  attempt: ActiveTaskAttemptBinding,
  sessionId: string,
): Promise<ActiveTaskActivation<ActiveTaskSessionBinding>> {
  assertSessionId(sessionId);
  const binding: ActiveTaskSessionBinding = {
    ...attempt,
    state: "session",
    sessionId,
  };
  const decoded = decodeActiveTaskBinding(binding);
  if (decoded.state !== "session") {
    throw new Error("Active task session binding decoded as an attempt binding.");
  }
  await validateBindingSources(root, decoded);
  const bindingPath = await activeTaskBindingPath(root, sessionId);
  await writeBinding(bindingPath, decoded);
  return { binding: decoded, bindingPath };
}

export async function releaseActiveTaskAttempt(
  root: string,
  attempt: ActiveTaskAttemptBinding,
): Promise<void> {
  const currentPath = await activeTaskCurrentPath(root);
  try {
    const current = decodeActiveTaskBinding(await readJson(currentPath));
    if (
      current.objectiveId === attempt.objectiveId &&
      current.leaseId === attempt.leaseId &&
      current.runId === attempt.runId
    ) {
      await rm(currentPath, { force: true });
    }
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

export async function loadActiveTask(
  root: string,
  sessionId?: string,
): Promise<ActiveTaskActivation | null> {
  const bindingPath = sessionId === undefined
    ? await activeTaskCurrentPath(root)
    : await activeTaskBindingPath(root, sessionId);
  try {
    const binding = decodeActiveTaskBinding(await readJson(bindingPath));
    if (
      sessionId !== undefined &&
      (binding.state !== "session" || binding.sessionId !== sessionId)
    ) {
      throw new Error("Active task session binding does not match its filename.");
    }
    await validateBindingSources(root, binding);
    return { binding, bindingPath };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function activeTaskBindingPath(
  root: string,
  sessionId: string,
): Promise<string> {
  assertSessionId(sessionId);
  return path.join(await activeTaskGitDirectory(root), "codex", "active-tasks", `${sessionId}.json`);
}

export async function activeTaskCurrentPath(root: string): Promise<string> {
  return path.join(await activeTaskGitDirectory(root), "codex", "active-task.json");
}

export async function activeTaskGitDirectory(root: string): Promise<string> {
  const dotGit = path.join(root, ".git");
  if ((await stat(dotGit)).isDirectory()) return dotGit;
  const declaration = (await readFile(dotGit, "utf8")).trim();
  const match = /^gitdir:\s*(.+)$/iu.exec(declaration);
  if (match?.[1] === undefined) {
    throw new Error("Worktree .git file is invalid.");
  }
  return path.resolve(root, match[1]);
}

export async function validateTaskBaseline(
  root: string,
  capability: CapabilityRequest,
): Promise<void> {
  try {
    await runCommand(
      "git",
      ["merge-base", "--is-ancestor", capability.baselineRevision, "HEAD"],
      { cwd: root },
    );
  } catch {
    throw new Error(
      `Capability baseline ${capability.baselineRevision} is not an ancestor of HEAD.`,
    );
  }
}

async function validateBindingSources(
  root: string,
  binding: ActiveTaskBinding,
): Promise<void> {
  if (path.resolve(root) !== path.resolve(binding.executionDirectory)) {
    throw new Error("Active task execution directory does not match its repository root.");
  }
  const request = await repositoryFile(root, binding.requestPath, "request");
  const capability = decodeCapabilityRequest(await readJson(request.absolute));
  const contract = await repositoryFile(root, binding.contractPath, "contract");
  const implementationContract = binding.implementationContract === null
    ? null
    : await repositoryFile(
        root,
        binding.implementationContract.path,
        "implementation contract",
      );
  const productPrecedentMaterialization = binding.productPrecedentMaterialization === null
    ? null
    : await repositoryFile(
        root,
        binding.productPrecedentMaterialization.path,
        "product precedent materialization",
      );
  if (
    capability.objectiveId !== binding.objectiveId ||
    capability.contractPath !== contract.relative ||
    capability.baselineRevision !== binding.baselineRevision ||
    (capability.implementationContractPath ?? null) !==
      (implementationContract?.relative ?? null)
  ) {
    throw new Error("Active task sources do not match the leased objective binding.");
  }
  if (
    await fileHash(request.absolute) !== binding.requestHash ||
    await fileHash(contract.absolute) !== binding.contractHash ||
    (implementationContract !== null &&
      await fileHash(implementationContract.absolute) !== binding.implementationContract?.hash)
    ||
    (productPrecedentMaterialization !== null &&
      await fileHash(productPrecedentMaterialization.absolute) !==
        binding.productPrecedentMaterialization?.hash)
  ) {
    throw new Error("Active task source changed after attempt projection.");
  }
}

async function writeBinding(
  bindingPath: string,
  binding: ActiveTaskBinding,
): Promise<void> {
  await mkdir(path.dirname(bindingPath), { recursive: true });
  const temporaryPath = `${bindingPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(binding)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, bindingPath);
}

async function repositoryFile(
  root: string,
  candidate: string,
  label: string,
): Promise<{ readonly absolute: string; readonly relative: string }> {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Task ${label} must be a repository file.`);
  }
  if (!(await stat(absolute)).isFile()) {
    throw new Error(`Task ${label} must be a file.`);
  }
  return { absolute, relative: relative.replaceAll("\\", "/") };
}

async function fileHash(candidate: string): Promise<string> {
  return createHash("sha256").update(await readFile(candidate)).digest("hex");
}

function assertSessionId(value: string): void {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error("Session ID contains unsupported characters.");
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
