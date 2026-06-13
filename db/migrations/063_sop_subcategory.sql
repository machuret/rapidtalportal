-- ============================================================
-- 063_sop_subcategory.sql – optional second-level grouping for SOPs
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 062.
--
-- SOPs already group by `category`; this adds an optional `subcategory` so a
-- big category (e.g. "WordPress") can be split into "Rank Math", "Migrations",
-- etc. Free-text like category — NULL/empty means "no subcategory". Idempotent.
-- ============================================================

ALTER TABLE sops ADD COLUMN IF NOT EXISTS subcategory TEXT;

INSERT INTO schema_migrations (version) VALUES ('063_sop_subcategory.sql')
ON CONFLICT DO NOTHING;
