-- ============================================================
-- 103_competitor_intelligence_hardening.sql
-- Immutable evidence, truthful time windows, durable analysis leases, and
-- company-reference provenance for competitor intelligence.
-- ============================================================

ALTER TABLE competitor_intelligence_runs
  ADD COLUMN IF NOT EXISTS job_id UUID,
  ADD COLUMN IF NOT EXISTS source_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_date_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE competitor_intelligence_runs
  DROP CONSTRAINT IF EXISTS competitor_intelligence_runs_schema_version_check;
ALTER TABLE competitor_intelligence_runs
  DROP CONSTRAINT IF EXISTS competitor_intelligence_runs_analysis_check;
ALTER TABLE competitor_intelligence_runs
  ALTER COLUMN schema_version SET DEFAULT 2;
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_schema_version_check
    CHECK (schema_version IN (1, 2));
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_analysis_check
    CHECK (
      jsonb_typeof(analysis) = 'object'
      AND (analysis->>'schema_version')::INTEGER = schema_version
    );
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_evidence_snapshot_check
    CHECK (
      schema_version = 1
      OR (
        jsonb_typeof(source_evidence) = 'array'
        AND jsonb_array_length(source_evidence) = source_count
        AND fallback_date_count BETWEEN 0 AND source_count
      )
    );
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_company_evidence_check
    CHECK (jsonb_typeof(company_evidence) = 'array');

-- Version 1 reports did not pin capture versions. Keep them for audit history,
-- but do not present them as the active reproducible report.
UPDATE competitor_intelligence_runs
SET status = 'superseded', updated_at = clock_timestamp()
WHERE schema_version = 1 AND status = 'complete';

CREATE TABLE IF NOT EXISTS competitor_intelligence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'failed')),
  competitor_ids UUID[] NOT NULL
    CHECK (cardinality(competitor_ids) BETWEEN 1 AND 10),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  lease_token UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_until TIMESTAMPTZ NOT NULL,
  error_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);

ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_job_fk
  FOREIGN KEY (job_id) REFERENCES competitor_intelligence_jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competitor_intelligence_one_running_job
  ON competitor_intelligence_jobs (client_id)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS competitor_intelligence_jobs_client_history
  ON competitor_intelligence_jobs (client_id, created_at DESC);

ALTER TABLE competitor_intelligence_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE competitor_intelligence_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE competitor_intelligence_jobs TO service_role;

-- Resolve the current item to the exact immutable capture version whose hash
-- was analysed. Publication time defines the analysis window; collection time
-- is used only when publication time is unavailable and is disclosed as such.
CREATE OR REPLACE FUNCTION competitor_intelligence_evidence(
  p_client_id UUID,
  p_competitor_ids UUID[],
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ,
  p_limit_per_competitor INTEGER DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  capture_version_id UUID,
  content_hash TEXT,
  competitor_id UUID,
  canonical_url TEXT,
  platform TEXT,
  content_type TEXT,
  title TEXT,
  raw_content TEXT,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  effective_at TIMESTAMPTZ,
  date_basis TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      ci.id,
      cv.id AS capture_version_id,
      cv.content_hash,
      ci.competitor_id,
      ci.canonical_url,
      ci.platform,
      ci.content_type,
      ci.title,
      cv.raw_content,
      ci.published_at,
      cv.captured_at,
      coalesce(ci.published_at, cv.captured_at) AS effective_at,
      CASE WHEN ci.published_at IS NULL THEN 'captured' ELSE 'published' END AS date_basis,
      row_number() OVER (
        PARTITION BY ci.competitor_id
        ORDER BY coalesce(ci.published_at, cv.captured_at) DESC, ci.id
      ) AS position
    FROM competitor_content_items ci
    JOIN LATERAL (
      SELECT version.id, version.content_hash, version.raw_content, version.captured_at
      FROM competitor_capture_versions version
      WHERE version.item_id = ci.id
        AND version.client_id = p_client_id
        AND version.content_hash = ci.content_hash
      ORDER BY version.captured_at DESC
      LIMIT 1
    ) cv ON true
    WHERE ci.client_id = p_client_id
      AND ci.competitor_id = ANY(p_competitor_ids)
      AND ci.is_removed = false
      AND coalesce(ci.published_at, cv.captured_at) >= p_window_start
      AND coalesce(ci.published_at, cv.captured_at) <= p_window_end
  )
  SELECT
    ranked.id,
    ranked.capture_version_id,
    ranked.content_hash,
    ranked.competitor_id,
    ranked.canonical_url,
    ranked.platform,
    ranked.content_type,
    ranked.title,
    ranked.raw_content,
    ranked.published_at,
    ranked.captured_at,
    ranked.effective_at,
    ranked.date_basis
  FROM ranked
  WHERE ranked.position <= greatest(1, least(p_limit_per_competitor, 25))
  ORDER BY ranked.position, ranked.competitor_id;
$$;

CREATE OR REPLACE FUNCTION start_competitor_intelligence_job(
  p_client_id UUID,
  p_competitor_ids UUID[],
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ,
  p_actor_id UUID
)
RETURNS competitor_intelligence_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job competitor_intelligence_jobs;
BEGIN
  PERFORM id FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found.' USING ERRCODE = 'P0002';
  END IF;

  IF cardinality(p_competitor_ids) IS NULL
    OR cardinality(p_competitor_ids) <> (
      SELECT count(*)
      FROM competitors
      WHERE client_id = p_client_id
        AND status = 'active'
        AND id = ANY(p_competitor_ids)
    )
  THEN
    RAISE EXCEPTION 'Competitor selection is outside the client boundary.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE competitor_intelligence_jobs
  SET
    status = 'failed',
    error_message = 'Analysis lease expired.',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE client_id = p_client_id
    AND status = 'running'
    AND lease_until <= clock_timestamp();

  IF EXISTS (
    SELECT 1
    FROM competitor_intelligence_jobs
    WHERE client_id = p_client_id
      AND status = 'running'
      AND lease_until > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'A competitor analysis is already running for this client.'
      USING ERRCODE = '55P03';
  END IF;

  INSERT INTO competitor_intelligence_jobs (
    client_id,
    status,
    competitor_ids,
    window_start,
    window_end,
    lease_until,
    created_by
  ) VALUES (
    p_client_id,
    'running',
    p_competitor_ids,
    p_window_start,
    p_window_end,
    clock_timestamp() + interval '3 minutes',
    p_actor_id
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION fail_competitor_intelligence_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error_message TEXT
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
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND status = 'running';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION complete_competitor_intelligence_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_source_evidence JSONB,
  p_source_character_count INTEGER,
  p_company_evidence JSONB,
  p_analysis JSONB,
  p_model TEXT
)
RETURNS competitor_intelligence_runs
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job competitor_intelligence_jobs%ROWTYPE;
  v_run competitor_intelligence_runs;
  v_source_ids UUID[];
  v_source_count INTEGER;
  v_fallback_count INTEGER;
  v_valid_sources INTEGER;
  v_valid_company_sources INTEGER;
BEGIN
  SELECT * INTO v_job
  FROM competitor_intelligence_jobs
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND status = 'running'
  FOR UPDATE;

  IF v_job.id IS NULL OR v_job.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'The competitor analysis lease expired.'
      USING ERRCODE = '55P03';
  END IF;

  IF jsonb_typeof(p_source_evidence) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_source_evidence) < 5
  THEN
    RAISE EXCEPTION 'Immutable source evidence is incomplete.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    array_agg((entry.value->>'item_id')::UUID ORDER BY entry.ordinality),
    count(*)::INTEGER,
    count(*) FILTER (WHERE entry.value->>'date_basis' = 'captured')::INTEGER
  INTO v_source_ids, v_source_count, v_fallback_count
  FROM jsonb_array_elements(p_source_evidence) WITH ORDINALITY AS entry(value, ordinality);

  IF v_source_count <> (
    SELECT count(DISTINCT entry.value->>'item_id')
    FROM jsonb_array_elements(p_source_evidence) AS entry(value)
  ) THEN
    RAISE EXCEPTION 'Duplicate source evidence is not allowed.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::INTEGER INTO v_valid_sources
  FROM jsonb_array_elements(p_source_evidence) AS entry(value)
  JOIN competitor_capture_versions version
    ON version.id = (entry.value->>'capture_version_id')::UUID
   AND version.item_id = (entry.value->>'item_id')::UUID
   AND version.competitor_id = (entry.value->>'competitor_id')::UUID
   AND version.client_id = v_job.client_id
   AND version.content_hash = entry.value->>'content_hash'
  WHERE version.competitor_id = ANY(v_job.competitor_ids);

  IF v_valid_sources <> v_source_count THEN
    RAISE EXCEPTION 'Source evidence is outside the client boundary or has changed.'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(p_company_evidence) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Company comparison evidence is invalid.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::INTEGER INTO v_valid_company_sources
  FROM jsonb_array_elements(p_company_evidence) AS entry(value)
  WHERE (
    entry.value->>'kind' = 'content_piece'
    AND EXISTS (
      SELECT 1 FROM content_pieces piece
      WHERE piece.id = (entry.value->>'id')::UUID
        AND piece.client_id = v_job.client_id
    )
  ) OR (
    entry.value->>'kind' = 'vault_item'
    AND EXISTS (
      SELECT 1 FROM vault_items item
      WHERE item.id = (entry.value->>'id')::UUID
        AND item.client_id = v_job.client_id
        AND item.status = 'ready'
    )
  );

  IF v_valid_company_sources <> jsonb_array_length(p_company_evidence) THEN
    RAISE EXCEPTION 'Company comparison evidence is outside the client boundary.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE competitor_intelligence_runs
  SET status = 'superseded', updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND status = 'complete';

  INSERT INTO competitor_intelligence_runs (
    client_id,
    job_id,
    status,
    schema_version,
    window_start,
    window_end,
    competitor_ids,
    source_item_ids,
    source_count,
    source_character_count,
    source_evidence,
    company_evidence,
    fallback_date_count,
    analysis,
    model,
    created_by
  ) VALUES (
    v_job.client_id,
    v_job.id,
    'complete',
    2,
    v_job.window_start,
    v_job.window_end,
    v_job.competitor_ids,
    v_source_ids,
    v_source_count,
    p_source_character_count,
    p_source_evidence,
    p_company_evidence,
    v_fallback_count,
    p_analysis,
    p_model,
    v_job.created_by
  )
  RETURNING * INTO v_run;

  UPDATE competitor_intelligence_jobs
  SET
    status = 'complete',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = v_job.id;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION competitor_intelligence_evidence(
  UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION competitor_intelligence_evidence(
  UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION start_competitor_intelligence_job(
  UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION start_competitor_intelligence_job(
  UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID
) TO service_role;

REVOKE ALL ON FUNCTION fail_competitor_intelligence_job(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fail_competitor_intelligence_job(UUID, UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION complete_competitor_intelligence_job(
  UUID, UUID, JSONB, INTEGER, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_competitor_intelligence_job(
  UUID, UUID, JSONB, INTEGER, JSONB, JSONB, TEXT
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('103_competitor_intelligence_hardening.sql')
ON CONFLICT DO NOTHING;
