-- ============================================================
-- 038_notifications.sql – In-app notifications
-- Run in Supabase SQL Editor after 037_golden_questions.sql
--
-- The one primitive behind every "X happens and Y never finds out" gap:
-- daily-log feedback, task assignments, tasks ready for review, content
-- approvals, finished crawls. Rows are written server-side (service role);
-- users read their own and mark them read. Realtime INSERT events drive the
-- live bell badge.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES clients(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  href       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, read_at, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see and update (mark read) only their own.
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Live badge: stream INSERTs to the owner (RLS governs delivery).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('038_notifications.sql')
ON CONFLICT DO NOTHING;
