-- ============================================================
-- 023_knowledge_fts.sql – Full-text search on KB + SOPs for the unified "Ask the Vault" brain
-- Run in Supabase SQL Editor after 022_embeddings_gte_small.sql
--
-- Ask the Vault now answers from the whole brain: Company DNA (always included),
-- Knowledge Base, SOPs, and Vault docs. DNA is one authoritative row and Vault
-- docs use the existing vector index; KB + SOPs are retrieved via these FTS
-- indexes (no embedding needed). Idempotent.
-- ============================================================

ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(question, '') || ' ' || coalesce(answer, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS kb_entries_fts_idx ON kb_entries USING gin (fts);

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS sops_fts_idx ON sops USING gin (fts);
