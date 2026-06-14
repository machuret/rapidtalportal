-- ============================================================
-- 073_brain_score_history.sql – Brain Score snapshots (Brain 2.0, Milestone E)
-- Run in Supabase SQL Editor after 072_brain_events.sql
--
-- A daily snapshot of each client's composite Brain Score (0-100) + level, so
-- the /brain home can show the line climbing over time. Written by the
-- brain-distill cron. One row per client per day (unique), idempotent upsert.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_score_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  captured_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  score         SMALLINT NOT NULL,
  level         TEXT NOT NULL,
  components    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, captured_date)
);

CREATE INDEX IF NOT EXISTS brain_score_history_client_idx ON brain_score_history (client_id, captured_date DESC);

ALTER TABLE brain_score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_score_history_own_client_select" ON brain_score_history;
CREATE POLICY "brain_score_history_own_client_select"
  ON brain_score_history FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version) VALUES ('073_brain_score_history.sql')
ON CONFLICT DO NOTHING;
