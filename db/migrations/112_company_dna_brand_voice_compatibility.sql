-- ============================================================
-- 112_company_dna_brand_voice_compatibility.sql
-- Repair production schema drift from the historical brand-voice migration.
-- Competitor intelligence and content generation both read these columns.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS brand_voice TEXT,
  ADD COLUMN IF NOT EXISTS sign_off TEXT;

-- Ensure PostgREST stops serving a stale column cache immediately after deploy.
NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (version)
VALUES ('112_company_dna_brand_voice_compatibility.sql')
ON CONFLICT DO NOTHING;
