-- ============================================================
-- 070_content_topics_brain.sql – Brain awareness on content topics
-- Run in Supabase SQL Editor after 069_brain_signals.sql
--
-- - flagged / flag_reason: a human marked a topic as "makes no sense" (distinct
--   from a plain reject). Captured as a brain_signal too.
-- - ai_fit_score / ai_flagged: the Brain's own pre-screen — how well a generated
--   topic fits the company (0-100), and whether it fell below the bar so it's
--   surfaced with a warning before a human wastes time on it.
-- Idempotent.
-- ============================================================

ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS flagged      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason  TEXT,
  ADD COLUMN IF NOT EXISTS ai_fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_flagged   BOOLEAN NOT NULL DEFAULT false;

INSERT INTO schema_migrations (version) VALUES ('070_content_topics_brain.sql')
ON CONFLICT DO NOTHING;
