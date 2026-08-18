import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  artifactHash,
  type ObjectiveArtifactStore,
} from "@agent-context/objective-kernel";
import {
  PRODUCT_PRECEDENT_EVIDENCE_MEDIA_TYPE,
  PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION,
  type ImplementationContractV2,
  type ProductPrecedent,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";

const execFileAsync = promisify(execFile);

export class VerifiedProductPrecedentMaterializationV2 {
  private constructor(
    public readonly value: ProductPrecedentMaterializationV2,
    public readonly evidenceBytes: Uint8Array,
  ) {}

  public static async create(
    root: string,
    contract: ImplementationContractV2,
    expected: ProductPrecedentMaterializationV2,
  ): Promise<VerifiedProductPrecedentMaterializationV2> {
    const precedent = requiredPrecedent(contract);
    const derived = await deriveProductPrecedentMaterialization(root, precedent);
    if (JSON.stringify(derived.value) !== JSON.stringify(expected)) {
      throw new Error(
        "Product precedent materialization does not match direct Git and file evidence.",
      );
    }
    return new VerifiedProductPrecedentMaterializationV2(expected, derived.evidenceBytes);
  }
}

export async function deriveProductPrecedentMaterialization(
  root: string,
  precedent: ProductPrecedent,
): Promise<{
  readonly value: ProductPrecedentMaterializationV2;
  readonly evidenceBytes: Uint8Array;
}> {
  const checkout = await repositoryPath(root, precedent.checkoutPath, "checkout");
  const resolvedOrigin = await git(checkout, ["remote", "get-url", "origin"]);
  if (
    normalizeGitRepositoryUrl(resolvedOrigin) !==
    normalizeGitRepositoryUrl(precedent.source.repository)
  ) {
    throw new Error("Product precedent checkout origin does not match the requested repository.");
  }
  await git(checkout, ["cat-file", "-e", `${precedent.source.revision}^{commit}`]);
  const checkedOutRevision = await git(checkout, ["rev-parse", "HEAD"]);
  const isAncestor = await gitSucceeds(checkout, [
    "merge-base",
    "--is-ancestor",
    precedent.source.revision,
    checkedOutRevision,
  ]);
  if (!isAncestor) {
    throw new Error("Product precedent requested revision is not an ancestor of the checkout.");
  }
  const licenseBytes = await gitFile(
    checkout,
    precedent.source.revision,
    precedent.licensePath,
  );
  assertDeclaredLicense(precedent.source.license, licenseBytes);
  const evidencePath = await repositoryPath(root, precedent.evidencePath, "evidence file");
  const evidenceBytes = await readFile(evidencePath);
  const evidenceSha256 = sha256(evidenceBytes);
  const evidenceArtifact = {
    hash: artifactHash(`sha256:${evidenceSha256}`),
    mediaType: PRODUCT_PRECEDENT_EVIDENCE_MEDIA_TYPE,
    bytes: evidenceBytes.byteLength,
    label: `Product precedent evidence: ${precedent.product}`,
  };
  const sourceFiles = precedent.implementation.kind === "reuse"
    ? await Promise.all(precedent.implementation.files.map(async (file) => {
        const bytes = await gitFile(checkout, precedent.source.revision, file.sourcePath);
        return {
          sourcePath: file.sourcePath,
          targetPath: file.targetPath,
          mode: file.mode,
          sha256: sha256(bytes),
          bytes: bytes.byteLength,
        };
      }))
    : [];
  return {
    value: {
      schemaVersion: PRODUCT_PRECEDENT_MATERIALIZATION_SCHEMA_VERSION,
      repository: precedent.source.repository,
      resolvedOrigin,
      requestedRevision: precedent.source.revision,
      checkoutPath: precedent.checkoutPath,
      checkedOutRevision,
      ancestry: checkedOutRevision === precedent.source.revision ? "equal" : "ancestor",
      license: {
        declared: precedent.source.license,
        path: precedent.licensePath,
        noticePath: precedent.implementation.kind === "reuse"
          ? precedent.implementation.licenseNoticePath
          : null,
        sha256: sha256(licenseBytes),
      },
      evidence: {
        path: precedent.evidencePath,
        sha256: evidenceSha256,
        artifact: evidenceArtifact,
      },
      sourceFiles,
    },
    evidenceBytes,
  };
}

export async function readPinnedProductPrecedentFile(
  root: string,
  precedent: ProductPrecedent,
  filePath: string,
): Promise<Uint8Array> {
  const checkout = await repositoryPath(root, precedent.checkoutPath, "checkout");
  return await gitFile(checkout, precedent.source.revision, filePath);
}

export async function readPinnedGitFile(
  root: string,
  checkoutPath: string,
  revision: string,
  filePath: string,
): Promise<Uint8Array> {
  const checkout = await repositoryPath(root, checkoutPath, "checkout");
  return await gitFile(checkout, revision, filePath);
}

export async function publishVerifiedPrecedentEvidence(
  artifacts: ObjectiveArtifactStore,
  materialization: VerifiedProductPrecedentMaterializationV2,
): Promise<void> {
  const expected = materialization.value.evidence.artifact;
  const published = await artifacts.put({
    bytes: materialization.evidenceBytes,
    mediaType: expected.mediaType,
    label: expected.label,
  });
  if (JSON.stringify(published) !== JSON.stringify(expected)) {
    throw new Error("Product precedent evidence artifact identity is invalid.");
  }
  const stored = await artifacts.get(expected.hash);
  if (
    stored === undefined ||
    stored.mediaType !== expected.mediaType ||
    !Buffer.from(stored.bytes).equals(Buffer.from(materialization.evidenceBytes))
  ) {
    throw new Error("Product precedent evidence artifact is missing or does not match its bytes.");
  }
}

export function normalizeGitRepositoryUrl(value: string): string {
  const trimmed = value.trim();
  const scp = /^git@([^:]+):(.+)$/u.exec(trimmed);
  const candidate = scp === null
    ? trimmed
    : `ssh://git@${scp[1]}/${scp[2]}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Product precedent repository must be an absolute Git URL.");
  }
  if (!url.hostname || !["https:", "http:", "ssh:", "git:"].includes(url.protocol)) {
    throw new Error("Product precedent repository uses an unsupported Git URL.");
  }
  const pathname = url.pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/u, "");
  if (!pathname) {
    throw new Error("Product precedent repository URL has no repository path.");
  }
  return `${url.hostname.toLowerCase()}/${pathname}`;
}

function requiredPrecedent(contract: ImplementationContractV2): ProductPrecedent {
  if (contract.productPrecedent === null) {
    throw new Error("Product precedent materialization requires a product precedent.");
  }
  return contract.productPrecedent;
}

async function repositoryPath(root: string, candidate: string, label: string): Promise<string> {
  if (path.isAbsolute(candidate)) {
    throw new Error(`Product precedent ${label} path must be repository-relative.`);
  }
  const resolvedRoot = await realpath(root);
  const resolved = await realpath(path.resolve(resolvedRoot, candidate));
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Product precedent ${label} is outside its owning repository.`);
  }
  return resolved;
}

function assertDeclaredLicense(declared: string, bytes: Uint8Array): void {
  const declaredTokens = normalizedTokens(declared);
  const sourceTokens = new Set(normalizedTokens(Buffer.from(bytes).toString("utf8")));
  if (declaredTokens.length === 0 || declaredTokens.some((token) => !sourceTokens.has(token))) {
    throw new Error("Product precedent declared license is not evidenced by its license file.");
  }
}

function normalizedTokens(value: string): readonly string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length > 0);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function gitSucceeds(cwd: string, args: readonly string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

async function gitFile(cwd: string, revision: string, filePath: string): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    execFile(
      "git",
      ["show", `${revision}:${filePath}`],
      { cwd, encoding: "buffer", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`Pinned product precedent file is unavailable: ${filePath}.`, {
            cause: error,
          }));
          return;
        }
        resolve(new Uint8Array(stdout));
      },
    );
  });
}
