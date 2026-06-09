-- ============================================================
-- 018_vault_embeddings.sql – Semantic search layer for the Vault ("brain")
-- Run in Supabase SQL Editor after 017_kb_pinned.sql
--
-- Adds pgvector + a per-chunk embedding table so we can do retrieval-augmented
-- generation ("Ask the Vault") instead of stuffing whole documents into a prompt.
-- Chunks are written/refreshed by the vault-process edge function whenever an
-- item is (re)processed, and searched by the vault-ask edge function.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- pgvector extension (Supabase ships it; lives in the "extensions" schema).
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per text chunk of a vault item. embedding = text-embedding-3-small (1536 dims).
CREATE TABLE IF NOT EXISTS vault_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chunk_index  INT  NOT NULL,
  content      TEXT NOT NULL,
  embedding    VECTOR(1536),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Lookups by item (for delete-then-reinsert on reprocess) and by client (search scope).
CREATE INDEX IF NOT EXISTS vault_chunks_item_idx   ON vault_chunks (item_id);
CREATE INDEX IF NOT EXISTS vault_chunks_client_idx ON vault_chunks (client_id);

-- Approximate-nearest-neighbour index for cosine similarity. HNSW needs no
-- training data (unlike ivfflat), so it works well on a table that grows over time.
CREATE INDEX IF NOT EXISTS vault_chunks_embedding_idx
  ON vault_chunks USING hnsw (embedding vector_cosine_ops);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- All writes happen server-side via the service-role key (edge functions), which
-- bypasses RLS. We still enable RLS and add a client-scoped SELECT policy so that
-- if a chunk is ever read with an end-user JWT it stays tenant-isolated.
ALTER TABLE vault_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_chunks_own_client_select" ON vault_chunks;
CREATE POLICY "vault_chunks_own_client_select"
  ON vault_chunks FOR SELECT
  USING (
    client_id = current_user_client_id()
    OR current_user_role() = 'super_admin'
  );

-- ── Similarity search ─────────────────────────────────────────────────────────
-- Returns the top matching chunks for a client, ordered by cosine similarity.
-- Called from the vault-ask edge function with the service-role client.
CREATE OR REPLACE FUNCTION match_vault_chunks(
  p_client_id       UUID,
  p_query_embedding VECTOR(1536),
  p_match_count     INT DEFAULT 8
)
RETURNS TABLE (
  id          UUID,
  item_id     UUID,
  content     TEXT,
  chunk_index INT,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    vc.id,
    vc.item_id,
    vc.content,
    vc.chunk_index,
    1 - (vc.embedding <=> p_query_embedding) AS similarity
  FROM vault_chunks vc
  WHERE vc.client_id = p_client_id
    AND vc.embedding IS NOT NULL
  ORDER BY vc.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION match_vault_chunks(UUID, VECTOR, INT) TO authenticated, service_role;
