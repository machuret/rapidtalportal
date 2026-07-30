-- ============================================================
-- 116_content_pilot_cost_total.sql
-- Aggregate every recorded analysis attempt without loading an unbounded
-- activity list into the API process.
-- ============================================================

CREATE OR REPLACE FUNCTION content_analysis_total_cost(p_client_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC
  FROM content_analysis_attempts
  WHERE client_id = p_client_id;
$$;

REVOKE ALL ON FUNCTION content_analysis_total_cost(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION content_analysis_total_cost(UUID)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('116_content_pilot_cost_total.sql')
ON CONFLICT DO NOTHING;
