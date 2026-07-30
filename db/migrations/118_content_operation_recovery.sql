-- ============================================================
-- 118_content_operation_recovery.sql
-- Durable, user-visible recovery state for paid content operations.
-- ============================================================

ALTER TABLE content_projects
  ADD COLUMN IF NOT EXISTS last_operation TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_generation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE content_projects
  DROP CONSTRAINT IF EXISTS content_projects_generation_warnings_check;
ALTER TABLE content_projects
  ADD CONSTRAINT content_projects_generation_warnings_check
    CHECK (jsonb_typeof(last_generation_warnings) = 'array');

ALTER TABLE content_projects
  DROP CONSTRAINT IF EXISTS content_projects_last_operation_check;
ALTER TABLE content_projects
  ADD CONSTRAINT content_projects_last_operation_check
    CHECK (
      last_operation IS NULL
      OR last_operation IN (
        'quick_draft',
        'generate',
        'save_brief',
        'save_evidence',
        'validate'
      )
    );

ALTER TABLE competitor_intelligence_jobs
  ADD COLUMN IF NOT EXISTS error_code TEXT;

CREATE OR REPLACE FUNCTION fail_competitor_intelligence_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error_message TEXT,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE competitor_intelligence_jobs
  SET
    status = 'failed',
    error_message = left(coalesce(nullif(p_error_message, ''), 'Analysis failed.'), 2000),
    error_code = left(coalesce(nullif(p_error_code, ''), 'ANALYSIS_FAILED'), 120),
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND status = 'running';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION fail_competitor_intelligence_job(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fail_competitor_intelligence_job(UUID, UUID, TEXT, TEXT)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('118_content_operation_recovery.sql')
ON CONFLICT DO NOTHING;
