-- ============================================================
-- 032_tasks_realtime.sql – Live updates for the shared task board
-- Run in Supabase SQL Editor after 031_tasks.sql
--
-- Adds the tasks table to the supabase_realtime publication so that
-- INSERT / UPDATE / DELETE events stream to every connected client viewing
-- the board (Supabase Realtime → postgres_changes). RLS on tasks (031) still
-- governs who actually receives each event, so VAs/admins only see their
-- own client's cards.
--
-- REPLICA IDENTITY FULL ensures DELETE (and UPDATE) payloads carry the full
-- old row — without it the `client_id=eq.<id>` filter can't match deletes,
-- because the default replica identity only ships the primary key.
-- Idempotent.
-- ============================================================

ALTER TABLE tasks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
END $$;
