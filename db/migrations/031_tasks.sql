-- ============================================================
-- 031_tasks.sql – Shared Trello-style task board per client
-- Run in Supabase SQL Editor after 030_sop_runs.sql
--
-- One board per client. VAs work the board (their cards move through
-- todo → in_progress → review → done) and the client sees everything live.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done')),
  order_index INT  NOT NULL DEFAULT 0,
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks (client_id, status, order_index);
CREATE INDEX IF NOT EXISTS tasks_assigned_idx ON tasks (assigned_to, created_at DESC);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Everyone in the client (VA, client_admin) sees the whole board; admin sees all.
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select"
  ON tasks FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT
  WITH CHECK (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

-- VAs may update tasks assigned to them (move cards); client admins any in their client.
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND (current_user_role() = 'client_admin' OR assigned_to = auth.uid() OR created_by = auth.uid()))
  );

DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (client_id = current_user_client_id() AND (current_user_role() = 'client_admin' OR created_by = auth.uid()))
  );
