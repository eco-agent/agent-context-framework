import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  RepositoryContextTool,
  type RepositoryContextResult,
} from "./repository-context.js";

const inputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("read"),
    path: z.string().min(1).max(500),
    startLine: z.number().int().positive().optional(),
    lines: z.number().int().positive().max(200).optional(),
    cursor: z.string().min(1).max(512).optional(),
  }).strict(),
  z.object({
    operation: z.literal("search"),
    path: z.string().min(1).max(500),
    query: z.string().min(1).max(1_000),
    maxMatches: z.number().int().positive().max(50).optional(),
    contextLines: z.number().int().min(0).max(10).optional(),
    cursor: z.string().min(1).max(512).optional(),
  }).strict(),
]);

export function createRepositoryContextMcpServer(tool: RepositoryContextTool): McpServer {
  const server = new McpServer({
    name: "agent-context-repository-context",
    version: "1.0.0",
  });
  server.registerTool(
    "repo_context",
    {
      description: "Read or fixed-string search within the explicitly authorized repository root. Results use fixed normal limits and continuation cursors.",
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
        const result = request.operation === "read"
          ? await tool.read({
              path: request.path,
              ...(request.startLine === undefined ? {} : { startLine: request.startLine }),
              ...(request.lines === undefined ? {} : { lines: request.lines }),
              ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
            })
          : await tool.search({
              path: request.path,
              query: request.query,
              ...(request.maxMatches === undefined ? {} : { maxMatches: request.maxMatches }),
              ...(request.contextLines === undefined ? {} : { contextLines: request.contextLines }),
              ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
            });
        return {
          content: [{ type: "text", text: formatRepositoryContextResult(result) }],
          structuredContent: {
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
}

export function formatRepositoryContextResult(result: RepositoryContextResult): string {
  const footer = `[repo_context outcome=${result.outcome} metadata=${JSON.stringify(result.metadata)}]`;
  return result.content.length === 0 ? footer : `${result.content}\n${footer}`;
}
