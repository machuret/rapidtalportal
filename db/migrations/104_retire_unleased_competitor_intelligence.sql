-- ============================================================
-- 104_retire_unleased_competitor_intelligence.sql
-- Applied after the hardened application route is live.
-- ============================================================

-- A request handled by an old application instance during the migration-103
-- rollout window may have written one final v1 report. It is not reproducible,
-- so retire it before removing the legacy unleased writer.
UPDATE competitor_intelligence_runs
SET status = 'superseded', updated_at = clock_timestamp()
WHERE schema_version = 1 AND status = 'complete';

REVOKE ALL ON FUNCTION replace_competitor_intelligence_run(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[], INTEGER, JSONB, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS replace_competitor_intelligence_run(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[], INTEGER, JSONB, TEXT, UUID
);

INSERT INTO schema_migrations (version)
VALUES ('104_retire_unleased_competitor_intelligence.sql')
ON CONFLICT DO NOTHING;
