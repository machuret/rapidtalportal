-- ============================================================
-- 072_brain_events.sql – The Brain Journal (Brain 2.0, Milestone E)
-- Run in Supabase SQL Editor after 071_brain_memory.sql
--
-- A human-readable activity feed that makes the Brain feel alive: "Learned 3
-- lessons", "Filtered 4 weak ideas (~30 min saved)", "Read 3 new documents",
-- "Reached Sharp". Written by existing flows (distillation, topic generation,
-- indexing). Surfaced on the /brain home. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                 -- 'learned' | 'filtered' | 'read' | 'level_up' | 'briefing' | ...
  summary    TEXT NOT NULL,                 -- plain-English line shown in the journal
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_events_client_idx ON brain_events (client_id, created_at DESC);

ALTER TABLE brain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_events_own_client_select" ON brain_events;
CREATE POLICY "brain_events_own_client_select"
  ON brain_events FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version) VALUES ('072_brain_events.sql')
ON CONFLICT DO NOTHING;
