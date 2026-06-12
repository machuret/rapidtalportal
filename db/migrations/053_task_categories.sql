-- ============================================================
-- 053_task_categories.sql – Phase B: per-client task categories
-- Run in Supabase SQL Editor after 052_tasks_enhance.sql
--
-- Each client defines its own labels (e.g. "Content", "Outreach", "Admin")
-- with a colour. Cards can carry one category; the board filters by it.
-- Colours are stored as a fixed palette KEY (not hex) so the styling guard
-- and the UI colour map stay the single source of truth. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'zinc'
                CHECK (color IN ('zinc','blue','green','amber','red','purple','pink','cyan','orange')),
  order_index INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_categories_client_idx ON task_categories (client_id, order_index, name);
-- One name per client, case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS task_categories_client_name_idx ON task_categories (client_id, lower(name));

-- A card belongs to at most one category. Deleting a category un-categorises its cards.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES task_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_category_idx ON tasks (client_id, category_id);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

-- Everyone in the client sees the categories; super_admin sees all.
DROP POLICY IF EXISTS "task_categories_select" ON task_categories;
CREATE POLICY "task_categories_select"
  ON task_categories FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

-- Only client admins (and super_admin) manage the category list.
DROP POLICY IF EXISTS "task_categories_insert" ON task_categories;
CREATE POLICY "task_categories_insert"
  ON task_categories FOR INSERT
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

DROP POLICY IF EXISTS "task_categories_update" ON task_categories;
CREATE POLICY "task_categories_update"
  ON task_categories FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

DROP POLICY IF EXISTS "task_categories_delete" ON task_categories;
CREATE POLICY "task_categories_delete"
  ON task_categories FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

INSERT INTO schema_migrations (version) VALUES ('053_task_categories.sql')
ON CONFLICT DO NOTHING;
