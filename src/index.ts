/**
 * MCP Shared Memory Server
 * 
 * A shared memory lake for AI agents using Model Context Protocol.
 * Stores memories in Supabase with vector embeddings for semantic search.
 * 
 * This implementation manually handles MCP JSON-RPC for Cloudflare Workers compatibility.
 */

import { createSupabaseClient, insertMemory, searchMemories, getMemory, listMemories, deleteMemory } from "./supabase.js";
import { createEmbedding } from "./embeddings.js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
  EMBEDDING_MODEL?: string;
}

// MCP Protocol Types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Tool definitions
const TOOLS = [
  {
    name: "memory_store",
    description: "Store a new memory with automatic vector embedding generation. Use this to save information that should be remembered across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory content to store" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorizing" },
        metadata: { type: "object", description: "Optional metadata object" },
        source: { type: "string", description: "Identifier for the agent storing this memory" },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_search",
    description: "Semantically search memories using natural language. Returns memories ranked by relevance.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        limit: { type: "number", description: "Maximum results (default: 10)" },
        threshold: { type: "number", description: "Similarity threshold 0-1 (default: 0.7)" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_get",
    description: "Retrieve a specific memory by its ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the memory" },
      },
      required: ["id"],
    },
  },
  {
    name: "memory_list",
    description: "List memories with optional filtering.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum results (default: 50)" },
        offset: { type: "number", description: "Pagination offset" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
        source: { type: "string", description: "Filter by source agent" },
      },
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the memory to delete" },
      },
      required: ["id"],
    },
  },
];

// Server info
const SERVER_INFO = {
  name: "mcp-shared-memory",
  version: "0.1.0",
  protocolVersion: "2024-11-05",
};

const SERVER_CAPABILITIES = {
  tools: {},
};

/**
 * Handle MCP JSON-RPC requests
 */
async function handleMcpRequest(request: JsonRpcRequest, env: Env): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: SERVER_INFO.protocolVersion,
            serverInfo: {
              name: SERVER_INFO.name,
              version: SERVER_INFO.version,
            },
            capabilities: SERVER_CAPABILITIES,
          },
        };

      case "initialized":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        };

      case "tools/call":
        return await handleToolCall(id, params as { name: string; arguments?: Record<string, unknown> }, env);

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    };
  }
}

/**
 * Handle tool calls
 */
async function handleToolCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  env: Env
): Promise<JsonRpcResponse> {
  const { name, arguments: args = {} } = params;
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const embeddingModel = env.EMBEDDING_MODEL || "text-embedding-3-small";

  try {
    let result: unknown;

    switch (name) {
      case "memory_store": {
        const content = args.content as string;
        const embedding = await createEmbedding(content, env.OPENAI_API_KEY, embeddingModel);
        const memory = await insertMemory(supabase, {
          content,
          embedding,
          tags: (args.tags as string[]) || [],
          metadata: (args.metadata as Record<string, unknown>) || {},
          source: args.source as string | undefined,
        });
        result = { success: true, id: memory.id, message: "Memory stored successfully" };
        break;
      }

      case "memory_search": {
        const query = args.query as string;
        const embedding = await createEmbedding(query, env.OPENAI_API_KEY, embeddingModel);
        const memories = await searchMemories(supabase, embedding, {
          limit: (args.limit as number) || 10,
          threshold: (args.threshold as number) || 0.7,
          tags: args.tags as string[] | undefined,
        });
        result = {
          success: true,
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            similarity: m.similarity,
            tags: m.tags,
            source: m.source,
            created_at: m.created_at,
          })),
        };
        break;
      }

      case "memory_get": {
        const memory = await getMemory(supabase, args.id as string);
        if (!memory) {
          result = { success: false, error: "Memory not found" };
        } else {
          result = { success: true, memory };
        }
        break;
      }

      case "memory_list": {
        const memories = await listMemories(supabase, {
          limit: (args.limit as number) || 50,
          offset: (args.offset as number) || 0,
          tags: args.tags as string[] | undefined,
          source: args.source as string | undefined,
        });
        result = {
          success: true,
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            tags: m.tags,
            source: m.source,
            created_at: m.created_at,
          })),
        };
        break;
      }

      case "memory_delete": {
        await deleteMemory(supabase, args.id as string);
        result = { success: true, message: "Memory deleted successfully" };
        break;
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        };
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
      },
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }) }],
        isError: true,
      },
    };
  }
}

/**
 * Cloudflare Workers entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/") {
      // GET: Return server info
      if (request.method === "GET") {
        return new Response(
          JSON.stringify({
            name: SERVER_INFO.name,
            version: SERVER_INFO.version,
            description: "Shared memory lake for AI agents",
            tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // POST: Handle MCP JSON-RPC
      if (request.method === "POST") {
        try {
          const body = await request.json() as JsonRpcRequest;
          const response = await handleMcpRequest(body, env);
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32700,
                message: "Parse error",
              },
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
