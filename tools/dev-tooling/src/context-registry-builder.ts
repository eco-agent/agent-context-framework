import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeContextRegistry,
  resolveContextComponents,
  type ContextLicense,
  type ContextRegistryV2,
} from "@agent-context/repo-policy";

import { exists } from "./workspace.js";
import { checkContextGovernance } from "./context-governance.js";
import { validateWaveFourRegistryReferences } from "./codex-interface.js";

export const CONTEXT_REGISTRY_SOURCE_PATH = "registry/registry.source.json";
export const CONTEXT_REGISTRY_OUTPUT_PATH = "registry/registry.json";
export const SKILL_ROUTING_EXERCISES_PATH = "registry/sources/skill-routing-exercises.json";

interface RegistrySourceCatalog {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly decisionPath: string;
  readonly components: readonly RegistrySourceComponent[];
}

interface RegistrySourceComponent {
  readonly name: unknown;
  readonly dependencies: unknown;
  readonly capabilities: unknown;
  readonly licenses: unknown;
  readonly artifacts: readonly RegistrySourceArtifact[];
}

interface RoutingExerciseCatalog {
  readonly schemaVersion: 1;
  readonly exercises: readonly RoutingExercise[];
}

interface RoutingExercise {
  readonly component: string;
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly changedDecision: string;
  readonly observation: string;
  readonly gracePath: string;
}

type RegistrySourceArtifact =
  | RegistryDirectArtifact
  | RegistryDirectoryArtifact
  | RegistryProjectedDirectoryArtifact
  | RegistryRuntimeDirectoryArtifact;

interface RegistryDirectArtifact {
  readonly kind: "artifact";
  readonly fields: Readonly<Record<string, unknown>>;
}

interface RegistryDirectoryArtifact {
  readonly kind: "directory";
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly excludedPrefixes: readonly string[];
  readonly excludedPaths: readonly string[];
}

interface RegistryProjectedDirectoryArtifact {
  readonly kind: "projected-directory";
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly excludedPrefixes: readonly string[];
  readonly excludedPaths: readonly string[];
}

interface RegistryRuntimeDirectoryArtifact {
  readonly kind: "runtime-directory";
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly excludedPrefixes: readonly string[];
  readonly excludedPaths: readonly string[];
  readonly workspaceId: string;
}

export async function buildContextRegistry(root: string): Promise<ContextRegistryV2> {
  const resolvedRoot = await realpath(root);
  const sourcePath = repositoryPath(resolvedRoot, CONTEXT_REGISTRY_SOURCE_PATH);
  const catalog = decodeRegistrySourceCatalog(await readJson(sourcePath, "Registry source catalog"));
  if (!(await exists(repositoryPath(resolvedRoot, catalog.decisionPath)))) {
    throw new Error(`Registry decision does not exist: ${catalog.decisionPath}.`);
  }

  const components: Array<Readonly<Record<string, unknown>>> = [];
  for (const component of catalog.components) {
    const artifacts: Array<Readonly<Record<string, unknown>>> = [];
    for (const declaration of component.artifacts) {
      if (declaration.kind === "artifact") {
        const sourcePathValue = requiredString(declaration.fields, "sourcePath");
        const bytes = await readSourceBytes(resolvedRoot, sourcePathValue);
        artifacts.push({
          ...declaration.fields,
          sourceSha256: contentHash(bytes),
        });
        continue;
      }
      const files = await listDeclarationFiles(resolvedRoot, declaration);
      for (const relativeFile of files) {
        const portableRelativeFile = portablePath(relativeFile);
        const sourcePathValue = joinPortable(declaration.sourceDirectory, portableRelativeFile);
        const targetPath = joinPortable(declaration.targetDirectory, portableRelativeFile);
        const bytes = await readSourceBytes(resolvedRoot, sourcePathValue);
        artifacts.push(declaration.kind === "runtime-directory"
          ? {
              operation: "runtime-workspace",
              sourcePath: sourcePathValue,
              sourceSha256: contentHash(bytes),
              targetPath,
              workspaceId: declaration.workspaceId,
              mediaType: mediaTypeFor(targetPath),
            }
          : {
              operation: "file",
              sourcePath: sourcePathValue,
              sourceSha256: contentHash(bytes),
              targetPath,
              mediaType: mediaTypeFor(targetPath),
            });
      }
    }
    const licenses = await materializeLicenses(
      resolvedRoot,
      component.name,
      component.licenses,
      artifacts,
    );
    const componentContract = {
      name: component.name,
      dependencies: component.dependencies,
      capabilities: component.capabilities,
      licenses,
      artifacts,
    };
    components.push({
      name: componentContract.name,
      revision: `sha256:${contentHash(Buffer.from(JSON.stringify(componentContract), "utf8"))}`,
      dependencies: componentContract.dependencies,
      capabilities: componentContract.capabilities,
      licenses: componentContract.licenses,
      artifacts: componentContract.artifacts,
    });
  }

  const registry = decodeContextRegistry({
    schemaVersion: 2,
    revision: catalog.revision,
    decisionPath: catalog.decisionPath,
    components,
  });
  await validateSkillRoutingExercises(resolvedRoot, registry);
  await validateNoticeCoverage(resolvedRoot, registry);
  await validateSourceAttribution(resolvedRoot, registry);
  await validatePackagedMarkdownReferences(resolvedRoot, registry);
  await validateExternalCapabilityCoverage(resolvedRoot, registry);
  await validateWaveFourRegistryReferences(resolvedRoot, registry);
  return registry;
}

async function validateSkillRoutingExercises(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const catalog = decodeRoutingExerciseCatalog(await readJson(
    repositoryPath(root, SKILL_ROUTING_EXERCISES_PATH),
    "Skill routing exercise catalog",
  ));
  const expectedComponents = registry.components.flatMap((component) => {
    const expectedEntrypoint = component.name.startsWith("skill-")
      ? `.codex/skills/${component.name.slice("skill-".length)}/SKILL.md`
      : undefined;
    if (!expectedEntrypoint) return [];
    return component.artifacts.some((artifact) => artifact.targetPath === expectedEntrypoint)
      ? [component.name]
      : [];
  });
  const actualComponents = catalog.exercises.map((exercise) => exercise.component);
  const missing = expectedComponents.filter((component) => !actualComponents.includes(component));
  if (missing.length > 0) {
    throw new Error(
      `Skill routing exercise catalog is missing ${missing.join(", ")}. ` +
      `Add a positive prompt, nearby negative prompt, changed decision, observation, and grace path.`,
    );
  }
  const extra = actualComponents.filter((component) => !expectedComponents.includes(component));
  if (extra.length > 0) {
    throw new Error(
      `Skill routing exercise catalog names non-skill components: ${extra.join(", ")}. ` +
      `Remove stale exercises or package the matching skill entrypoint.`,
    );
  }
}

function decodeRoutingExerciseCatalog(value: unknown): RoutingExerciseCatalog {
  const record = strictRecord(value, "Skill routing exercise catalog", ["schemaVersion", "exercises"]);
  if (record.schemaVersion !== 1) {
    throw new Error("Skill routing exercise catalog schemaVersion must be 1.");
  }
  const exercises = decodeArray(
    record.exercises,
    "Skill routing exercises",
    decodeRoutingExercise,
  );
  if (exercises.length === 0) {
    throw new Error("Skill routing exercise catalog must contain at least one exercise.");
  }
  requireUnique(exercises.map((exercise) => exercise.component), "Skill routing exercise components");
  return { schemaVersion: 1, exercises };
}

function decodeRoutingExercise(value: unknown): RoutingExercise {
  const record = strictRecord(value, "Skill routing exercise", [
    "component",
    "positivePrompt",
    "negativePrompt",
    "changedDecision",
    "observation",
    "gracePath",
  ]);
  const positivePrompt = nonBlankText(record, "positivePrompt");
  const negativePrompt = nonBlankText(record, "negativePrompt");
  if (normalizedText(positivePrompt) === normalizedText(negativePrompt)) {
    throw new Error("Skill routing exercise positivePrompt and negativePrompt must differ.");
  }
  return {
    component: componentName(record.component, "Skill routing exercise component"),
    positivePrompt,
    negativePrompt,
    changedDecision: nonBlankText(record, "changedDecision"),
    observation: nonBlankText(record, "observation"),
    gracePath: nonBlankText(record, "gracePath"),
  };
}

export async function writeContextRegistry(root: string): Promise<ContextRegistryV2> {
  const resolvedRoot = await realpath(root);
  const registry = await buildContextRegistry(root);
  const catalog = await readRegistrySourceCatalog(resolvedRoot);
  await synchronizeProjectedDirectories(resolvedRoot, catalog);
  const outputPath = repositoryPath(resolvedRoot, CONTEXT_REGISTRY_OUTPUT_PATH);
  await writeFile(outputPath, serializeRegistry(registry), "utf8");
  return registry;
}

export async function checkContextRegistry(root: string): Promise<ContextRegistryV2> {
  const resolvedRoot = await realpath(root);
  const registry = await buildContextRegistry(root);
  await checkProjectedDirectories(resolvedRoot, await readRegistrySourceCatalog(resolvedRoot));
  const outputPath = repositoryPath(resolvedRoot, CONTEXT_REGISTRY_OUTPUT_PATH);
  const current = await readStrictUtf8(outputPath, "Built context registry");
  if (current !== serializeRegistry(registry)) {
    throw new Error(`Built context registry is stale. Run pnpm registry:build.`);
  }
  await checkContextGovernance(resolvedRoot, registry);
  return registry;
}

async function readRegistrySourceCatalog(root: string): Promise<RegistrySourceCatalog> {
  const sourcePath = repositoryPath(root, CONTEXT_REGISTRY_SOURCE_PATH);
  return decodeRegistrySourceCatalog(await readJson(sourcePath, "Registry source catalog"));
}

function decodeRegistrySourceCatalog(value: unknown): RegistrySourceCatalog {
  const record = strictRecord(value, "Registry source catalog", [
    "schemaVersion",
    "revision",
    "decisionPath",
    "components",
  ]);
  if (record.schemaVersion !== 1) throw new Error("Registry source catalog schemaVersion must be 1.");
  const components = decodeArray(record.components, "Registry source components", decodeSourceComponent);
  const catalog: RegistrySourceCatalog = {
    schemaVersion: 1,
    revision: requiredString(record, "revision"),
    decisionPath: portableRelativePath(record, "decisionPath"),
    components,
  };
  validateProjectedDirectoryOwnership(catalog);
  return catalog;
}

function decodeSourceComponent(value: unknown): RegistrySourceComponent {
  const record = strictRecord(value, "Registry source component", [
    "name",
    "dependencies",
    "capabilities",
    "licenses",
    "artifacts",
  ]);
  return {
    name: record.name,
    dependencies: record.dependencies,
    capabilities: record.capabilities,
    licenses: record.licenses,
    artifacts: decodeArray(record.artifacts, "Registry source artifacts", decodeSourceArtifact),
  };
}

function decodeSourceArtifact(value: unknown): RegistrySourceArtifact {
  if (!isRecord(value)) throw new Error("Registry source artifact must be an object.");
  if (
    value.kind === "directory" ||
    value.kind === "projected-directory" ||
    value.kind === "runtime-directory"
  ) {
    const record = strictRecord(value, "Registry directory artifact", [
      "kind",
      "sourceDirectory",
      "targetDirectory",
      "excludedPrefixes",
      "excludedPaths",
      ...(value.kind === "runtime-directory" ? ["workspaceId"] : []),
    ]);
    const excludedPrefixes = decodeArray(
      record.excludedPrefixes,
      "Registry directory excludedPrefixes",
      (candidate) => normalizedPrefix(candidate),
    );
    const excludedPaths = record.excludedPaths === undefined
      ? []
      : decodeArray(
          record.excludedPaths,
          "Registry directory excludedPaths",
          (candidate) => portablePathValue(candidate, "Registry excluded path"),
        );
    const directory = {
      sourceDirectory: portableRelativePath(record, "sourceDirectory"),
      targetDirectory: portableRelativePath(record, "targetDirectory"),
      excludedPrefixes,
      excludedPaths,
    };
    return value.kind === "runtime-directory"
      ? {
          kind: "runtime-directory",
          ...directory,
          workspaceId: componentName(record.workspaceId, "Registry runtime workspaceId"),
        }
      : { kind: value.kind, ...directory };
  }
  if (value.kind !== "artifact") {
    throw new Error(
      "Registry source artifact kind must be artifact, directory, projected-directory, or runtime-directory.",
    );
  }
  const fields = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "kind"));
  if (Object.keys(fields).length === 0) throw new Error("Direct registry artifact must not be empty.");
  if ("sourceSha256" in fields) {
    throw new Error("Registry source artifacts cannot declare sourceSha256; the builder derives it.");
  }
  return { kind: "artifact", fields };
}

async function synchronizeProjectedDirectories(
  root: string,
  catalog: RegistrySourceCatalog,
): Promise<void> {
  for (const projection of projectedDirectories(catalog)) {
    assertDisjointProjection(projection);
    const sourceFiles = await listDeclarationFiles(root, projection);
    const targetDirectory = repositoryPath(root, projection.targetDirectory);
    await assertUnredirectedRepositoryPath(root, projection.targetDirectory);
    if (await exists(targetDirectory)) {
      const state = await lstat(targetDirectory);
      if (state.isSymbolicLink() || !state.isDirectory()) {
        throw new Error(`Projected target must be a regular directory: ${projection.targetDirectory}.`);
      }
    } else {
      await mkdir(targetDirectory, { recursive: true });
      await assertUnredirectedRepositoryPath(root, projection.targetDirectory);
    }

    const expectedTargets = new Set(sourceFiles.map((relativeFile) => portablePath(relativeFile)));
    for (const relativeFile of await listFiles(targetDirectory, [])) {
      const portableRelativeFile = portablePath(relativeFile);
      if (!expectedTargets.has(portableRelativeFile)) {
        const staleTargetPath = joinPortable(projection.targetDirectory, portableRelativeFile);
        await assertUnredirectedRepositoryPath(root, path.posix.dirname(staleTargetPath));
        await assertRegularProjectionTarget(root, staleTargetPath);
        await unlink(repositoryPath(root, staleTargetPath));
      }
    }

    for (const relativeFile of sourceFiles) {
      const portableRelativeFile = portablePath(relativeFile);
      const sourcePath = joinPortable(projection.sourceDirectory, portableRelativeFile);
      const targetPath = joinPortable(projection.targetDirectory, portableRelativeFile);
      const target = repositoryPath(root, targetPath);
      const targetParent = path.posix.dirname(targetPath);
      await assertUnredirectedRepositoryPath(root, targetParent);
      await mkdir(path.dirname(target), { recursive: true });
      await assertUnredirectedRepositoryPath(root, targetParent);
      const sourceBytes = await readSourceBytes(root, sourcePath);
      const currentBytes = await readRegularFileIfPresent(root, targetPath);
      if (!currentBytes || !equalBytes(sourceBytes, currentBytes)) {
        await writeFile(target, sourceBytes);
      }
    }
  }
}

async function checkProjectedDirectories(
  root: string,
  catalog: RegistrySourceCatalog,
): Promise<void> {
  for (const projection of projectedDirectories(catalog)) {
    assertDisjointProjection(projection);
    const sourceFiles = await listDeclarationFiles(root, projection);
    const targetDirectory = repositoryPath(root, projection.targetDirectory);
    await assertUnredirectedRepositoryPath(root, projection.targetDirectory);
    if (!(await exists(targetDirectory))) throw staleProjectionError(projection.targetDirectory);
    const state = await lstat(targetDirectory);
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw staleProjectionError(projection.targetDirectory);
    }
    const actualFiles = (await listFiles(targetDirectory, [])).map(portablePath);
    const expectedFiles = sourceFiles.map(portablePath);
    if (
      actualFiles.length !== expectedFiles.length ||
      actualFiles.some((candidate, index) => candidate !== expectedFiles[index])
    ) {
      throw staleProjectionError(projection.targetDirectory);
    }
    for (const relativeFile of sourceFiles) {
      const portableRelativeFile = portablePath(relativeFile);
      const sourceBytes = await readSourceBytes(
        root,
        joinPortable(projection.sourceDirectory, portableRelativeFile),
      );
      const targetBytes = await readRegularFileIfPresent(
        root,
        joinPortable(projection.targetDirectory, portableRelativeFile),
      );
      if (!targetBytes || !equalBytes(sourceBytes, targetBytes)) {
        throw staleProjectionError(projection.targetDirectory);
      }
    }
  }
}

function projectedDirectories(catalog: RegistrySourceCatalog): readonly RegistryProjectedDirectoryArtifact[] {
  return catalog.components.flatMap((component) =>
    component.artifacts.filter(
      (artifact): artifact is RegistryProjectedDirectoryArtifact => artifact.kind === "projected-directory",
    ));
}

async function listDeclarationFiles(
  root: string,
  declaration: RegistryDirectoryArtifact | RegistryProjectedDirectoryArtifact | RegistryRuntimeDirectoryArtifact,
): Promise<readonly string[]> {
  await assertUnredirectedRepositoryPath(root, declaration.sourceDirectory);
  const files = await listFiles(
    repositoryPath(root, declaration.sourceDirectory),
    declaration.excludedPrefixes,
  );
  return files.filter((relativeFile) => {
    const portableRelativeFile = portablePath(relativeFile);
    return !declaration.excludedPaths.includes(portableRelativeFile) &&
      !declaration.excludedPrefixes.some((prefix) => portableRelativeFile.startsWith(prefix));
  });
}

function assertDisjointProjection(projection: RegistryProjectedDirectoryArtifact): void {
  if (directoriesOverlap(projection.sourceDirectory, projection.targetDirectory)) {
    throw new Error(
      `Projected source and target directories must not overlap: ${projection.sourceDirectory} and ${projection.targetDirectory}.`,
    );
  }
}

function validateProjectedDirectoryOwnership(catalog: RegistrySourceCatalog): void {
  const projections = projectedDirectories(catalog);
  for (const projection of projections) assertDisjointProjection(projection);
  for (let leftIndex = 0; leftIndex < projections.length; leftIndex += 1) {
    const left = projections[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < projections.length; rightIndex += 1) {
      const right = projections[rightIndex]!;
      if (directoriesOverlap(left.targetDirectory, right.targetDirectory)) {
        throw new Error(
          `Projected target directories must not overlap: ${left.targetDirectory} and ${right.targetDirectory}.`,
        );
      }
    }
    for (const sourceOwner of projections) {
      if (directoriesOverlap(left.targetDirectory, sourceOwner.sourceDirectory)) {
        throw new Error(
          `Projected target ${left.targetDirectory} overlaps projected source ${sourceOwner.sourceDirectory}.`,
        );
      }
    }
  }
}

function directoriesOverlap(left: string, right: string): boolean {
  const leftPrefix = `${portableDirectoryKey(left)}/`;
  const rightPrefix = `${portableDirectoryKey(right)}/`;
  return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
}

function portableDirectoryKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

async function assertUnredirectedRepositoryPath(
  root: string,
  relativePath: string,
): Promise<void> {
  const rootPath = path.resolve(root);
  let current = rootPath;
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    let state: Awaited<ReturnType<typeof lstat>>;
    try {
      state = await lstat(current);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    if (state.isSymbolicLink()) {
      throw new Error(
        `Projected path has a symbolic-link or junction ancestor: ${relativePath}. ` +
        "Remove the redirect before running pnpm registry:build.",
      );
    }
    const resolved = await realpath(current);
    const relative = path.relative(rootPath, resolved);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Projected path resolves outside the repository: ${relativePath}. ` +
        "Remove the redirect before running pnpm registry:build.",
      );
    }
  }
}

async function assertRegularProjectionTarget(root: string, relativePath: string): Promise<void> {
  const state = await lstat(repositoryPath(root, relativePath));
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error(`Projected target must be a regular file: ${relativePath}.`);
  }
}

async function readRegularFileIfPresent(
  root: string,
  relativePath: string,
): Promise<Uint8Array | undefined> {
  const absolute = repositoryPath(root, relativePath);
  let state: Awaited<ReturnType<typeof lstat>>;
  try {
    state = await lstat(absolute);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error(`Projected target must be a regular file: ${relativePath}.`);
  }
  return await readFile(absolute);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function staleProjectionError(targetDirectory: string): Error {
  return new Error(`Projected directory is stale: ${targetDirectory}. Run pnpm registry:build.`);
}

async function materializeLicenses(
  root: string,
  componentNameValue: unknown,
  value: unknown,
  artifacts: readonly Readonly<Record<string, unknown>>[],
): Promise<readonly ContextLicense[]> {
  const component = componentName(componentNameValue, "Registry component name");
  if (!Array.isArray(value)) throw new Error(`Component ${component} licenses must be an array.`);
  return await Promise.all(value.map(async (candidate) => {
    if (!isRecord(candidate)) throw new Error(`Component ${component} license must be an object.`);
    if (candidate.kind === "project") {
      const record = strictRecord(candidate, `Component ${component} project license`, [
        "kind",
        "spdx",
        "sourcePath",
        "noticePath",
      ]);
      const sourcePath = portableRelativePath(record, "sourcePath");
      const noticePath = portableRelativePath(record, "noticePath");
      const bytes = await readSourceBytes(root, sourcePath);
      return {
        kind: "project",
        spdx: requiredString(record, "spdx"),
        sourcePath,
        noticePath,
        noticeSha256: contentHash(bytes),
      };
    }
    if (candidate.kind !== "third-party") {
      throw new Error(`Component ${component} license kind must be project or third-party.`);
    }
    const record = strictRecord(candidate, `Component ${component} third-party license`, [
      "kind",
      "spdx",
      "source",
      "revision",
      "noticePath",
    ]);
    const noticePath = portableRelativePath(record, "noticePath");
    const noticeArtifact = artifacts.find((artifact) => artifact.targetPath === noticePath);
    if (!noticeArtifact) {
      throw new Error(`Component ${component} does not install declared notice ${noticePath}.`);
    }
    return {
      kind: "third-party",
      spdx: requiredString(record, "spdx"),
      source: requiredString(record, "source"),
      revision: requiredString(record, "revision"),
      noticePath,
      noticeSha256: requiredString(noticeArtifact, "sourceSha256"),
    };
  }));
}

async function validateNoticeCoverage(root: string, registry: ContextRegistryV2): Promise<void> {
  for (const component of registry.components) {
    for (const license of component.licenses) {
      if (license.kind === "project") {
        const actual = contentHash(await readSourceBytes(root, license.sourcePath));
        if (actual !== license.noticeSha256) {
          throw new Error(
            `Component ${component.name} project notice ${license.noticePath} does not match its hash.`,
          );
        }
        const installedNotice = registry.components
          .flatMap((candidate) => candidate.artifacts)
          .find((artifact) => artifact.targetPath === license.noticePath);
        if (
          !installedNotice ||
          installedNotice.sourcePath !== license.sourcePath ||
          installedNotice.sourceSha256 !== license.noticeSha256
        ) {
          throw new Error(
            `Project notice ${license.noticePath} must install exact source ${license.sourcePath}.`,
          );
        }
        continue;
      }
      const notice = component.artifacts.find((artifact) => artifact.targetPath === license.noticePath);
      if (!notice) {
        throw new Error(
          `Component ${component.name} does not install declared notice ${license.noticePath}.`,
        );
      }
      if (notice.sourceSha256 !== license.noticeSha256) {
        throw new Error(
          `Component ${component.name} notice ${license.noticePath} does not match its license hash.`,
        );
      }
    }
  }
}

async function validateSourceAttribution(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  for (const component of registry.components) {
    const thirdPartyLicenses = component.licenses.filter((license) => license.kind === "third-party");
    const sourceArtifacts = component.artifacts.filter((artifact) =>
      path.posix.basename(artifact.targetPath) === "SOURCE.json");
    if (sourceArtifacts.length > 0 && thirdPartyLicenses.length === 0) {
      throw new Error(`Component ${component.name} installs orphaned SOURCE.json metadata.`);
    }
    if (thirdPartyLicenses.length > 0 && sourceArtifacts.length === 0) {
      throw new Error(`Third-party component ${component.name} must install SOURCE.json metadata.`);
    }
    if (thirdPartyLicenses.length === 0) continue;

    const attributed = new Set<string>();
    for (const artifact of sourceArtifacts) {
      const value = await readJson(repositoryPath(root, artifact.sourcePath), artifact.sourcePath);
      for (const entry of decodeSourceAttributions(value, artifact.sourcePath)) {
        attributed.add(attributionIdentity(entry.repository, entry.revision, entry.license));
      }
    }
    const declared = new Set(thirdPartyLicenses.map((license) =>
      attributionIdentity(license.source, license.revision, license.spdx)));
    if (
      attributed.size !== declared.size ||
      [...attributed].some((identity) => !declared.has(identity))
    ) {
      throw new Error(`Component ${component.name} SOURCE.json does not match its registry licenses.`);
    }
  }
}

interface SourceAttribution {
  readonly repository: string;
  readonly revision: string;
  readonly license: string;
}

function decodeSourceAttributions(value: unknown, label: string): readonly SourceAttribution[] {
  if (!isRecord(value)) throw new Error(`${label} must contain an object.`);
  const entries = Array.isArray(value.sources) ? value.sources : [value];
  return entries.map((entry) => {
    if (!isRecord(entry)) throw new Error(`${label} source attribution must be an object.`);
    return {
      repository: requiredString(entry, "repository"),
      revision: requiredString(entry, "revision"),
      license: requiredString(entry, "license"),
    };
  });
}

function attributionIdentity(repository: string, revision: string, license: string): string {
  return `${repository}\n${revision}\n${license}`;
}

const EXTERNAL_CAPABILITY_RULES = [
  {
    name: "git",
    pattern: /(?:spawn(?:Sync)?|execFile(?:Sync)?)\s*\(\s*["']git["']|\bgit rev-parse --show-toplevel\b/u,
  },
  {
    name: "shell",
    pattern: /"command"\s*:\s*"sh\s|"commandWindows"\s*:\s*"powershell(?:\.exe)?\s/iu,
  },
] as const;

async function validateExternalCapabilityCoverage(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  for (const component of registry.components) {
    const closure = resolveContextComponents(registry, [component.name]);
    const declared = new Set(closure.flatMap((candidate) =>
      candidate.capabilities
        .filter((capability) => capability.kind === "runtime")
        .map((capability) => capability.name)));
    for (const artifact of component.artifacts) {
      if (!/\.(?:c?js|mjs|json|ts)$/u.test(artifact.sourcePath)) continue;
      const source = await readStrictUtf8(repositoryPath(root, artifact.sourcePath), artifact.sourcePath);
      for (const rule of EXTERNAL_CAPABILITY_RULES) {
        if (rule.pattern.test(source) && !declared.has(rule.name)) {
          throw new Error(
            `Component ${component.name} invokes ${rule.name} in ${artifact.sourcePath} ` +
            `without a required runtime capability declaration.`,
          );
        }
      }
    }
  }
}

async function validatePackagedMarkdownReferences(
  root: string,
  registry: ContextRegistryV2,
): Promise<void> {
  const packagedSources = new Set(
    registry.components.flatMap((component) => component.artifacts.map((artifact) => artifact.sourcePath)),
  );
  for (const sourcePath of [...packagedSources].sort()) {
    if (path.posix.extname(sourcePath).toLowerCase() !== ".md") continue;
    const source = await readStrictUtf8(repositoryPath(root, sourcePath), sourcePath);
    const links = source.matchAll(/\]\((?!https?:\/\/|mailto:|#)([^)#]+)(?:#[^)]*)?\)/gu);
    for (const link of links) {
      const reference = link[1];
      if (!reference) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), reference));
      if (resolved.startsWith("../") || !packagedSources.has(resolved)) {
        throw new Error(`Packaged Markdown reference is unresolved: ${sourcePath} -> ${reference}.`);
      }
    }
  }
}

async function listFiles(
  root: string,
  excludedPrefixes: readonly string[],
): Promise<readonly string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Registry directories cannot contain symbolic links: ${absolute}.`);
      if (entry.isDirectory()) {
        const relativeDirectory = `${portablePath(path.relative(root, absolute))}/`;
        if (excludedPrefixes.some((prefix) => relativeDirectory.startsWith(prefix))) continue;
        await visit(absolute);
      } else if (entry.isFile()) {
        result.push(path.relative(root, absolute));
      }
    }
  };
  await visit(root);
  return result.sort((left, right) => portablePath(left).localeCompare(portablePath(right)));
}

async function readSourceBytes(root: string, relativePath: string): Promise<Uint8Array> {
  await assertUnredirectedRepositoryPath(root, path.posix.dirname(relativePath));
  const absolute = repositoryPath(root, relativePath);
  const state = await lstat(absolute);
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error(`Registry source must be a regular file: ${relativePath}.`);
  }
  const bytes = await readFile(absolute);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`Registry source must be UTF-8 without a byte-order mark: ${relativePath}.`);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Registry source must be valid UTF-8: ${relativePath}.`, { cause: error });
  }
  return bytes;
}

function contentHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function mediaTypeFor(targetPath: string): string {
  switch (path.posix.extname(targetPath).toLowerCase()) {
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".md":
      return "text/markdown";
    case ".py":
      return "text/x-python";
    case ".toml":
      return "application/toml";
    default:
      return "text/plain";
  }
}

function serializeRegistry(registry: ContextRegistryV2): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

async function readJson(candidate: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readStrictUtf8(candidate, label)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON.`, { cause: error });
    throw error;
  }
}

async function readStrictUtf8(candidate: string, label: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must be UTF-8 without a byte-order mark.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8.`, { cause: error });
  }
}

function repositoryPath(root: string, candidate: string): string {
  if (path.isAbsolute(candidate) || candidate.includes("\\")) {
    throw new Error(`Repository path must be normalized and relative: ${candidate}.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Repository path escapes the root: ${candidate}.`);
  }
  return resolved;
}

function portableRelativePath(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${key} must be a normalized portable repository-relative path.`);
  }
  return value;
}

function normalizedPrefix(value: unknown): string {
  if (typeof value !== "string" || !value.endsWith("/")) {
    throw new Error("Registry excluded prefix must be a normalized directory prefix ending in slash.");
  }
  portableRelativePath({ value: value.slice(0, -1) }, "value");
  return value;
}

function portablePathValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return portableRelativePath({ value }, "value");
}

function joinPortable(parent: string, child: string): string {
  return `${parent.replace(/\/$/u, "")}/${child.replace(/^\//u, "")}`;
}

function portablePath(candidate: string): string {
  return candidate.replaceAll("\\", "/");
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function nonBlankText(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredString(record, key);
  if (value.trim() !== value || value.trim().length === 0) {
    throw new Error(`${key} must be non-blank text without surrounding whitespace.`);
  }
  return value;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function componentName(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${label} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function decodeArray<T>(value: unknown, label: string, decode: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(decode);
}

function requireUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} contain duplicate ${duplicate}.`);
}
