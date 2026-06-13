-- ============================================================
-- 066_sop_managed_categories.sql – first-class SOP categories
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 065.
--
-- Until now categories existed only as a free-text field on `sops`, so you could
-- not create an empty category or manage them as entities. This table lets
-- categories & subcategories be created / renamed / deleted independently of
-- SOPs. The library still groups by the SOP's own category text; this is the
-- managed list that powers the category manager and the pickers. Idempotent.
-- client_id NULL = global library.
-- ============================================================

CREATE TABLE IF NOT EXISTS sop_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('category', 'subcategory')),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sop_categories_uniq
  ON sop_categories (coalesce(client_id::text, 'global'), kind, lower(name));

ALTER TABLE sop_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_categories' AND policyname = 'sop_categories_super_admin_all') THEN
    CREATE POLICY "sop_categories_super_admin_all" ON sop_categories FOR ALL
      USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_categories' AND policyname = 'sop_categories_client_admin') THEN
    CREATE POLICY "sop_categories_client_admin" ON sop_categories FOR ALL
      USING (client_id = current_user_client_id()) WITH CHECK (client_id = current_user_client_id());
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('066_sop_managed_categories.sql')
ON CONFLICT DO NOTHING;
