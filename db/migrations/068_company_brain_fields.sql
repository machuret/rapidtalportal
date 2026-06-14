-- ============================================================
-- 068_company_brain_fields.sql – Expand the company self-model (the "Brain")
-- Run in Supabase SQL Editor after 067_sop_subcategory_parent.sql
--
-- The Brain reasons over a richer profile than the original DNA facts. These
-- fields feed EVERY AI surface (content topics, Compose, Ask the Vault, Tools)
-- via lib/brain/context.ts, so keeping them accurate lifts quality everywhere.
-- Demographic already exists as target_demographic; tone already exists as
-- brand_voice. content_style is a finer-grained companion to brand_voice.
-- Idempotent.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS business_goals   TEXT,
  ADD COLUMN IF NOT EXISTS marketing_goals  TEXT,
  ADD COLUMN IF NOT EXISTS team             TEXT,
  ADD COLUMN IF NOT EXISTS tools_used       TEXT,
  ADD COLUMN IF NOT EXISTS website_content  TEXT,
  ADD COLUMN IF NOT EXISTS content_style    TEXT,
  ADD COLUMN IF NOT EXISTS internal_rules   TEXT;

INSERT INTO schema_migrations (version) VALUES ('068_company_brain_fields.sql')
ON CONFLICT DO NOTHING;
