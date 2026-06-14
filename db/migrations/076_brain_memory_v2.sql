-- ============================================================
-- 076_brain_memory_v2.sql – A memory that thinks (Brain 2.0, Milestone B)
-- Run in Supabase SQL Editor after 075_backfill_vault_feedback_signals.sql
--
-- Upgrades distilled memory from a flat list into a self-correcting store:
--   scope             — which surfaces/content-types a lesson applies to, so we
--                       inject only what's relevant (empty = global).
--   status            — proposed | active | muted. High-impact / conflicting
--                       lessons land 'proposed' for one-click admin approval
--                       instead of silently steering output.
--   embedding         — the lesson vector (JSON array), used to reinforce repeats
--                       and detect near-duplicates / contradictions at distill.
--   last_reinforced_at — drives confidence decay so stale lessons fade.
--
-- `active` stays the "is applied" flag (status='active' ⇔ active=true) so
-- existing readers (context, score, health) keep working. Idempotent.
-- ============================================================

ALTER TABLE brain_memory
  ADD COLUMN IF NOT EXISTS scope              JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS embedding          JSONB,
  ADD COLUMN IF NOT EXISTS last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brain_memory_status_check') THEN
    ALTER TABLE brain_memory
      ADD CONSTRAINT brain_memory_status_check CHECK (status IN ('proposed', 'active', 'muted'));
  END IF;
END $$;

-- Backfill status from the legacy active flag for any pre-existing rows.
UPDATE brain_memory SET status = CASE WHEN active THEN 'active' ELSE 'muted' END
WHERE status IS NULL OR status NOT IN ('proposed', 'active', 'muted');

INSERT INTO schema_migrations (version) VALUES ('076_brain_memory_v2.sql')
ON CONFLICT DO NOTHING;
