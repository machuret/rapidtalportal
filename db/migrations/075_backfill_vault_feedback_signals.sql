-- ============================================================
-- 075_backfill_vault_feedback_signals.sql – Unify feedback (Brain 2.0, A)
-- Run in Supabase SQL Editor after 074_content_topics_provenance.sql
--
-- Folds historical Ask-the-Vault feedback (vault_feedback) into the unified
-- brain_signals loop so the Brain can learn from past answers too.
--
-- Dedupe is PER ROW on (surface, client_id, created_at) — NOT a blanket "skip if
-- any vault_answer exists". The dual-write in /api/vault/feedback may already be
-- live in prod, so a blanket guard would skip the whole backfill the moment one
-- new answer was rated. Per-row matching backfills history without duplicating,
-- and stays a no-op on re-run. Idempotent.
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
WHERE NOT EXISTS (
  SELECT 1 FROM brain_signals bs
  WHERE bs.surface = 'vault_answer'
    AND bs.client_id = vf.client_id
    AND bs.created_at = vf.created_at
);

INSERT INTO schema_migrations (version) VALUES ('075_backfill_vault_feedback_signals.sql')
ON CONFLICT DO NOTHING;
