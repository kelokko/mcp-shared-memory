/**
 * MCP Shared Memory Server
 * 
 * A shared memory lake for AI agents using Model Context Protocol.
 * Stores memories in Supabase with vector embeddings for semantic search.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createSupabaseClient } from "./supabase.js";
import { createEmbedding } from "./embeddings.js";
import {
  handleMemoryStore,
  handleMemorySearch,
  handleMemoryGet,
  handleMemoryList,
  handleMemoryDelete,
} from "./tools/index.js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
  EMBEDDING_MODEL?: string;
}

// Zod schemas for tool inputs
const MemoryStoreSchema = z.object({
  content: z.string().describe("The memory content to store"),
  tags: z.array(z.string()).optional().describe("Optional tags for categorizing the memory"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata object"),
  source: z.string().optional().describe("Identifier for the agent storing this memory"),
});

const MemorySearchSchema = z.object({
  query: z.string().describe("Natural language search query"),
  limit: z.number().optional().describe("Maximum number of results (default: 10)"),
  threshold: z.number().optional().describe("Minimum similarity threshold 0-1 (default: 0.7)"),
  tags: z.array(z.string()).optional().describe("Filter results by tags"),
});

const MemoryGetSchema = z.object({
  id: z.string().describe("The UUID of the memory to retrieve"),
});

const MemoryListSchema = z.object({
  limit: z.number().optional().describe("Maximum number of results (default: 50)"),
  offset: z.number().optional().describe("Offset for pagination"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  source: z.string().optional().describe("Filter by source agent"),
});

const MemoryDeleteSchema = z.object({
  id: z.string().describe("The UUID of the memory to delete"),
});

/**
 * Create and configure the MCP server
 */
function createMcpServer(env: Env) {
  const server = new McpServer({
    name: "shared-memory",
    version: "0.1.0",
  });

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const embeddingModel = env.EMBEDDING_MODEL || "text-embedding-3-small";

  // Register tools with Zod schemas
  server.tool(
    "memory_store",
    "Store a new memory with automatic vector embedding generation. Use this to save information that should be remembered across sessions.",
    MemoryStoreSchema.shape,
    async (args) => {
      const parsed = MemoryStoreSchema.parse(args);
      const embedding = await createEmbedding(
        parsed.content,
        env.OPENAI_API_KEY,
        embeddingModel
      );
      return handleMemoryStore(supabase, { ...parsed, embedding });
    }
  );

  server.tool(
    "memory_search",
    "Semantically search memories using natural language. Returns memories ranked by relevance.",
    MemorySearchSchema.shape,
    async (args) => {
      const parsed = MemorySearchSchema.parse(args);
      const embedding = await createEmbedding(
        parsed.query,
        env.OPENAI_API_KEY,
        embeddingModel
      );
      return handleMemorySearch(supabase, { ...parsed, embedding });
    }
  );

  server.tool(
    "memory_get",
    "Retrieve a specific memory by its ID",
    MemoryGetSchema.shape,
    async (args) => {
      const parsed = MemoryGetSchema.parse(args);
      return handleMemoryGet(supabase, parsed);
    }
  );

  server.tool(
    "memory_list",
    "List memories with optional filtering. Use for browsing stored memories.",
    MemoryListSchema.shape,
    async (args) => {
      const parsed = MemoryListSchema.parse(args);
      return handleMemoryList(supabase, parsed);
    }
  );

  server.tool(
    "memory_delete",
    "Delete a memory by ID",
    MemoryDeleteSchema.shape,
    async (args) => {
      const parsed = MemoryDeleteSchema.parse(args);
      return handleMemoryDelete(supabase, parsed);
    }
  );

  return server;
}

// Tool definitions for GET endpoint info
const TOOLS = [
  { name: "memory_store", description: "Store a new memory with automatic vector embedding generation" },
  { name: "memory_search", description: "Semantically search memories using natural language" },
  { name: "memory_get", description: "Retrieve a specific memory by its ID" },
  { name: "memory_list", description: "List memories with optional filtering" },
  { name: "memory_delete", description: "Delete a memory by ID" },
];

/**
 * Cloudflare Workers entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/") {
      const server = createMcpServer(env);
      
      // Handle MCP JSON-RPC request
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const response = await server.handleRequest(body);
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: error instanceof Error ? error.message : "Internal error",
              },
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      // Return server info for GET
      if (request.method === "GET") {
        return new Response(
          JSON.stringify({
            name: "mcp-shared-memory",
            version: "0.1.0",
            description: "Shared memory lake for AI agents",
            tools: TOOLS,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
