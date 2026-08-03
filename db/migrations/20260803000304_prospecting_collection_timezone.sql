-- Keep collection usage and the UI on the same Australia/Sydney business day.

CREATE OR REPLACE FUNCTION reserve_prospecting_job(
  p_campaign_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_actor_identifier TEXT,
  p_adapter_version INT,
  p_max_charge_usd NUMERIC,
  p_daily_run_limit INT DEFAULT 10,
  p_daily_result_limit INT DEFAULT 500
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_campaign prospecting_campaigns%ROWTYPE;
  v_usage prospecting_usage%ROWTYPE;
  v_job prospecting_jobs%ROWTYPE;
  v_usage_date DATE := (clock_timestamp() AT TIME ZONE 'Australia/Sydney')::date;
BEGIN
  SELECT * INTO v_campaign FROM prospecting_campaigns
  WHERE id = p_campaign_id AND client_id = p_client_id FOR UPDATE;
  IF v_campaign.id IS NULL OR v_campaign.status = 'archived' THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = 'P0001';
  END IF;
  IF p_adapter_version < 1 OR p_max_charge_usd < 0.5 OR p_max_charge_usd > 25 THEN
    RAISE EXCEPTION 'Invalid provider budget.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM prospecting_jobs
    WHERE campaign_id = v_campaign.id AND job_type = 'collection' AND status IN ('queued', 'running', 'ingesting')) THEN
    RAISE EXCEPTION 'This campaign already has an active run.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO prospecting_usage (client_id, usage_date) VALUES (p_client_id, v_usage_date)
  ON CONFLICT (client_id, usage_date) DO NOTHING;
  SELECT * INTO v_usage FROM prospecting_usage
  WHERE client_id = p_client_id AND usage_date = v_usage_date FOR UPDATE;
  IF v_usage.runs_started + 1 > greatest(1, p_daily_run_limit)
     OR v_usage.results_reserved + v_campaign.max_results > greatest(1, p_daily_result_limit) THEN
    RAISE EXCEPTION 'Daily lead collection budget reached.'
      USING ERRCODE = 'P0001', HINT = 'Try again after the daily budget resets.';
  END IF;
  UPDATE prospecting_usage SET
    runs_started = runs_started + 1,
    results_reserved = results_reserved + v_campaign.max_results,
    updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND usage_date = v_usage_date;
  INSERT INTO prospecting_jobs (
    campaign_id, client_id, source, actor_id, adapter_version,
    requested_results, max_charge_usd, usage_date, created_by
  ) VALUES (
    v_campaign.id, p_client_id, v_campaign.source, p_actor_identifier,
    p_adapter_version, v_campaign.max_results, p_max_charge_usd, v_usage_date, p_actor_id
  ) RETURNING * INTO v_job;
  UPDATE prospecting_campaigns SET status = 'running', last_job_id = v_job.id
  WHERE id = v_campaign.id;
  RETURN NEXT v_job;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('20260803000304_prospecting_collection_timezone.sql')
ON CONFLICT (version) DO NOTHING;
