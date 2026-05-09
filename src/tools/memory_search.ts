/**
 * memory_search tool handler
 */

import type { SupabaseClient } from "../supabase.js";
import { searchMemories } from "../supabase.js";

interface MemorySearchArgs {
  query: string;
  embedding: number[];
  limit?: number;
  threshold?: number;
  tags?: string[];
}

export async function handleMemorySearch(
  supabase: SupabaseClient,
  args: MemorySearchArgs
) {
  const results = await searchMemories(supabase, args.embedding, {
    limit: args.limit || 10,
    threshold: args.threshold || 0.7,
    tags: args.tags,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          count: results.length,
          memories: results.map((m) => ({
            id: m.id,
            content: m.content,
            similarity: m.similarity,
            tags: m.tags,
            source: m.source,
            created_at: m.created_at,
          })),
        }),
      },
    ],
  };
}
