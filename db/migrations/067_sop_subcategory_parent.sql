-- ============================================================
-- 067_sop_subcategory_parent.sql – nest subcategories under a category
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 066.
--
-- Managed subcategories (sop_categories, kind='subcategory') now belong to a
-- parent category by name, so the manager can show a real Category → Subcategory
-- tree and "add subcategory" is scoped to a category. NULL for categories.
-- Idempotent.
-- ============================================================

ALTER TABLE sop_categories ADD COLUMN IF NOT EXISTS parent TEXT;

INSERT INTO schema_migrations (version) VALUES ('067_sop_subcategory_parent.sql')
ON CONFLICT DO NOTHING;
