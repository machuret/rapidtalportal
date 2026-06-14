-- ============================================================
-- 077_content_outcomes.sql – Learn from real outcomes (Brain 2.0, Milestone D)
-- Run in Supabase SQL Editor after 076_brain_memory_v2.sql
--
-- Lets the Brain learn from what actually happened to a draft, not just whether
-- it was approved:
--   ai_original — the AI's first draft, captured at generation and never
--                 overwritten, so we can measure how much a human rewrote it
--                 before approving (kept-verbatim = win; heavy rewrite = miss).
--   outcome     — a manual real-world verdict on approved content ('win'/'miss').
--   outcome_at  — when that verdict was recorded.
-- Idempotent.
-- ============================================================

ALTER TABLE content_pieces
  ADD COLUMN IF NOT EXISTS ai_original TEXT,
  ADD COLUMN IF NOT EXISTS outcome     TEXT,
  ADD COLUMN IF NOT EXISTS outcome_at  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_pieces_outcome_check') THEN
    ALTER TABLE content_pieces
      ADD CONSTRAINT content_pieces_outcome_check CHECK (outcome IS NULL OR outcome IN ('win', 'miss'));
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('077_content_outcomes.sql')
ON CONFLICT DO NOTHING;
