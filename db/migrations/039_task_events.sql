-- ============================================================
-- 039_task_events.sql – Comments + activity trail on task cards
-- Run in Supabase SQL Editor after 038_notifications.sql
--
-- One table for both: kind='comment' is a human message on the card,
-- kind='activity' is an automatic trail entry ("moved to Review",
-- "assigned to Maria") written by the tasks API. Answers "who moved this?"
-- and keeps task discussion on the card instead of leaking into chat.
-- Rows cascade away with their task. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('comment','activity')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_events_task_idx ON task_events (task_id, created_at);
CREATE INDEX IF NOT EXISTS task_events_client_idx ON task_events (client_id, kind);

ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

-- The whole client team sees the trail (writes go through the API).
DROP POLICY IF EXISTS "task_events_select" ON task_events;
CREATE POLICY "task_events_select"
  ON task_events FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

INSERT INTO schema_migrations (version) VALUES ('039_task_events.sql')
ON CONFLICT DO NOTHING;
