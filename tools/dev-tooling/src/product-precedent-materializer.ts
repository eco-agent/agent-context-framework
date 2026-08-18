import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeImplementationContract,
  type ProductPrecedentMaterializationV2,
} from "@agent-context/repo-policy";
import {
  deriveProductPrecedentMaterialization,
  readPinnedProductPrecedentFile,
} from "@agent-context/codex-workflows";

import { readJson } from "./workspace.js";

export async function materializeProductPrecedent(
  root: string,
  implementationContractPath: string,
): Promise<{
  readonly path: string;
  readonly materialization: ProductPrecedentMaterializationV2;
  readonly stagedTargets: readonly string[];
}> {
  const contractPath = repositoryPath(root, implementationContractPath);
  const contract = decodeImplementationContract(await readJson(contractPath));
  const precedent = contract.productPrecedent;
  if (precedent === null) {
    throw new Error("Product precedent materialization requires a non-null precedent.");
  }
  const derived = await deriveProductPrecedentMaterialization(root, precedent);
  const stagedTargets: string[] = [];
  if (precedent.implementation.kind === "reuse") {
    for (const file of precedent.implementation.files) {
      const target = repositoryPath(root, file.targetPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        await readPinnedProductPrecedentFile(root, precedent, file.sourcePath),
      );
      stagedTargets.push(file.targetPath);
    }
    const licenseTarget = repositoryPath(root, precedent.implementation.licenseNoticePath);
    await mkdir(path.dirname(licenseTarget), { recursive: true });
    await writeFile(
      licenseTarget,
      await readPinnedProductPrecedentFile(root, precedent, precedent.licensePath),
    );
    stagedTargets.push(precedent.implementation.licenseNoticePath);
  }
  const outputPath = repositoryPath(root, precedent.materializationPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(derived.value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, outputPath);
  return {
    path: path.relative(root, outputPath).replaceAll("\\", "/"),
    materialization: derived.value,
    stagedTargets,
  };
}

function repositoryPath(root: string, candidate: string): string {
  if (path.isAbsolute(candidate)) {
    throw new Error("Product precedent materialization path must be repository-relative.");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Product precedent materialization path is outside the repository.");
  }
  return resolved;
}
