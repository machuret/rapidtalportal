-- ============================================================
-- 005_perf.sql – Performance indexes and helper functions
-- Run in Supabase SQL Editor after 004_daily_log.sql
-- ============================================================

-- Composite index covering the most common daily_log query:
-- WHERE user_id = $1 AND log_date = $2
-- Also serves the history strip query (WHERE user_id = $1 ORDER BY log_date DESC)
CREATE INDEX IF NOT EXISTS daily_logs_user_date_idx
  ON daily_logs(user_id, log_date DESC);

-- Composite index for admin review queries:
-- WHERE client_id = $1 ORDER BY log_date DESC
CREATE INDEX IF NOT EXISTS daily_logs_client_date_idx
  ON daily_logs(client_id, log_date DESC);

-- ============================================================
-- Contact status aggregation — replaces JS-side full-table scan
-- ============================================================
CREATE OR REPLACE FUNCTION get_contact_status_counts(p_client_id UUID)
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT status::TEXT, COUNT(*)::BIGINT
  FROM crm_contacts
  WHERE client_id = p_client_id
  GROUP BY status;
$$;

-- This aggregation is called only through a server route using the service
-- role. Do not expose an arbitrary client UUID parameter through PostgREST.
REVOKE ALL ON FUNCTION get_contact_status_counts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_contact_status_counts(UUID) TO service_role;

-- Register the function in the Database type (informational comment)
-- Update types/database.ts Functions section to include this function.
