# Shared Memory MCP

> A shared memory lake for AI agents — store and retrieve memories across Claude, Cursor, ElevenLabs, and more.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that provides a **shared memory layer** for AI agents. Any MCP-compatible client can store and retrieve memories from a central Supabase database with vector search.

**Use cases:**
- 🤖 Share context between different AI tools (Cursor, Claude Desktop, ElevenLabs agents)
- 🧠 Give your AI agents persistent long-term memory
- 🔍 Semantic search over stored memories using embeddings
- 🏷️ Organize memories with tags and metadata

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              MCP Shared Memory Server               │
│           (Cloudflare Workers / HTTP)               │
├─────────────────────────────────────────────────────┤
│  Tools:                                             │
│  • memory_store   — Save a memory with embedding    │
│  • memory_search  — Semantic search via vectors     │
│  • memory_get     — Retrieve by ID                  │
│  • memory_list    — List with filters               │
│  • memory_delete  — Remove a memory                 │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Supabase (pgvector)                    │
│  • memories table with vector embeddings            │
│  • Similarity search via cosine distance            │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Set up Supabase

Run this SQL in your Supabase SQL editor:

```sql
-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Create memories table
create table memories (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb default '{}',
  tags text[] default '{}',
  source text,  -- which agent created this
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for fast similarity search
create index on memories using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- Create similarity search function
create or replace function match_memories (
  query_embedding extensions.vector(1536),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  tags text[],
  source text,
  similarity float,
  created_at timestamptz
)
language sql stable
as $$
  select
    id,
    content,
    metadata,
    tags,
    source,
    1 - (embedding <=> query_embedding) as similarity,
    created_at
  from memories
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### 2. Deploy to Cloudflare Workers

```bash
# Clone the repo
git clone https://github.com/kelokko/mcp-shared-memory.git
cd mcp-shared-memory

# Install dependencies
npm install

# Set your secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy
```

### 3. Connect from your MCP client

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "shared-memory": {
      "url": "https://mcp-shared-memory.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

**Cursor** (Settings → MCP):
```json
{
  "shared-memory": {
    "url": "https://mcp-shared-memory.<your-subdomain>.workers.dev/mcp"
  }
}
```

## Tools

### `memory_store`
Store a new memory with automatic embedding generation.

```typescript
{
  content: string,      // The memory content
  tags?: string[],      // Optional tags for filtering
  metadata?: object,    // Optional metadata
  source?: string       // Which agent is storing this
}
```

### `memory_search`
Semantic search across memories.

```typescript
{
  query: string,        // Natural language search query
  limit?: number,       // Max results (default: 10)
  threshold?: number,   // Similarity threshold 0-1 (default: 0.7)
  tags?: string[]       // Filter by tags
}
```

### `memory_get`
Retrieve a specific memory by ID.

```typescript
{
  id: string            // Memory UUID
}
```

### `memory_list`
List memories with optional filters.

```typescript
{
  limit?: number,       // Max results (default: 50)
  offset?: number,      // Pagination offset
  tags?: string[],      // Filter by tags
  source?: string       // Filter by source agent
}
```

### `memory_delete`
Delete a memory by ID.

```typescript
{
  id: string            // Memory UUID
}
```

## Local Development

```bash
# Install dependencies
npm install

# Create .dev.vars with your secrets
cp .env.example .dev.vars

# Run locally
npm run dev
```

## Why MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is an open standard for connecting AI models to external tools and data. By implementing MCP, this memory server works with:

- Claude Desktop
- Cursor
- VS Code (with MCP extension)
- Any custom agent using the MCP SDK
- ElevenLabs Conversational AI (via HTTP)

## Contributing

PRs welcome! This is an open source project.

## License

MIT © Mila R

---

Built by [kelokko](https://github.com/kelokko) and her AI agent Atlas
