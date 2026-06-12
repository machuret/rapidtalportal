-- ============================================================
-- 054_task_recurrences.sql – Phase C: recurring tasks + archiving
-- Run in Supabase SQL Editor after 053_task_categories.sql
--
-- task_recurrences = the blueprint for a card that should reappear on a
-- cadence. A daily Vercel Cron (/api/cron/tasks) spawns due cards and archives
-- stale "done" cards. Archived cards leave the board but still count toward the
-- "achieved" stats. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_recurrences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES task_categories(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  priority        SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  interval        INT  NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 52),
  next_run_on     DATE NOT NULL,
  last_spawned_at TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- The cron's hot path: active recurrences whose next run has arrived.
CREATE INDEX IF NOT EXISTS task_recurrences_due_idx ON task_recurrences (next_run_on) WHERE active;
CREATE INDEX IF NOT EXISTS task_recurrences_client_idx ON task_recurrences (client_id, created_at DESC);

ALTER TABLE task_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_recurrences_select" ON task_recurrences;
CREATE POLICY "task_recurrences_select"
  ON task_recurrences FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

-- Only client admins (and super_admin) manage recurrences.
DROP POLICY IF EXISTS "task_recurrences_insert" ON task_recurrences;
CREATE POLICY "task_recurrences_insert"
  ON task_recurrences FOR INSERT
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

DROP POLICY IF EXISTS "task_recurrences_update" ON task_recurrences;
CREATE POLICY "task_recurrences_update"
  ON task_recurrences FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

DROP POLICY IF EXISTS "task_recurrences_delete" ON task_recurrences;
CREATE POLICY "task_recurrences_delete"
  ON task_recurrences FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND current_user_role() = 'client_admin')
  );

-- Archiving: stale "done" cards drop off the board but keep their data.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
-- Board reads only live cards; this partial index keeps that query tight.
CREATE INDEX IF NOT EXISTS tasks_live_board_idx ON tasks (client_id, status, order_index) WHERE archived_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('054_task_recurrences.sql')
ON CONFLICT DO NOTHING;
