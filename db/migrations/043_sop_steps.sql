-- ============================================================
-- 043_sop_steps.sql – Structured steps for SOPs (AI Studio)
-- Run in Supabase SQL Editor after 042_app_errors.sql
--
-- SOP steps were heuristically re-parsed from the body text. This stores them
-- as real data: [{ "title", "detail", "tip" }, ...] plus intro/prerequisites.
-- body is still written (serialized from steps) so the existing runner and
-- detail view keep working untouched. Nullable — old SOPs just have no steps
-- and fall back to body parsing. Idempotent.
-- ============================================================

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS steps         JSONB,
  ADD COLUMN IF NOT EXISTS intro         TEXT,
  ADD COLUMN IF NOT EXISTS prerequisites TEXT[];

INSERT INTO schema_migrations (version) VALUES ('043_sop_steps.sql')
ON CONFLICT DO NOTHING;
