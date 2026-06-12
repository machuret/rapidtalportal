-- ============================================================
-- 057_vault_dedupe.sql – enforce vault content de-duplication
-- Run in Supabase SQL Editor after 056_notebook_log_restore.sql
--
-- 015 added vault_items.content_hash with a NON-unique index, and dedup was
-- only enforced in application code (check-then-insert) — which races and
-- can't protect every ingestion path. This makes uniqueness a DB invariant:
-- a unique partial index on (client_id, content_hash) so the same content can
-- never be indexed twice for a client, no matter the path or timing.
--
-- Existing duplicates are resolved NON-destructively: the earliest item per
-- (client_id, content_hash) keeps its hash; later exact copies have their hash
-- nulled (rows preserved, so nothing referencing them breaks — they can be
-- removed from the Vault UI). Idempotent.
-- ============================================================

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY client_id, content_hash
           ORDER BY created_at NULLS FIRST, id
         ) AS rn
  FROM vault_items
  WHERE content_hash IS NOT NULL
)
UPDATE vault_items v
SET content_hash = NULL
FROM ranked r
WHERE v.id = r.id AND r.rn > 1;

-- Replace the non-unique lookup index with a unique partial index.
DROP INDEX IF EXISTS vault_items_content_hash_idx;
CREATE UNIQUE INDEX IF NOT EXISTS vault_items_content_hash_uidx
  ON vault_items (client_id, content_hash)
  WHERE content_hash IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('057_vault_dedupe.sql')
ON CONFLICT DO NOTHING;
