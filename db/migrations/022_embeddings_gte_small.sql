-- ============================================================
-- 022_embeddings_gte_small.sql – Move Vault embeddings off OpenAI to Supabase gte-small
-- Run in Supabase SQL Editor after 021_handle_new_auth_user.sql
--
-- Supabase's built-in gte-small model produces 384-dim embeddings (vs OpenAI's
-- 1536). It runs inside the edge function with no API key, removing the OpenAI
-- dependency for embeddings. This resizes the vector column + similarity function
-- and rebuilds the index.
--
-- vault_chunks held no usable embeddings (the OpenAI inserts were failing), so
-- truncating + resizing is safe. Re-index from the Vault ("Index for AI search").
-- ============================================================

-- Clear any partial rows and rebuild the embedding column at the new dimension.
TRUNCATE TABLE vault_chunks;

DROP INDEX IF EXISTS vault_chunks_embedding_idx;
ALTER TABLE vault_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE vault_chunks ADD COLUMN embedding vector(384);

CREATE INDEX vault_chunks_embedding_idx
  ON vault_chunks USING hnsw (embedding vector_cosine_ops);

-- Recreate the similarity search at 384 dims (same body; function signature is
-- (uuid, vector, int) regardless of typmod, so CREATE OR REPLACE is fine).
CREATE OR REPLACE FUNCTION match_vault_chunks(
  p_client_id       UUID,
  p_query_embedding VECTOR(384),
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
