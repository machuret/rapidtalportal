-- The scoring function was already valid and had executed in production, but
-- plpgsql_check interpreted the shorthand '{}' initialisers as text before the
-- assignment cast. Rewrite the stored body with explicit empty text arrays.

DO $migration$
DECLARE
  v_body TEXT;
  v_updated TEXT;
BEGIN
  SELECT prosrc INTO v_body
  FROM pg_proc
  WHERE oid = 'refresh_prospecting_lead_score(UUID, UUID)'::regprocedure;

  v_updated := replace(v_body, 'v_required_matched TEXT[] := ''{}'';', 'v_required_matched TEXT[] := ARRAY[]::TEXT[];');
  v_updated := replace(v_updated, 'v_preferred_matched TEXT[] := ''{}'';', 'v_preferred_matched TEXT[] := ARRAY[]::TEXT[];');
  v_updated := replace(v_updated, 'v_excluded_matched TEXT[] := ''{}'';', 'v_excluded_matched TEXT[] := ARRAY[]::TEXT[];');
  v_updated := replace(v_updated, 'v_required_missing TEXT[] := ''{}'';', 'v_required_missing TEXT[] := ARRAY[]::TEXT[];');

  IF v_updated = v_body THEN
    RAISE EXCEPTION 'Prospecting scoring array declarations were not found.';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION refresh_prospecting_lead_score(p_lead_id UUID, p_client_id UUID) '
    || 'RETURNS SETOF prospecting_campaign_leads '
    || 'LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS '
    || quote_literal(v_updated);
END;
$migration$;

INSERT INTO schema_migrations (version)
VALUES ('20260803000309_prospecting_score_array_types.sql')
ON CONFLICT (version) DO NOTHING;
