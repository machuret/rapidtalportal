-- ============================================================
-- 074_content_topics_provenance.sql – "Why this?" provenance (Brain 2.0, E)
-- Run in Supabase SQL Editor after 073_brain_score_history.sql
--
-- Stores what the Brain used to produce a suggestion (which profile fields,
-- how many Vault docs, how many learned lessons, the fit) so the UI can show a
-- transparent "Why this?" on every idea — building trust. Idempotent.
-- ============================================================

ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS why JSONB;

INSERT INTO schema_migrations (version) VALUES ('074_content_topics_provenance.sql')
ON CONFLICT DO NOTHING;
