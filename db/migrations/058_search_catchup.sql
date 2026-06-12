-- ============================================================
-- 058_search_catchup.sql – (re)establish the Vault search layer
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Diagnosis 2026-06: production was missing migrations 018/020/022/023 —
-- vault_items.fts didn't exist, so every keyword search inside vault-ask
-- errored and was silently skipped, and vault_chunks had nowhere to store
-- embeddings. Ask the Vault was left answering from Company DNA scraps
-- ("Sources (2)"). This single idempotent script brings any database to the
-- correct end-state regardless of which of those migrations ran:
--   * pgvector + vault_chunks at gte-small dims (384), rebuilt if found at
--     the legacy 1536 dims
--   * match_vault_chunks(384)
--   * FTS generated columns + GIN indexes on vault_items, kb_entries, sops
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Embedding chunks (018, at 022's 384 dims) ───────────────────────────────
CREATE TABLE IF NOT EXISTS vault_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chunk_index  INT  NOT NULL,
  content      TEXT NOT NULL,
  embedding    VECTOR(384),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_chunks_item_idx   ON vault_chunks (item_id);
CREATE INDEX IF NOT EXISTS vault_chunks_client_idx ON vault_chunks (client_id);

-- If the table pre-existed at the legacy 1536 dims, rebuild the column at 384.
-- (pgvector stores the dimension in atttypmod.)
DO $$
DECLARE dim INT;
BEGIN
  SELECT atttypmod INTO dim
  FROM pg_attribute
  WHERE attrelid = 'vault_chunks'::regclass AND attname = 'embedding' AND NOT attisdropped;
  IF dim IS DISTINCT FROM 384 THEN
    TRUNCATE TABLE vault_chunks;
    DROP INDEX IF EXISTS vault_chunks_embedding_idx;
    ALTER TABLE vault_chunks DROP COLUMN IF EXISTS embedding;
    ALTER TABLE vault_chunks ADD COLUMN embedding VECTOR(384);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vault_chunks_embedding_idx
  ON vault_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE vault_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vault_chunks_own_client_select" ON vault_chunks;
CREATE POLICY "vault_chunks_own_client_select"
  ON vault_chunks FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

-- ── Similarity search (022) ──────────────────────────────────────────────────
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

-- ── Full-text search columns (020 + 023) ─────────────────────────────────────
-- Defensive per-table setup. Production turned out to have fts ALREADY present
-- as a GENERATED column on some tables (023 applied) but missing on others
-- (020 never applied) — and a generated column can't be UPDATEd (428C9), while
-- re-adding it GENERATED fails as non-immutable (42P17) on this PG version.
-- So, per table: if fts is missing → add a plain column maintained by a
-- trigger + backfill; if it's plain → (re)attach the trigger + backfill;
-- if it's GENERATED → leave it alone, it already self-maintains.

CREATE OR REPLACE FUNCTION vault_items_fts_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.fts := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.ai_summary, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(NEW.raw_content, ''));
  RETURN NEW;
END $fn$;

DO $do$
DECLARE gen TEXT;
BEGIN
  SELECT attgenerated::text INTO gen FROM pg_attribute
  WHERE attrelid = 'vault_items'::regclass AND attname = 'fts' AND NOT attisdropped;
  IF gen IS NULL THEN
    ALTER TABLE vault_items ADD COLUMN fts tsvector;
    gen := '';
  END IF;
  IF gen = '' THEN
    DROP TRIGGER IF EXISTS vault_items_fts_trg ON vault_items;
    CREATE TRIGGER vault_items_fts_trg BEFORE INSERT OR UPDATE ON vault_items
      FOR EACH ROW EXECUTE FUNCTION vault_items_fts_update();
    UPDATE vault_items SET fts = to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(ai_summary, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '') || ' ' || coalesce(raw_content, ''));
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS vault_items_fts_idx ON vault_items USING gin (fts);
CREATE INDEX IF NOT EXISTS vault_items_client_created_idx
  ON vault_items (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION kb_entries_fts_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.fts := to_tsvector('english', coalesce(NEW.question, '') || ' ' || coalesce(NEW.answer, ''));
  RETURN NEW;
END $fn$;

DO $do$
DECLARE gen TEXT;
BEGIN
  SELECT attgenerated::text INTO gen FROM pg_attribute
  WHERE attrelid = 'kb_entries'::regclass AND attname = 'fts' AND NOT attisdropped;
  IF gen IS NULL THEN
    ALTER TABLE kb_entries ADD COLUMN fts tsvector;
    gen := '';
  END IF;
  IF gen = '' THEN
    DROP TRIGGER IF EXISTS kb_entries_fts_trg ON kb_entries;
    CREATE TRIGGER kb_entries_fts_trg BEFORE INSERT OR UPDATE ON kb_entries
      FOR EACH ROW EXECUTE FUNCTION kb_entries_fts_update();
    UPDATE kb_entries SET fts = to_tsvector('english', coalesce(question, '') || ' ' || coalesce(answer, ''));
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS kb_entries_fts_idx ON kb_entries USING gin (fts);

CREATE OR REPLACE FUNCTION sops_fts_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.fts := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.body, ''));
  RETURN NEW;
END $fn$;

DO $do$
DECLARE gen TEXT;
BEGIN
  SELECT attgenerated::text INTO gen FROM pg_attribute
  WHERE attrelid = 'sops'::regclass AND attname = 'fts' AND NOT attisdropped;
  IF gen IS NULL THEN
    ALTER TABLE sops ADD COLUMN fts tsvector;
    gen := '';
  END IF;
  IF gen = '' THEN
    DROP TRIGGER IF EXISTS sops_fts_trg ON sops;
    CREATE TRIGGER sops_fts_trg BEFORE INSERT OR UPDATE ON sops
      FOR EACH ROW EXECUTE FUNCTION sops_fts_update();
    UPDATE sops SET fts = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''));
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS sops_fts_idx ON sops USING gin (fts);

INSERT INTO schema_migrations (version) VALUES
  ('018_vault_embeddings.sql'),
  ('020_vault_search.sql'),
  ('022_embeddings_gte_small.sql'),
  ('023_knowledge_fts.sql'),
  ('058_search_catchup.sql')
ON CONFLICT DO NOTHING;
