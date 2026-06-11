-- ============================================================
-- 044_company_brand_voice.sql – Brand voice for Compose
-- Run in Supabase SQL Editor after 043_sop_steps.sql
--
-- A dedicated tone-of-voice profile (beyond DNA facts) so Compose drafts
-- sound consistently like the client: voice guidelines + a default sign-off.
-- Idempotent.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS brand_voice TEXT,
  ADD COLUMN IF NOT EXISTS sign_off    TEXT;

INSERT INTO schema_migrations (version) VALUES ('044_company_brand_voice.sql')
ON CONFLICT DO NOTHING;
