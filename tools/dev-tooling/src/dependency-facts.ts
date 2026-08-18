import path from "node:path";
import { readJson } from "./workspace.js";

export type DependencySource =
  | {
      readonly kind: "revision";
      readonly repository: string;
      readonly gitHead: string;
      readonly revisionUrl: string;
    }
  | {
      readonly kind: "repository";
      readonly repository: string;
    }
  | {
      readonly kind: "unavailable";
    };

export interface DependencyFacts {
  readonly schemaVersion: 1;
  readonly registry: "https://registry.npmjs.org";
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly integrity: string;
  readonly tarball: string;
  readonly source: DependencySource;
  readonly engines: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
}

export interface AdoptionComparison {
  readonly recordPath: string;
  readonly matches: boolean;
  readonly fields: readonly {
    readonly field: "name" | "version" | "license" | "integrity";
    readonly matches: boolean;
  }[];
}

export async function collectDependencyFacts(
  packageSpec: string,
  fetchMetadata: typeof fetch = fetch,
): Promise<DependencyFacts> {
  const parsedSpec = parsePackageSpec(packageSpec);
  const response = await fetchMetadata(
    `https://registry.npmjs.org/${encodeURIComponent(parsedSpec.name)}/${parsedSpec.version}`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `npm registry returned ${response.status} for ${parsedSpec.name}.`,
    );
  }
  const metadata = await response.json() as unknown;
  const version = decodeRegistryVersion(metadata, parsedSpec);
  return {
    schemaVersion: 1,
    registry: "https://registry.npmjs.org",
    name: parsedSpec.name,
    version: parsedSpec.version,
    license: version.license,
    integrity: version.integrity,
    tarball: version.tarball,
    source: sourceFor(version.repository, version.gitHead),
    engines: version.engines,
    dependencies: version.dependencies,
  };
}

export async function compareAdoptionRecord(
  root: string,
  recordArgument: string,
  facts: DependencyFacts,
): Promise<AdoptionComparison> {
  const recordPath = path.resolve(root, recordArgument);
  const record = await readJson(recordPath);
  if (!isRecord(record)) {
    throw new Error(`${recordArgument} must contain a JSON object.`);
  }
  const fields: AdoptionComparison["fields"] = [
    comparisonField("name", record.name, facts.name),
    comparisonField("version", record.version, facts.version),
    comparisonField("license", record.license, facts.license),
    comparisonField("integrity", record.integrity, facts.integrity),
  ];
  return {
    recordPath: path.relative(root, recordPath).replaceAll("\\", "/"),
    matches: fields.every((field) => field.matches),
    fields,
  };
}

export function parsePackageSpec(
  packageSpec: string,
): { readonly name: string; readonly version: string } {
  const separator = packageSpec.lastIndexOf("@");
  if (separator <= 0 || separator === packageSpec.length - 1) {
    throw new Error("Dependency must use the exact form <name>@<version>.");
  }
  const name = packageSpec.slice(0, separator);
  const version = packageSpec.slice(separator + 1);
  if (
    !/^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/u.test(name) ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)
  ) {
    throw new Error("Dependency must use an exact npm name and version.");
  }
  return { name, version };
}

function decodeRegistryVersion(
  metadata: unknown,
  requested: { readonly name: string; readonly version: string },
): {
  readonly license: string;
  readonly integrity: string;
  readonly tarball: string;
  readonly repository: string | undefined;
  readonly gitHead: string | undefined;
  readonly engines: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
} {
  const candidate = metadata;
  if (
    !isRecord(candidate) ||
    candidate.name !== requested.name ||
    candidate.version !== requested.version ||
    typeof candidate.license !== "string" ||
    !isRecord(candidate.dist) ||
    typeof candidate.dist.integrity !== "string" ||
    typeof candidate.dist.tarball !== "string"
  ) {
    throw new Error(
      `npm registry response has no complete ${requested.name}@${requested.version} record.`,
    );
  }
  return {
    license: candidate.license,
    integrity: candidate.dist.integrity,
    tarball: candidate.dist.tarball,
    repository: repositoryUrl(candidate.repository),
    gitHead:
      typeof candidate.gitHead === "string" && candidate.gitHead.length > 0
        ? candidate.gitHead
        : undefined,
    engines: stringRecord(candidate.engines),
    dependencies: stringRecord(candidate.dependencies),
  };
}

function sourceFor(
  repository: string | undefined,
  gitHead: string | undefined,
): DependencySource {
  if (repository === undefined) {
    return { kind: "unavailable" };
  }
  if (gitHead === undefined) {
    return { kind: "repository", repository };
  }
  return {
    kind: "revision",
    repository,
    gitHead,
    revisionUrl: `${repository.replace(/\.git$/u, "")}/tree/${gitHead}`,
  };
}

function repositoryUrl(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? value
      : isRecord(value) && typeof value.url === "string"
        ? value.url
        : undefined;
  if (raw === undefined) {
    return undefined;
  }
  return raw
    .replace(/^git\+/u, "")
    .replace(/^git:\/\/github\.com\//u, "https://github.com/")
    .replace(/^git@github\.com:/u, "https://github.com/");
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function comparisonField(
  field: AdoptionComparison["fields"][number]["field"],
  actual: unknown,
  expected: string,
): AdoptionComparison["fields"][number] {
  return {
    field,
    matches: actual === expected,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
