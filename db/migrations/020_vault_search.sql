-- ============================================================
-- 020_vault_search.sql – Full-text search for the Vault (scale: server-side search)
-- Run in Supabase SQL Editor after 019_impersonation_log.sql
--
-- Today the Vault list loads up to 100 items and filters in-memory, which does
-- not scale per-tenant. This adds a generated tsvector + GIN index so search can
-- run in Postgres against title + summary + tags + content, paginated server-side.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(ai_summary, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '') || ' ' ||
      coalesce(raw_content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS vault_items_fts_idx ON vault_items USING gin (fts);

-- Keyset/ordering + paging support (client + recency).
CREATE INDEX IF NOT EXISTS vault_items_client_created_idx
  ON vault_items (client_id, created_at DESC);
