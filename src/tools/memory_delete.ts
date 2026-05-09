/**
 * memory_delete tool handler
 */

import type { SupabaseClient } from "../supabase.js";
import { deleteMemory } from "../supabase.js";

interface MemoryDeleteArgs {
  id: string;
}

export async function handleMemoryDelete(
  supabase: SupabaseClient,
  args: MemoryDeleteArgs
) {
  await deleteMemory(supabase, args.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: "Memory deleted successfully",
        }),
      },
    ],
  };
}
