-- ============================================================
-- 048_tool_run_outputs.sql – Reopenable tool history
-- Run in Supabase SQL Editor after 047_client_archive.sql
--
-- tool_runs gains the run's output payload, so "Your recent runs" on /tools
-- can reopen a past result instead of being a read-only log. Idempotent.
-- ============================================================

ALTER TABLE tool_runs
  ADD COLUMN IF NOT EXISTS output JSONB;

INSERT INTO schema_migrations (version) VALUES ('048_tool_run_outputs.sql')
ON CONFLICT DO NOTHING;
