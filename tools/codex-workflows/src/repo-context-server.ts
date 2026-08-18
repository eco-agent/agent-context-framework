#!/usr/bin/env node

import process from "node:process";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  formatRepoContextBatchResult,
  formatRepoContextResult,
  RepoContextRuntime,
  type RepoContextExecutionRequest,
} from "./repo-context-runtime.js";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("read"),
    path: z.string().min(1).max(500),
    startLine: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(200).optional(),
    cursor: z.string().min(1).max(512).optional(),
  }).strict(),
  z.object({
    operation: z.literal("search"),
    path: z.string().min(1).max(500),
    query: z.string().min(1).max(1_000),
    limit: z.number().int().positive().max(50).optional(),
    contextLines: z.number().int().min(0).max(10).optional(),
    cursor: z.string().min(1).max(512).optional(),
  }).strict(),
]);

const inputSchema = z.union([
  requestSchema,
  z.object({
    operation: z.literal("batch"),
    requests: z.array(requestSchema).min(1).max(4),
  }).strict(),
]);

const runtime = await RepoContextRuntime.open(process.cwd());

serveStdio(() => {
  const server = new McpServer({
    name: "agent-context-repository-context",
    version: "1.0.0",
  });
  server.registerTool(
    "repo_context",
    {
      description: "Read or fixed-string search repository context. Batch 1-4 known operations in one call; outputs remain bounded and cursor-based.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (request) => {
      try {
        const input = request as RepoContextExecutionRequest;
        const result = input.operation === "batch"
          ? await runtime.execute(input)
          : await runtime.execute(input);
        const batch = "results" in result;
        return {
          content: [{
            type: "text",
            text: batch
              ? formatRepoContextBatchResult(result)
              : formatRepoContextResult(result),
          }],
          structuredContent: batch
            ? {
                outcome: result.outcome,
                results: result.results.map((item) => ({
                  outcome: item.outcome,
                  metadata: item.metadata,
                })),
                metadata: result.metadata,
              }
            : {
                outcome: result.outcome,
                metadata: result.metadata,
              },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `repo_context: ${message}` }],
        };
      }
    },
  );
  return server;
});
