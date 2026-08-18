#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const options = parseArguments(process.argv.slice(2));
const repo = path.resolve(options.repo);
const base = resolveCommit(repo, options.base);
const head = resolveCommit(repo, options.head);
const mergeBase = git(repo, ["merge-base", base, head]);
const baseIsAncestor =
  spawnSync("git", ["merge-base", "--is-ancestor", base, head], {
    cwd: repo,
    stdio: "ignore",
    windowsHide: true,
  }).status === 0;

const finalFiles = parseNumstat(
  git(repo, ["diff", "--numstat", "--no-renames", `${base}..${head}`]),
);
const commitRecords = parseCommitRecords(
  git(repo, [
    "log",
    "--reverse",
    "--no-merges",
    "--format=%H%x1f%aI%x1f%s",
    `${base}..${head}`,
  ]),
);
const totalCommitCount = Number(
  git(repo, ["rev-list", "--count", `${base}..${head}`]),
);

const cumulativeByPath = new Map();
const commits = [];
for (const commit of commitRecords) {
  const changes = parseNumstat(
    git(repo, ["show", "--format=", "--numstat", "--no-renames", commit.id]),
  );
  let additions = 0;
  let deletions = 0;
  let binaryFiles = 0;

  for (const change of changes) {
    if (change.binary) {
      binaryFiles += 1;
    } else {
      additions += change.additions;
      deletions += change.deletions;
    }

    const current = cumulativeByPath.get(change.file) ?? {
      file: change.file,
      touches: 0,
      additions: 0,
      deletions: 0,
      binaryTouches: 0,
    };
    current.touches += 1;
    current.additions += change.additions;
    current.deletions += change.deletions;
    current.binaryTouches += change.binary ? 1 : 0;
    cumulativeByPath.set(change.file, current);
  }

  commits.push({
    ...commit,
    files: changes.length,
    additions,
    deletions,
    binaryFiles,
    changes: additions + deletions,
  });
}

const finalByPath = new Map(finalFiles.map((item) => [item.file, item]));
const hotspots = [...cumulativeByPath.values()]
  .filter((item) => item.touches > 1)
  .map((item) => {
    const final = finalByPath.get(item.file);
    return {
      ...item,
      cumulativeChanges: item.additions + item.deletions,
      finalChanges:
        final === undefined || final.binary
          ? 0
          : final.additions + final.deletions,
      group: classifyPath(item.file),
    };
  })
  .sort(
    (left, right) =>
      right.touches - left.touches ||
      right.cumulativeChanges - left.cumulativeChanges ||
      left.file.localeCompare(right.file),
  )
  .slice(0, options.top);

const finalSummary = summarizeChanges(finalFiles);
const cumulativeSummary = summarizeChanges(
  [...cumulativeByPath.values()].map((item) => ({
    file: item.file,
    additions: item.additions,
    deletions: item.deletions,
    binary: item.binaryTouches > 0,
  })),
);
const finalChanges = finalSummary.additions + finalSummary.deletions;
const cumulativeChanges =
  cumulativeSummary.additions + cumulativeSummary.deletions;
const statusEntries = git(repo, [
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
])
  .split(/\r?\n/u)
  .filter(Boolean);

const output = {
  schemaVersion: 1,
  repository: repo,
  range: {
    requestedBase: options.base,
    requestedHead: options.head,
    base,
    head,
    mergeBase,
    baseIsAncestor,
  },
  worktree: {
    clean: statusEntries.length === 0,
    statusEntryCount: statusEntries.length,
  },
  commits: {
    total: totalCommitCount,
    nonMerge: commits.length,
    merge: totalCommitCount - commits.length,
    largest: [...commits]
      .sort(
        (left, right) =>
          right.changes - left.changes || left.id.localeCompare(right.id),
      )
      .slice(0, options.top),
  },
  finalDiff: finalSummary,
  cumulativeNonMergeDiff: cumulativeSummary,
  churn: {
    finalChanges,
    cumulativeChanges,
    estimatedRework: Math.max(cumulativeChanges - finalChanges, 0),
    changeAmplification:
      finalChanges === 0
        ? null
        : Number((cumulativeChanges / finalChanges).toFixed(2)),
    repeatTouchedFileCount: [...cumulativeByPath.values()].filter(
      (item) => item.touches > 1,
    ).length,
    hotspots,
  },
  limitations: [
    "Metrics describe Git changes, not model tokens or tool-call counts.",
    "Estimated rework is directional; merges, renames, binary files, formatting, and generated code can distort it.",
    "Inspect repeated-touch hotspots before classifying them as waste.",
  ],
};

process.stdout.write(`${JSON.stringify(output, undefined, 2)}\n`);

function parseArguments(args) {
  const result = {
    repo: process.cwd(),
    head: "HEAD",
    top: 10,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "Usage: git-session-metrics.mjs --base <revision> [options]",
          "",
          "Options:",
          "  --repo <path>       Repository worktree (default: current directory)",
          "  --base <revision>   Exact task baseline (required)",
          "  --head <revision>   Final revision (default: HEAD)",
          "  --top <count>       Maximum hotspots and commits (default: 10)",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }

    if (!["--repo", "--base", "--head", "--top"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;

    if (argument === "--repo") {
      result.repo = value;
    } else if (argument === "--base") {
      result.base = value;
    } else if (argument === "--head") {
      result.head = value;
    } else {
      result.top = Number(value);
    }
  }

  if (result.base === undefined || result.base.trim().length === 0) {
    throw new Error("--base is required.");
  }
  if (!Number.isSafeInteger(result.top) || result.top < 1 || result.top > 100) {
    throw new Error("--top must be an integer from 1 through 100.");
  }
  return result;
}

function resolveCommit(repoPath, revision) {
  return git(repoPath, ["rev-parse", "--verify", `${revision}^{commit}`]);
}

function git(repoPath, args) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new Error(`git ${args.join(" ")}: ${detail}`);
  }
  return result.stdout.trim();
}

function parseCommitRecords(value) {
  if (value.length === 0) {
    return [];
  }
  return value.split(/\r?\n/u).map((line) => {
    const [id, authoredAt, subject] = line.split("\u001f");
    if (id === undefined || authoredAt === undefined || subject === undefined) {
      throw new Error(`Unexpected git log record: ${line}`);
    }
    return { id, authoredAt, subject };
  });
}

function parseNumstat(value) {
  if (value.length === 0) {
    return [];
  }
  return value.split(/\r?\n/u).map((line) => {
    const [added, deleted, ...fileParts] = line.split("\t");
    const file = fileParts.join("\t");
    if (added === undefined || deleted === undefined || file.length === 0) {
      throw new Error(`Unexpected numstat record: ${line}`);
    }
    const binary = added === "-" || deleted === "-";
    return {
      file: file.replaceAll("\\", "/"),
      additions: binary ? 0 : Number(added),
      deletions: binary ? 0 : Number(deleted),
      binary,
    };
  });
}

function summarizeChanges(changes) {
  const groups = {};
  let additions = 0;
  let deletions = 0;
  let binaryFiles = 0;

  for (const change of changes) {
    additions += change.additions;
    deletions += change.deletions;
    binaryFiles += change.binary ? 1 : 0;
    const group = classifyPath(change.file);
    groups[group] ??= { files: 0, additions: 0, deletions: 0 };
    groups[group].files += 1;
    groups[group].additions += change.additions;
    groups[group].deletions += change.deletions;
  }

  return {
    files: changes.length,
    additions,
    deletions,
    binaryFiles,
    groups,
  };
}

function classifyPath(file) {
  const normalized = file.toLowerCase();
  const segments = normalized.split("/");
  const basename = segments.at(-1) ?? normalized;

  if (
    segments.includes("_generated") ||
    segments.includes("generated") ||
    segments.includes("dist")
  ) {
    return "generated";
  }
  if (
    segments.includes("test") ||
    segments.includes("tests") ||
    basename.includes(".test.") ||
    basename.includes(".spec.")
  ) {
    return "tests";
  }
  if (
    segments[0] === "docs" ||
    normalized.startsWith(".codex/work/") ||
    basename.endsWith(".md") ||
    basename.endsWith(".html")
  ) {
    return "documentation";
  }
  if (
    segments[0] === "tools" ||
    segments[0] === ".github" ||
    segments[0] === ".vscode" ||
    segments[0] === ".config" ||
    normalized.startsWith(".codex/skills/")
  ) {
    return "tooling";
  }
  if (
    basename === "package.json" ||
    basename.startsWith("tsconfig") ||
    basename.endsWith(".yaml") ||
    basename.endsWith(".yml") ||
    basename.endsWith(".toml") ||
    basename === "pnpm-lock.yaml"
  ) {
    return "configuration";
  }
  if (segments[0] === "apps" || segments[0] === "packages") {
    return "source";
  }
  return "other";
}
