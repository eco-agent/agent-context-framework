import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  decodeCapabilityRequest,
  decodeImplementationContract,
  decodeProductPrecedentMaterialization,
  validateImplementationSkill,
  type CapabilityRequest,
  type ImplementationContractV2,
  type ObjectiveId,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import { VerifiedProductPrecedentMaterializationV2 } from "@agent-context/codex-workflows";
import {
  exists,
  readJson,
  runCommand,
} from "./workspace.js";

export interface TaskPreflight {
  readonly schemaVersion: 1;
  readonly requestPath: string;
  readonly objectiveId: ObjectiveId;
  readonly objective: string;
  readonly baselineRevision: string;
  readonly baselineIsAncestor: boolean;
  readonly supersedes: readonly {
    readonly requestPath: string;
    readonly objectiveId: ObjectiveId;
  }[];
  readonly verificationProfile: string;
  readonly repairBudget: number;
  readonly implementationContract: {
    readonly path: string;
    readonly contract: ImplementationContractV2;
    readonly materialization: {
      readonly path: string;
      readonly receipt: ProductPrecedentMaterializationV2;
    } | null;
  } | null;
  readonly git: {
    readonly branch: string;
    readonly head: string;
    readonly dirty: boolean;
  };
  readonly references: readonly {
    readonly path: string;
    readonly exists: boolean;
  }[];
  readonly instructions: readonly string[];
  readonly workspacePackages: readonly {
    readonly name: string;
    readonly path: string;
  }[];
  readonly environment: {
    readonly commands: readonly {
      readonly name: string;
      readonly available: boolean;
    }[];
  };
}

export async function collectTaskPreflight(
  root: string,
  requestArgument: string,
  environmentCommands: readonly string[] = ["git", "node", "pnpm"],
): Promise<TaskPreflight> {
  const requestPath = path.resolve(root, requestArgument);
  const request = decodeCapabilityRequest(await readJson(requestPath));
  const head = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["cat-file", "-e", `${request.baselineRevision}^{commit}`]);
  const baselineIsAncestor = await gitSucceeds(root, [
    "merge-base",
    "--is-ancestor",
    request.baselineRevision,
    "HEAD",
  ]);
  const references = await Promise.all(
    request.readableReferences.map(async (reference) => ({
      path: reference,
      exists: await exists(resolveReference(root, reference)),
    })),
  );
  const missingReferences = references.filter((reference) => !reference.exists);
  if (!baselineIsAncestor) {
    throw new Error(
      `Capability baseline ${request.baselineRevision} is not an ancestor of HEAD.`,
    );
  }
  if (missingReferences.length > 0) {
    throw new Error(
      `Missing readable references: ${missingReferences
        .map((reference) => reference.path)
        .join(", ")}.`,
    );
  }
  const supersedes = await collectSupersededRequests(root, request);
  const implementationContract = await collectImplementationContract(root, request);

  return {
    schemaVersion: 1,
    requestPath: path.relative(root, requestPath).replaceAll("\\", "/"),
    objectiveId: request.objectiveId,
    objective: request.objective,
    baselineRevision: request.baselineRevision,
    baselineIsAncestor,
    supersedes,
    verificationProfile: request.verificationProfile,
    repairBudget: request.repairBudget,
    implementationContract,
    git: {
      branch,
      head,
      dirty: (await git(root, ["status", "--porcelain"])).length > 0,
    },
    references,
    instructions: await collectInstructions(root, request.writablePaths),
    workspacePackages: await collectWorkspacePackages(root),
    environment: {
      commands: await Promise.all(
        environmentCommands.map(async (name) => ({
          name,
          available: await commandAvailable(root, name),
        })),
      ),
    },
  };
}

export function formatTaskPreflight(preflight: TaskPreflight): string {
  const lines = [
    `Task: ${preflight.requestPath}`,
    `Objective ID: ${preflight.objectiveId}`,
    `Branch: ${preflight.git.branch || "(detached)"}`,
    `HEAD: ${preflight.git.head}`,
    `Baseline: ${preflight.baselineRevision} (ancestor: yes)`,
    `Working tree: ${preflight.git.dirty ? "dirty" : "clean"}`,
    `Verification: ${preflight.verificationProfile}; repair budget: ${preflight.repairBudget}`,
    `Implementation contract: ${
      preflight.implementationContract === null
        ? "not applicable"
        : preflight.implementationContract.path
    }`,
    `Product precedent: ${
      preflight.implementationContract?.contract.productPrecedent?.product ?? "not applicable"
    }`,
    `Precedent materialization: ${
      preflight.implementationContract?.materialization?.path ?? "not applicable"
    }`,
    `Supersedes: ${
      preflight.supersedes.length === 0
        ? "none"
        : preflight.supersedes
            .map((item) => `${item.requestPath} (${item.objectiveId})`)
            .join(", ")
    }`,
    "",
    "Instructions:",
    ...preflight.instructions.map((item) => `- ${item}`),
    "",
    "References:",
    ...preflight.references.map((item) => `- ${item.path}`),
    "",
    `Workspace packages (${preflight.workspacePackages.length}):`,
    ...preflight.workspacePackages.map(
      (item) => `- ${item.name} (${item.path})`,
    ),
    "",
    "Environment:",
    ...preflight.environment.commands.map(
      (item) => `- ${item.name}: ${item.available ? "available" : "missing"}`,
    ),
  ];
  return lines.join("\n");
}

async function collectImplementationContract(
  root: string,
  request: CapabilityRequest,
): Promise<TaskPreflight["implementationContract"]> {
  if (request.implementationContractPath === undefined) return null;
  const contractPath = resolveRepositoryReference(root, request.implementationContractPath);
  if (!(await exists(contractPath))) {
    throw new Error(`Missing implementation contract: ${request.implementationContractPath}.`);
  }
  const contract = decodeImplementationContract(await readJson(contractPath));
  if (request.verificationProfile === "product-topology" && contract.productPrecedent === null) {
    throw new Error("Product-topology implementation contracts require a product precedent.");
  }
  if (request.verificationProfile === "product-topology" && contract.skills.length === 0) {
    throw new Error("Product-topology implementation contracts require an implementation skill.");
  }
  for (const skillPath of contract.skills) {
    if (!request.readableReferences.includes(skillPath)) {
      throw new Error(`Implementation skill must be a readable capability reference: ${skillPath}.`);
    }
    const absoluteSkill = resolveRepositoryReference(root, skillPath);
    if (!(await exists(absoluteSkill))) {
      throw new Error(`Missing implementation skill: ${skillPath}.`);
    }
    validateImplementationSkill(skillPath, await readFile(absoluteSkill, "utf8"));
  }
  const precedent = contract.productPrecedent;
  let materialization: NonNullable<TaskPreflight["implementationContract"]>["materialization"] = null;
  if (precedent !== null) {
    const evidencePath = precedent.evidencePath;
    if (!request.readableReferences.includes(evidencePath)) {
      throw new Error("Product precedent evidence must be a readable capability reference.");
    }
    if (!(await exists(resolveReference(root, evidencePath)))) {
      throw new Error(`Missing product precedent evidence: ${evidencePath}.`);
    }
    if (!request.readableReferences.includes(precedent.materializationPath)) {
      throw new Error(
        "Product precedent materialization must be a readable capability reference.",
      );
    }
    const materializationPath = resolveRepositoryReference(
      root,
      precedent.materializationPath,
    );
    if (!(await exists(materializationPath))) {
      throw new Error(`Missing product precedent materialization: ${precedent.materializationPath}.`);
    }
    const receipt = decodeProductPrecedentMaterialization(await readJson(materializationPath));
    await VerifiedProductPrecedentMaterializationV2.create(root, contract, receipt);
    materialization = {
      path: path.relative(root, materializationPath).replaceAll("\\", "/"),
      receipt,
    };
  }
  return {
    path: path.relative(root, contractPath).replaceAll("\\", "/"),
    contract,
    materialization,
  };
}

async function collectSupersededRequests(
  root: string,
  request: CapabilityRequest,
): Promise<readonly { readonly requestPath: string; readonly objectiveId: ObjectiveId }[]> {
  const supersededRequests: { requestPath: string; objectiveId: ObjectiveId }[] = [];
  for (const superseded of request.supersedes) {
    const supersededPath = path.resolve(root, superseded);
    if (!(await exists(supersededPath))) {
      throw new Error(`Superseded capability request does not exist: ${superseded}.`);
    }
    const decoded = decodeCapabilityRequest(await readJson(supersededPath));
    supersededRequests.push({
      requestPath: path.relative(root, supersededPath).replaceAll("\\", "/"),
      objectiveId: decoded.objectiveId,
    });
  }
  return supersededRequests;
}

async function collectInstructions(
  root: string,
  writablePaths: readonly string[],
): Promise<readonly string[]> {
  const instructions = new Set<string>();
  if (await exists(path.join(root, "AGENTS.md"))) {
    instructions.add("AGENTS.md");
  }
  for (const writablePath of writablePaths) {
    const prefix = writablePath.split(/[*?[\]]/u, 1)[0] ?? "";
    let candidate = path.dirname(path.resolve(root, prefix));
    for (;;) {
      if (!isWithinOrEqual(root, candidate)) {
        break;
      }
      const instruction = path.join(candidate, "AGENTS.md");
      if (await exists(instruction)) {
        instructions.add(path.relative(root, instruction).replaceAll("\\", "/"));
      }
      if (candidate === root) {
        break;
      }
      candidate = path.dirname(candidate);
    }
  }
  return [...instructions].sort();
}

async function collectWorkspacePackages(
  root: string,
): Promise<readonly { readonly name: string; readonly path: string }[]> {
  const packages: { name: string; path: string }[] = [];
  for (const topLevel of ["apps", "packages", "tests", "tools"]) {
    const directory = path.join(root, topLevel);
    if (!(await exists(directory))) {
      continue;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(directory, entry.name, "package.json");
      if (!(await exists(manifestPath))) {
        continue;
      }
      const manifest = await readJson(manifestPath);
      if (
        typeof manifest === "object" &&
        manifest !== null &&
        "name" in manifest &&
        typeof manifest.name === "string"
      ) {
        packages.push({
          name: manifest.name,
          path: path.relative(root, manifestPath).replaceAll("\\", "/"),
        });
      }
    }
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

async function commandAvailable(root: string, command: string): Promise<boolean> {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    await runCommand(locator, [command], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function resolveReference(root: string, reference: string): string {
  return path.isAbsolute(reference) ? reference : path.resolve(root, reference);
}

function resolveRepositoryReference(root: string, reference: string): string {
  const resolved = path.resolve(root, reference);
  if (!isWithinOrEqual(root, resolved) || resolved === path.resolve(root)) {
    throw new Error("Implementation contract must be a repository file.");
  }
  return resolved;
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length === 0 ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function git(root: string, args: readonly string[]): Promise<string> {
  return await runCommand("git", args, { cwd: root });
}

async function gitSucceeds(root: string, args: readonly string[]): Promise<boolean> {
  try {
    await git(root, args);
    return true;
  } catch {
    return false;
  }
}
