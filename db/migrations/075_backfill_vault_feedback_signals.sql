-- ============================================================
-- 075_backfill_vault_feedback_signals.sql – Unify feedback (Brain 2.0, A)
-- Run in Supabase SQL Editor after 074_content_topics_provenance.sql
--
-- Folds historical Ask-the-Vault feedback (vault_feedback) into the unified
-- brain_signals loop so the Brain can learn from past answers too.
--
-- Portable: older databases' vault_feedback predates the `sources` column (the
-- live feedback route has the same pre-027 fallback), so we detect the column
-- and only include it when present — referencing a missing column would abort.
--
-- Dedupe is PER ROW on (surface, client_id, created_at) — NOT a blanket "skip if
-- any vault_answer exists" — because the dual-write in /api/vault/feedback may
-- already be live, which would otherwise skip the whole backfill. Per-row
-- matching backfills history without duplicating, and stays a no-op on re-run.
-- Idempotent.
-- ============================================================

DO $$
DECLARE
  has_sources boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vault_feedback' AND column_name = 'sources'
  ) INTO has_sources;

  IF has_sources THEN
    EXECUTE $q$
      INSERT INTO brain_signals (client_id, user_id, surface, artifact_text, rating, context, created_at)
      SELECT vf.client_id, vf.user_id, 'vault_answer', left(vf.answer, 8000), vf.rating,
        jsonb_build_object('question', vf.question, 'sources', COALESCE(vf.sources, '[]'::jsonb)), vf.created_at
      FROM vault_feedback vf
      WHERE NOT EXISTS (
        SELECT 1 FROM brain_signals bs
        WHERE bs.surface = 'vault_answer' AND bs.client_id = vf.client_id AND bs.created_at = vf.created_at
      )
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO brain_signals (client_id, user_id, surface, artifact_text, rating, context, created_at)
      SELECT vf.client_id, vf.user_id, 'vault_answer', left(vf.answer, 8000), vf.rating,
        jsonb_build_object('question', vf.question), vf.created_at
      FROM vault_feedback vf
      WHERE NOT EXISTS (
        SELECT 1 FROM brain_signals bs
        WHERE bs.surface = 'vault_answer' AND bs.client_id = vf.client_id AND bs.created_at = vf.created_at
      )
    $q$;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('075_backfill_vault_feedback_signals.sql')
ON CONFLICT DO NOTHING;
