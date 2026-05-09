/**
 * Supabase client configuration
 */

import { createClient, SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";

export type SupabaseClient = BaseSupabaseClient;

export interface Memory {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  source?: string;
  original_date?: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryMatch extends Omit<Memory, "embedding" | "updated_at"> {
  similarity: number;
}

/**
 * Create a Supabase client instance
 */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Insert a new memory
 */
export async function insertMemory(
  client: SupabaseClient,
  memory: Omit<Memory, "id" | "created_at" | "updated_at">
): Promise<Memory> {
  const { data, error } = await client
    .from("memories")
    .insert(memory)
    .select()
    .single();

  if (error) throw new Error(`Failed to insert memory: ${error.message}`);
  return data;
}

/**
 * Search memories by vector similarity
 */
export async function searchMemories(
  client: SupabaseClient,
  embedding: number[],
  options: {
    threshold?: number;
    limit?: number;
    tags?: string[];
  } = {}
): Promise<MemoryMatch[]> {
  const { threshold = 0.7, limit = 10, tags } = options;

  let query = client.rpc("match_memories", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });

  // Note: Tag filtering would need to be done in the SQL function or post-filter
  const { data, error } = await query;

  if (error) throw new Error(`Failed to search memories: ${error.message}`);

  // Post-filter by tags if specified
  if (tags && tags.length > 0) {
    return (data || []).filter((m: MemoryMatch) =>
      tags.some((tag) => m.tags?.includes(tag))
    );
  }

  return data || [];
}

/**
 * Get a memory by ID
 */
export async function getMemory(
  client: SupabaseClient,
  id: string
): Promise<Memory | null> {
  const { data, error } = await client
    .from("memories")
    .select("id, content, metadata, tags, source, original_date, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to get memory: ${error.message}`);
  }
  return data;
}

/**
 * List memories with optional filters
 */
export async function listMemories(
  client: SupabaseClient,
  options: {
    limit?: number;
    offset?: number;
    tags?: string[];
    source?: string;
  } = {}
): Promise<Memory[]> {
  const { limit = 50, offset = 0, tags, source } = options;

  let query = client
    .from("memories")
    .select("id, content, metadata, tags, source, original_date, created_at, updated_at")
    .order("original_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) {
    query = query.eq("source", source);
  }

  if (tags && tags.length > 0) {
    query = query.overlaps("tags", tags);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to list memories: ${error.message}`);
  return data || [];
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(
  client: SupabaseClient,
  id: string
): Promise<boolean> {
  const { error } = await client.from("memories").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete memory: ${error.message}`);
  return true;
}
