-- ============================================================
-- 045_tool_runs.sql – Usage history for the Tools hub
-- Run in Supabase SQL Editor after 044_company_brand_voice.sql
--
-- Every tool run is recorded (which tool, who, for which client, a small
-- input summary, tokens spent). Feeds the VA's "recent runs" on /tools and
-- the Supervision per-VA stats, same pattern as sop_runs. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS tool_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  tool          TEXT NOT NULL,
  input_summary TEXT,
  tokens_used   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_runs_user_idx   ON tool_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_runs_client_idx ON tool_runs (client_id, created_at DESC);

ALTER TABLE tool_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tool_runs_select" ON tool_runs;
CREATE POLICY "tool_runs_select"
  ON tool_runs FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

INSERT INTO schema_migrations (version) VALUES ('045_tool_runs.sql')
ON CONFLICT DO NOTHING;
