#!/usr/bin/env node

import process from "node:process";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { RepositoryContextTool } from "./repository-context.js";
import { createRepositoryContextMcpServer } from "./mcp-server.js";

try {
  const root = parseArguments(process.argv.slice(2));
  const tool = await RepositoryContextTool.open(root);
  serveStdio(() => createRepositoryContextMcpServer(tool));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parseArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--root" || arguments_[1] === undefined) {
    throw new Error("Repository-context MCP requires exactly one explicit --root path.");
  }
  return arguments_[1];
}
