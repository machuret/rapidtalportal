-- ============================================================
-- 017_kb_pinned.sql – Preserve manually-edited KB entries across regeneration
-- Run in Supabase SQL Editor after 016_missing_indexes.sql
--
-- Self-contained & idempotent: if kb_entries does not yet exist (e.g. an
-- earlier migration was skipped) this recreates it in its full, current shape
-- before applying the pinned-entry changes. Safe to re-run on any DB state.
-- ============================================================

-- Base table (from 001_initial.sql) — no-op if it already exists.
CREATE TABLE IF NOT EXISTS kb_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  answer           TEXT NOT NULL,
  source_vault_ids UUID[] DEFAULT '{}',
  generated_at     TIMESTAMPTZ DEFAULT now()
);

-- Category column + index (from 008_kb_categories.sql) — no-op if present.
ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS kb_entries_category_idx ON kb_entries (category);

-- When an admin edits a generated KB entry we mark it is_pinned = true so the
-- next "Regenerate" run keeps it instead of wiping the whole knowledge base.
ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Speeds up the "delete only non-pinned" cleanup in kb-generate.
CREATE INDEX IF NOT EXISTS kb_entries_client_pinned_idx
  ON kb_entries (client_id, is_pinned);
