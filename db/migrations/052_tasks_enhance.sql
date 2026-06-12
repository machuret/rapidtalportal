-- ============================================================
-- 052_tasks_enhance.sql – Phase A: completion timestamp + priority
-- Run in Supabase SQL Editor after 051_my_job.sql
--
-- Enables the "Tasks Achieved" view (needs to know WHEN a task was completed)
-- and adds a priority level. RLS is unchanged — the existing tasks policies
-- already cover all columns. Idempotent.
-- ============================================================

-- When the task entered the "done" column. NULL while not done. Set/cleared by
-- the API on status transitions; powers the achieved-this-week/month stats.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 1 low · 2 normal · 3 high · 4 urgent.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_chk') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_priority_chk CHECK (priority BETWEEN 1 AND 4);
  END IF;
END $$;

-- Backfill: existing done cards get a best-effort completion time so they
-- count toward totals (updated_at is when they were last moved).
UPDATE tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;

-- Achieved queries: a VA's completed tasks, newest first.
CREATE INDEX IF NOT EXISTS tasks_achieved_idx ON tasks (client_id, assigned_to, completed_at DESC);

INSERT INTO schema_migrations (version) VALUES ('052_tasks_enhance.sql')
ON CONFLICT DO NOTHING;
