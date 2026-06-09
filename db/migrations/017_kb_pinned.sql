-- ============================================================
-- 017_kb_pinned.sql – Preserve manually-edited KB entries across regeneration
-- Run in Supabase SQL Editor after 016_missing_indexes.sql
-- ============================================================

-- When an admin edits a generated KB entry we mark it is_pinned = true so the
-- next "Regenerate" run keeps it instead of wiping the whole knowledge base.
ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Speeds up the "delete only non-pinned" cleanup in kb-generate.
CREATE INDEX IF NOT EXISTS kb_entries_client_pinned_idx
  ON kb_entries (client_id, is_pinned);
