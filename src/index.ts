/**
 * MCP Shared Memory Server
 * 
 * A shared memory lake for AI agents using Model Context Protocol.
 * Stores memories in Supabase with vector embeddings for semantic search.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSupabaseClient, type SupabaseClient } from "./supabase.js";
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

// Tool definitions for MCP
const TOOLS = [
  {
    name: "memory_store",
    description: "Store a new memory with automatic vector embedding generation. Use this to save information that should be remembered across sessions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The memory content to store",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for categorizing the memory",
        },
        metadata: {
          type: "object",
          description: "Optional metadata object",
        },
        source: {
          type: "string",
          description: "Identifier for the agent storing this memory (e.g., 'cursor', 'claude', 'elevenlabs')",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_search",
    description: "Semantically search memories using natural language. Returns memories ranked by relevance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
        threshold: {
          type: "number",
          description: "Minimum similarity threshold 0-1 (default: 0.7)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter results by tags",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_get",
    description: "Retrieve a specific memory by its ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The UUID of the memory to retrieve",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "memory_list",
    description: "List memories with optional filtering. Use for browsing stored memories.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (default: 50)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags",
        },
        source: {
          type: "string",
          description: "Filter by source agent",
        },
      },
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The UUID of the memory to delete",
        },
      },
      required: ["id"],
    },
  },
];

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

  // Register tools
  server.tool(
    "memory_store",
    TOOLS[0].inputSchema,
    async (args) => {
      const embedding = await createEmbedding(
        args.content as string,
        env.OPENAI_API_KEY,
        embeddingModel
      );
      return handleMemoryStore(supabase, { ...args, embedding });
    }
  );

  server.tool(
    "memory_search",
    TOOLS[1].inputSchema,
    async (args) => {
      const embedding = await createEmbedding(
        args.query as string,
        env.OPENAI_API_KEY,
        embeddingModel
      );
      return handleMemorySearch(supabase, { ...args, embedding });
    }
  );

  server.tool(
    "memory_get",
    TOOLS[2].inputSchema,
    async (args) => handleMemoryGet(supabase, args)
  );

  server.tool(
    "memory_list",
    TOOLS[3].inputSchema,
    async (args) => handleMemoryList(supabase, args)
  );

  server.tool(
    "memory_delete",
    TOOLS[4].inputSchema,
    async (args) => handleMemoryDelete(supabase, args)
  );

  return server;
}

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
            tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
