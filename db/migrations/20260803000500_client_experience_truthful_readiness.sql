-- Sprint 1 audit repair: correlate retries and distinguish a rendered route
-- shell from a feature whose required data is genuinely ready.

ALTER TABLE portal_experience_events
  ADD COLUMN IF NOT EXISTS navigation_id UUID,
  ADD COLUMN IF NOT EXISTS attempt SMALLINT NOT NULL DEFAULT 0
    CHECK (attempt BETWEEN 0 AND 20);

ALTER TABLE portal_experience_events
  DROP CONSTRAINT IF EXISTS portal_experience_events_event_type_check;
ALTER TABLE portal_experience_events
  ADD CONSTRAINT portal_experience_events_event_type_check
  CHECK (event_type IN (
    'page_ready', 'feature_ready', 'feature_error',
    'page_slow', 'page_retry', 'page_error'
  ));

CREATE INDEX IF NOT EXISTS portal_experience_events_navigation_idx
  ON portal_experience_events (navigation_id, created_at)
  WHERE navigation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS portal_experience_events_retention_idx
  ON portal_experience_events (created_at);

CREATE OR REPLACE FUNCTION purge_portal_experience_events(p_retention_days INTEGER DEFAULT 90)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed BIGINT;
BEGIN
  IF p_retention_days < 30 OR p_retention_days > 365 THEN
    RAISE EXCEPTION 'retention days must be between 30 and 365';
  END IF;
  DELETE FROM portal_experience_events
  WHERE created_at < clock_timestamp() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION purge_portal_experience_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_portal_experience_events(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION health_portal_experience(p_since TIMESTAMPTZ DEFAULT (now() - interval '24 hours'))
RETURNS TABLE (
  path TEXT,
  route_ready BIGINT,
  feature_ready BIGINT,
  slow BIGINT,
  errors BIGINT,
  retries BIGINT,
  average_feature_ms INTEGER,
  p95_feature_ms INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    event.path,
    count(*) FILTER (WHERE event.event_type = 'page_ready'),
    count(*) FILTER (WHERE event.event_type = 'feature_ready'),
    count(*) FILTER (WHERE event.event_type = 'page_slow'),
    count(*) FILTER (WHERE event.event_type IN ('page_error', 'feature_error')),
    count(*) FILTER (WHERE event.event_type = 'page_retry'),
    coalesce(round(avg(event.duration_ms) FILTER (WHERE event.event_type = 'feature_ready')), 0)::INTEGER,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY event.duration_ms)
      FILTER (WHERE event.event_type = 'feature_ready'), 0)::INTEGER
  FROM portal_experience_events AS event
  WHERE event.created_at >= p_since
  GROUP BY event.path
  ORDER BY
    count(*) FILTER (WHERE event.event_type IN ('page_error', 'feature_error')) DESC,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY event.duration_ms)
      FILTER (WHERE event.event_type = 'feature_ready'), 0) DESC;
$$;

REVOKE ALL ON FUNCTION health_portal_experience(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION health_portal_experience(TIMESTAMPTZ) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000500_client_experience_truthful_readiness.sql')
ON CONFLICT (version) DO NOTHING;
