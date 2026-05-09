/**
 * memory_list tool handler
 */

import type { SupabaseClient } from "../supabase.js";
import { listMemories } from "../supabase.js";

interface MemoryListArgs {
  limit?: number;
  offset?: number;
  tags?: string[];
  source?: string;
}

export async function handleMemoryList(
  supabase: SupabaseClient,
  args: MemoryListArgs
) {
  const memories = await listMemories(supabase, {
    limit: args.limit || 50,
    offset: args.offset || 0,
    tags: args.tags,
    source: args.source,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            tags: m.tags,
            source: m.source,
            created_at: m.created_at,
          })),
        }),
      },
    ],
  };
}
