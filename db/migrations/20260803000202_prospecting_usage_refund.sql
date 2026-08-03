-- Release reserved result quota only when a provider run was definitively not
-- started. Run-attempt counts remain auditable and are never decremented.

ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS reservation_released_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION release_prospecting_job_reservation(
  p_job_id UUID,
  p_client_id UUID
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND client_id = p_client_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection job not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.actor_run_id IS NOT NULL OR v_job.status <> 'error' OR v_job.reservation_released_at IS NOT NULL THEN
    RETURN NEXT v_job;
    RETURN;
  END IF;
  UPDATE prospecting_usage SET
    results_reserved = greatest(0, results_reserved - v_job.requested_results),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  UPDATE prospecting_jobs SET reservation_released_at = clock_timestamp()
  WHERE id = v_job.id RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION release_prospecting_job_reservation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_prospecting_job_reservation(UUID, UUID) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000202_prospecting_usage_refund.sql')
ON CONFLICT (version) DO NOTHING;
