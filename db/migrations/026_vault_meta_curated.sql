-- ============================================================
-- 026_vault_meta_curated.sql – Respect human-curated metadata
-- Run in Supabase SQL Editor after 025_vault_feedback.sql
--
-- When a person sets an item's category/tags in the edit drawer, vault-process
-- previously overwrote them with AI values on the next reprocess. This flag
-- marks items whose metadata a human has curated; vault-process preserves
-- category/tags on such items and only refreshes the summary/embeddings.
-- Idempotent.
-- ============================================================

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS meta_curated BOOLEAN NOT NULL DEFAULT false;
