-- Phase 2 hardening: enrichment failures/cancellation must never change the
-- parent discovery campaign state. Also validate stored ICP shapes and rescore
-- a repeated campaign result after its prospect evidence is refreshed.

ALTER TABLE prospecting_campaigns
  DROP CONSTRAINT IF EXISTS prospecting_campaigns_ideal_profile_shape;
ALTER TABLE prospecting_campaigns
  ADD CONSTRAINT prospecting_campaigns_ideal_profile_shape CHECK (
    (ideal_profile->'requiredKeywords' IS NULL OR jsonb_typeof(ideal_profile->'requiredKeywords') = 'array')
    AND (ideal_profile->'preferredKeywords' IS NULL OR jsonb_typeof(ideal_profile->'preferredKeywords') = 'array')
    AND (ideal_profile->'excludedKeywords' IS NULL OR jsonb_typeof(ideal_profile->'excludedKeywords') = 'array')
    AND (ideal_profile->'minRating' IS NULL OR jsonb_typeof(ideal_profile->'minRating') = 'number')
    AND (ideal_profile->'minReviewCount' IS NULL OR jsonb_typeof(ideal_profile->'minReviewCount') = 'number')
    AND (ideal_profile->'mustHaveWebsite' IS NULL OR jsonb_typeof(ideal_profile->'mustHaveWebsite') = 'boolean')
  );

ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS usage_recorded_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION checkpoint_prospecting_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_status TEXT,
  p_provider_status TEXT DEFAULT NULL,
  p_actor_build_id TEXT DEFAULT NULL,
  p_actor_run_id TEXT DEFAULT NULL,
  p_actor_dataset_id TEXT DEFAULT NULL,
  p_usage_total_usd NUMERIC DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_before prospecting_jobs%ROWTYPE;
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('queued', 'running', 'ingesting', 'done', 'error', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid job status.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE prospecting_jobs SET
    status = p_status,
    provider_status = coalesce(p_provider_status, provider_status),
    actor_build_id = coalesce(p_actor_build_id, actor_build_id),
    actor_run_id = coalesce(p_actor_run_id, actor_run_id),
    actor_dataset_id = coalesce(p_actor_dataset_id, actor_dataset_id),
    usage_total_usd = coalesce(p_usage_total_usd, usage_total_usd),
    error_code = p_error_code,
    error_message = p_error_message,
    next_attempt_at = NULL,
    lease_token = NULL,
    lease_until = NULL,
    completed_at = CASE WHEN p_status IN ('done', 'error', 'cancelled') THEN clock_timestamp() ELSE completed_at END,
    usage_recorded_at = CASE
      WHEN p_status IN ('error', 'cancelled') AND usage_recorded_at IS NULL
        AND coalesce(p_usage_total_usd, usage_total_usd) IS NOT NULL THEN clock_timestamp()
      ELSE usage_recorded_at
    END
  WHERE id = p_job_id
  RETURNING * INTO v_job;
  IF p_status IN ('error', 'cancelled') AND v_before.usage_recorded_at IS NULL
     AND coalesce(p_usage_total_usd, v_before.usage_total_usd) IS NOT NULL THEN
    UPDATE prospecting_usage SET
      reported_cost_usd = reported_cost_usd + greatest(0, coalesce(p_usage_total_usd, v_before.usage_total_usd, 0)),
      updated_at = clock_timestamp()
    WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  END IF;
  IF v_job.job_type = 'collection' AND p_status IN ('error', 'cancelled') THEN
    UPDATE prospecting_campaigns
    SET status = CASE WHEN p_status = 'error' THEN 'failed' ELSE 'ready' END
    WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  END IF;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION defer_prospecting_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error_code TEXT,
  p_error_message TEXT,
  p_count_failure BOOLEAN DEFAULT TRUE,
  p_max_failures INT DEFAULT 5
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
  v_failures INT;
  v_terminal BOOLEAN;
  v_should_record_usage BOOLEAN;
  v_delay INT;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  v_failures := v_job.failure_count + CASE WHEN p_count_failure THEN 1 ELSE 0 END;
  v_terminal := p_count_failure AND v_failures >= greatest(1, least(coalesce(p_max_failures, 5), 10));
  v_should_record_usage := v_terminal AND v_job.usage_recorded_at IS NULL AND v_job.usage_total_usd IS NOT NULL;
  v_delay := CASE WHEN p_count_failure
    THEN least(900, (30 * power(2, greatest(0, v_failures - 1)))::INT)
    ELSE 30
  END;
  UPDATE prospecting_jobs SET
    status = CASE WHEN v_terminal THEN 'error' ELSE 'running' END,
    failure_count = v_failures,
    next_attempt_at = CASE WHEN v_terminal THEN NULL ELSE clock_timestamp() + make_interval(secs => v_delay) END,
    error_code = CASE WHEN v_terminal THEN 'retry_limit_reached' ELSE p_error_code END,
    error_message = CASE WHEN v_terminal
      THEN CASE WHEN job_type = 'enrichment'
        THEN 'Company enrichment stopped after repeated provider failures. Try enriching this lead again.'
        ELSE 'Lead collection stopped after repeated provider failures. Run the campaign again.' END
      ELSE left(coalesce(p_error_message, 'The provider operation will retry automatically.'), 500)
    END,
    lease_token = NULL,
    lease_until = NULL,
    completed_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE completed_at END,
    usage_recorded_at = CASE WHEN v_terminal AND usage_recorded_at IS NULL AND usage_total_usd IS NOT NULL
      THEN clock_timestamp() ELSE usage_recorded_at END
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  IF v_should_record_usage THEN
    UPDATE prospecting_usage SET
      reported_cost_usd = reported_cost_usd + greatest(0, coalesce(v_job.usage_total_usd, 0)),
      updated_at = clock_timestamp()
    WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  END IF;
  IF v_terminal AND v_job.job_type = 'collection' THEN
    UPDATE prospecting_campaigns SET status = 'failed'
    WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  END IF;
  RETURN NEXT v_job;
END;
$$;

DROP TRIGGER IF EXISTS prospecting_campaign_leads_initial_score ON prospecting_campaign_leads;
CREATE TRIGGER prospecting_campaign_leads_initial_score
AFTER INSERT OR UPDATE OF last_seen_at ON prospecting_campaign_leads
FOR EACH ROW EXECUTE FUNCTION score_new_prospecting_lead();

REVOKE ALL ON FUNCTION checkpoint_prospecting_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION defer_prospecting_job(UUID, UUID, TEXT, TEXT, BOOLEAN, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkpoint_prospecting_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION defer_prospecting_job(UUID, UUID, TEXT, TEXT, BOOLEAN, INT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000301_prospecting_phase2_job_isolation.sql')
ON CONFLICT (version) DO NOTHING;
