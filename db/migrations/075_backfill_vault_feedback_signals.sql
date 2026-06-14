-- ============================================================
-- 075_backfill_vault_feedback_signals.sql – Unify feedback (Brain 2.0, A)
-- Run in Supabase SQL Editor after 074_content_topics_provenance.sql
--
-- Folds historical Ask-the-Vault feedback (vault_feedback) into the unified
-- brain_signals loop so the Brain can learn from past answers too. Guarded so
-- re-running is a no-op once any vault_answer signal exists. Idempotent.
-- ============================================================

INSERT INTO brain_signals (client_id, user_id, surface, artifact_text, rating, context, created_at)
SELECT
  vf.client_id,
  vf.user_id,
  'vault_answer',
  left(vf.answer, 8000),
  vf.rating,
  jsonb_build_object('question', vf.question, 'sources', COALESCE(vf.sources, '[]'::jsonb)),
  vf.created_at
FROM vault_feedback vf
WHERE NOT EXISTS (SELECT 1 FROM brain_signals bs WHERE bs.surface = 'vault_answer');

INSERT INTO schema_migrations (version) VALUES ('075_backfill_vault_feedback_signals.sql')
ON CONFLICT DO NOTHING;
