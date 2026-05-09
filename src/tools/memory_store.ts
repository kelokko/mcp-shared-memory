/**
 * memory_store tool handler
 */

import type { SupabaseClient } from "../supabase.js";
import { insertMemory } from "../supabase.js";

interface MemoryStoreArgs {
  content: string;
  embedding: number[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  source?: string;
}

export async function handleMemoryStore(
  supabase: SupabaseClient,
  args: MemoryStoreArgs
) {
  const memory = await insertMemory(supabase, {
    content: args.content,
    embedding: args.embedding,
    tags: args.tags || [],
    metadata: args.metadata || {},
    source: args.source,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          id: memory.id,
          message: "Memory stored successfully",
        }),
      },
    ],
  };
}
