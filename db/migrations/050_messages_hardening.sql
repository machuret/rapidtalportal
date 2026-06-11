-- ============================================================
-- 050_messages_hardening.sql – Make /messages load reliably + live
-- Run in Supabase SQL Editor after 049_ai_prompts.sql
--
-- Three things, all idempotent:
--  1. Ensure the messages table exists. (Some environments drifted — the
--     010 migration was not always fully applied, which surfaced as
--     "Failed to load messages".)
--  2. Replace the messages_select policy. The original (010) inlined a
--     subquery over the RLS-protected users table; that predates the 013
--     SECURITY DEFINER recursion fix. Use current_user_client_id() instead,
--     which bypasses users RLS cleanly — this is what makes the realtime
--     channel (which respects RLS) actually deliver events.
--  3. Add messages to the supabase_realtime publication so new messages
--     stream live to everyone in the thread.
--
-- Note: the app now reads the thread via /api/messages (service role), so it
-- loads even where RLS/realtime is misconfigured; this migration restores the
-- live-update path on top of that.
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default '',
  sender_role text not null check (sender_role in ('client_admin', 'va', 'super_admin')),
  body        text not null check (char_length(body) > 0 and char_length(body) <= 4000),
  read_by     uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS messages_client_id_created_at_idx
  ON messages (client_id, created_at asc);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx
  ON messages (sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Recreate the read policy using the SECURITY DEFINER helper (no users-RLS
-- subquery → no recursion risk, and realtime can evaluate it).
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select"
  ON messages FOR SELECT
  USING (
    client_id = current_user_client_id()
    OR current_user_role() = 'super_admin'
  );

-- Live updates: full old row on UPDATE/DELETE so the client_id filter matches.
ALTER TABLE messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('050_messages_hardening.sql')
ON CONFLICT DO NOTHING;
