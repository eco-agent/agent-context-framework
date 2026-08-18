import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { collectBranchChangedFiles } from "../git.js";
import { decodeImplementationContract } from "../implementation-contract.js";
import { validateImplementationSkill } from "../implementation-skill.js";
import { decodeCapabilityRequest } from "../model.js";
import { decodeProductPrecedentMaterialization } from "../product-precedent-materialization.js";
import { pathExists, resolvesInside } from "../filesystem.js";

export interface ScopeCheckOptions {
  readonly requestFile: string;
  readonly base?: string;
}

export async function checkScope(
  root: string,
  options: ScopeCheckOptions,
): Promise<readonly string[]> {
  const requestPath = path.resolve(root, options.requestFile);
  if (!(await resolvesInside(root, options.requestFile))) {
    return ["Capability request must be inside the repository."];
  }

  const requestInput: unknown = JSON.parse(await readFile(requestPath, "utf8"));
  const request = decodeCapabilityRequest(requestInput);
  const invalidPatterns = request.writablePaths.filter((candidate) => !isSafeRelativePattern(candidate));
  if (invalidPatterns.length > 0) {
    return invalidPatterns.map((candidate) => `Unsafe writable path: ${candidate}`);
  }

  const changeSet = await collectBranchChangedFiles(root, options.base);
  const diagnostics: string[] = [];
  for (const changedFile of changeSet.files) {
    if (!(await resolvesInside(root, changedFile))) {
      diagnostics.push(`${changedFile} resolves outside the repository.`);
      continue;
    }
    if (!request.writablePaths.some((pattern) => matchesWritablePath(changedFile, pattern))) {
      diagnostics.push(`${changedFile} is outside the declared writable scope.`);
    }
  }
  if (request.implementationContractPath !== undefined) {
    diagnostics.push(...await implementationDiagnostics(
      root,
      request.implementationContractPath,
      request.readableReferences,
      request.writablePaths,
      request.verificationProfile,
      changeSet.files,
    ));
  }
  return diagnostics;
}

async function implementationDiagnostics(
  root: string,
  contractPath: string,
  readableReferences: readonly string[],
  writablePaths: readonly string[],
  verificationProfile: string,
  changedFiles: readonly string[],
): Promise<readonly string[]> {
  if (!(await resolvesInside(root, contractPath))) {
    return ["Implementation contract must be inside the repository."];
  }
  const absoluteContract = path.resolve(root, contractPath);
  if (!(await pathExists(absoluteContract))) {
    return [`Missing implementation contract: ${contractPath}.`];
  }
  const contractInput: unknown = JSON.parse(await readFile(absoluteContract, "utf8"));
  const contract = decodeImplementationContract(contractInput);
  const diagnostics: string[] = [];
  const changes = new Set(changedFiles.map(normalize));
  if (verificationProfile === "product-topology" && contract.productPrecedent === null) {
    diagnostics.push("Product-topology implementation contracts require a product precedent.");
  }
  if (verificationProfile === "product-topology" && contract.skills.length === 0) {
    diagnostics.push("Product-topology implementation contracts require an implementation skill.");
  }
  for (const skillPath of contract.skills) {
    if (!readableReferences.includes(skillPath)) {
      diagnostics.push(`Implementation skill is outside readable capability references: ${skillPath}`);
    } else if (!(await pathExists(path.resolve(root, skillPath)))) {
      diagnostics.push(`Missing implementation skill: ${skillPath}`);
    } else {
      try {
        validateImplementationSkill(skillPath, await readFile(path.resolve(root, skillPath), "utf8"));
      } catch (error) {
        diagnostics.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (contract.productPrecedent !== null) {
    const precedent = contract.productPrecedent;
    if (!readableReferences.includes(contract.productPrecedent.evidencePath)) {
      diagnostics.push("Product precedent evidence is outside readable capability references.");
    }
    if (!readableReferences.includes(contract.productPrecedent.materializationPath)) {
      diagnostics.push("Product precedent materialization is outside readable capability references.");
    } else {
      const receiptPath = path.resolve(root, precedent.materializationPath);
      if (!(await pathExists(receiptPath))) {
        diagnostics.push(
          `Missing product precedent materialization: ${contract.productPrecedent.materializationPath}`,
        );
      } else {
        const receiptInput: unknown = JSON.parse(await readFile(receiptPath, "utf8"));
        const receipt = decodeProductPrecedentMaterialization(receiptInput);
        if (precedent.implementation.kind === "reuse") {
          const reuse = precedent.implementation;
          if (!writablePaths.some((pattern) =>
            matchesWritablePath(reuse.licenseNoticePath, pattern))) {
            diagnostics.push("Product precedent license notice is outside writable capability paths.");
          }
          const noticePath = path.resolve(root, reuse.licenseNoticePath);
          if (!(await pathExists(noticePath))) {
            diagnostics.push(`Missing product precedent license notice: ${reuse.licenseNoticePath}`);
          } else if (hash(await readFile(noticePath)) !== receipt.license.sha256) {
            diagnostics.push("Product precedent license notice does not match pinned source bytes.");
          }
          for (const file of reuse.files) {
            const sourceReference = path.posix.join(precedent.checkoutPath, file.sourcePath);
            if (!readableReferences.includes(sourceReference)) {
              diagnostics.push(`Product precedent source is outside readable capability references: ${sourceReference}`);
            }
            if (!writablePaths.some((pattern) => matchesWritablePath(file.targetPath, pattern))) {
              diagnostics.push(`Product precedent target is outside writable capability paths: ${file.targetPath}`);
            }
            const materialized = receipt.sourceFiles.find(
              (candidate) => candidate.sourcePath === file.sourcePath,
            );
            if (
              materialized === undefined ||
              materialized.targetPath !== file.targetPath ||
              materialized.mode !== file.mode
            ) {
              diagnostics.push(`Product precedent source mapping is absent from materialization: ${file.sourcePath}`);
              continue;
            }
            const targetPath = path.resolve(root, file.targetPath);
            if (!(await pathExists(targetPath))) {
              diagnostics.push(`Missing materialized product precedent target: ${file.targetPath}`);
            } else if (file.mode === "copy" && hash(await readFile(targetPath)) !== materialized.sha256) {
              diagnostics.push(`Copied product precedent target differs from pinned source: ${file.targetPath}`);
            } else if (file.mode === "adapt" && !changes.has(normalize(file.targetPath))) {
              diagnostics.push(`Adapted product precedent target was not changed: ${file.targetPath}`);
            }
          }
        }
      }
    }
  }
  for (const replacement of contract.replacements) {
    const replacementPath = normalize(replacement.path);
    if (!isSafeRelativePath(replacementPath)) {
      diagnostics.push(`Unsafe replacement path: ${replacement.path}`);
      continue;
    }
    if (!changes.has(replacementPath)) {
      diagnostics.push(`Declared replacement was not changed: ${replacementPath}`);
      continue;
    }
    const exists = await pathExists(path.resolve(root, replacementPath));
    if (replacement.disposition === "remove" && exists) {
      diagnostics.push(`Declared replacement still exists: ${replacementPath}`);
    }
    if (replacement.disposition === "rewrite" && !exists) {
      diagnostics.push(`Declared rewrite was removed: ${replacementPath}`);
    }
  }
  return diagnostics;
}

export function matchesWritablePath(file: string, pattern: string): boolean {
  const normalizedFile = normalize(file);
  const normalizedPattern = normalize(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  return normalizedFile === normalizedPattern;
}

function isSafeRelativePattern(candidate: string): boolean {
  const normalized = normalize(candidate);
  return (
    normalized.length > 0 &&
    !path.posix.isAbsolute(normalized) &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../") &&
    (!normalized.includes("*") || normalized.endsWith("/**"))
  );
}

function isSafeRelativePath(candidate: string): boolean {
  return isSafeRelativePattern(candidate) && !candidate.includes("*");
}

function normalize(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
