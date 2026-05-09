/**
 * memory_get tool handler
 */

import type { SupabaseClient } from "../supabase.js";
import { getMemory } from "../supabase.js";

interface MemoryGetArgs {
  id: string;
}

export async function handleMemoryGet(
  supabase: SupabaseClient,
  args: MemoryGetArgs
) {
  const memory = await getMemory(supabase, args.id);

  if (!memory) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "Memory not found",
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          memory: {
            id: memory.id,
            content: memory.content,
            metadata: memory.metadata,
            tags: memory.tags,
            source: memory.source,
            created_at: memory.created_at,
            updated_at: memory.updated_at,
          },
        }),
      },
    ],
  };
}
