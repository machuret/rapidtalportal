-- Bind every paid provider run to a tested Actor/build/input contract and make
-- recovery select due work efficiently.

ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS actor_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS actor_build_requested TEXT,
  ADD COLUMN IF NOT EXISTS input_payload JSONB,
  ADD COLUMN IF NOT EXISTS input_hash TEXT;

ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_input_payload_object;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_input_payload_object CHECK (
  input_payload IS NULL OR (
    jsonb_typeof(input_payload) = 'object'
    AND octet_length(input_payload::text) <= 131072
  )
);
ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_input_hash_check;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_input_hash_check
  CHECK (input_hash IS NULL OR char_length(input_hash) = 64);

-- Existing jobs are made verifiable too, including a job that was active while
-- this migration was installed.
UPDATE prospecting_jobs SET actor_provider_id = CASE source
  WHEN 'google_maps' THEN 'nwua9Gu5YrADL7ZDj'
  WHEN 'google_search' THEN 'nFJndFXA5zjCTuudP'
  WHEN 'website_enrichment' THEN 'aYG0l9s7dbB7j3gbS'
  ELSE actor_provider_id
END
WHERE actor_provider_id IS NULL;

CREATE INDEX IF NOT EXISTS prospecting_jobs_due_idx
  ON prospecting_jobs (updated_at, next_attempt_at)
  WHERE status IN ('queued', 'running', 'ingesting');

CREATE OR REPLACE FUNCTION prepare_prospecting_job(
  p_job_id UUID,
  p_client_id UUID,
  p_actor_provider_id TEXT,
  p_actor_build_requested TEXT,
  p_input_payload JSONB,
  p_input_hash TEXT
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  IF char_length(coalesce(p_actor_provider_id, '')) < 5
     OR char_length(coalesce(p_actor_build_requested, '')) < 1
     OR char_length(coalesce(p_input_hash, '')) <> 64
     OR jsonb_typeof(p_input_payload) <> 'object'
     OR octet_length(p_input_payload::text) > 131072 THEN
    RAISE EXCEPTION 'Invalid provider contract.' USING ERRCODE = '22023';
  END IF;
  UPDATE prospecting_jobs SET
    actor_provider_id = p_actor_provider_id,
    actor_build_requested = p_actor_build_requested,
    input_payload = p_input_payload,
    input_hash = p_input_hash
  WHERE id = p_job_id
    AND client_id = p_client_id
    AND status = 'queued'
    AND actor_run_id IS NULL
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Provider contract could not be attached to this job.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_prospecting_provider_run_v2(
  p_job_id UUID,
  p_actor_provider_id TEXT,
  p_actor_run_id TEXT,
  p_provider_status TEXT,
  p_actor_build_id TEXT DEFAULT NULL,
  p_actor_dataset_id TEXT DEFAULT NULL,
  p_usage_total_usd NUMERIC DEFAULT NULL
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  IF char_length(coalesce(p_actor_run_id, '')) < 5
     OR char_length(coalesce(p_actor_provider_id, '')) < 5 THEN
    RAISE EXCEPTION 'Invalid provider run.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM prospecting_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection job not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.actor_provider_id IS NULL OR v_job.actor_provider_id <> p_actor_provider_id THEN
    RAISE EXCEPTION 'Provider Actor does not match this job.' USING ERRCODE = '42501';
  END IF;
  IF v_job.actor_run_id = p_actor_run_id AND v_job.status IN ('done', 'error', 'cancelled') THEN
    RETURN NEXT v_job;
    RETURN;
  END IF;
  UPDATE prospecting_jobs SET
    status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
    actor_run_id = p_actor_run_id,
    provider_status = p_provider_status,
    actor_build_id = coalesce(p_actor_build_id, actor_build_id),
    actor_dataset_id = coalesce(p_actor_dataset_id, actor_dataset_id),
    usage_total_usd = coalesce(p_usage_total_usd, usage_total_usd),
    error_code = NULL,
    error_message = NULL,
    next_attempt_at = NULL
  WHERE id = p_job_id
    AND status IN ('queued', 'running', 'ingesting')
    AND (actor_run_id IS NULL OR actor_run_id = p_actor_run_id)
  RETURNING * INTO v_job;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider run conflicts with this collection job.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION prepare_prospecting_job(UUID, UUID, TEXT, TEXT, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_prospecting_provider_run_v2(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prepare_prospecting_job(UUID, UUID, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_prospecting_provider_run_v2(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000305_prospecting_provider_contracts.sql')
ON CONFLICT (version) DO NOTHING;
