-- ============================================================
-- 027_learning_loops.sql – Close the learning loops (gaps + feedback workflows)
-- Run in Supabase SQL Editor after 026_vault_meta_curated.sql
--
-- - vault_queries.dismissed: gaps can be dismissed as noise (workflow state).
-- - vault_feedback.sources: which sources produced an answer, so a 👎 can be
--   traced back to the offending document.
-- - vault_feedback.resolved: reviewed/corrected answers leave the review queue.
-- Idempotent.
-- ============================================================

ALTER TABLE vault_queries
  ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE vault_feedback
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false;
