-- ============================================================
-- Lead Generation Phase 1 hardening
-- Provider reconciliation, bounded retry/cancel, strong identity deduplication
-- and prospect-level idempotent CRM promotion.
-- ============================================================

ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmation_deadline TIMESTAMPTZ
    NOT NULL DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usage_date DATE
    NOT NULL DEFAULT ((now() AT TIME ZONE 'Australia/Sydney')::DATE);

ALTER TABLE prospecting_prospects
  ADD COLUMN IF NOT EXISTS crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL;

-- Phase 1 originally retained several supporting hashes and treated any
-- overlap as identity. Shared domains/phones can represent multiple franchise
-- or branch locations. Preserve only the strongest canonical provider identity
-- for automatic merging; supporting evidence remains in raw_payload.
UPDATE prospecting_prospects
SET dedupe_keys = ARRAY[canonical_key]
WHERE dedupe_keys IS DISTINCT FROM ARRAY[canonical_key];

-- Preserve already-imported relationships at prospect level. If historical
-- rows contain more than one CRM contact, retain the earliest relationship;
-- this migration never deletes a user's CRM data.
UPDATE prospecting_prospects p
SET crm_contact_id = imported.crm_contact_id
FROM (
  SELECT DISTINCT ON (prospect_id) prospect_id, crm_contact_id
  FROM prospecting_campaign_leads
  WHERE crm_contact_id IS NOT NULL
  ORDER BY prospect_id, discovered_at ASC
) imported
WHERE p.id = imported.prospect_id
  AND p.crm_contact_id IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY crm_contact_id ORDER BY created_at ASC, id ASC) AS position
  FROM prospecting_prospects
  WHERE crm_contact_id IS NOT NULL
)
UPDATE prospecting_prospects p SET crm_contact_id = NULL
FROM ranked WHERE p.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS prospecting_prospects_crm_contact_unique
  ON prospecting_prospects (crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;

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
  v_usage_date DATE := (clock_timestamp() AT TIME ZONE 'Australia/Sydney')::DATE;
BEGIN
  SELECT * INTO v_campaign
  FROM prospecting_campaigns
  WHERE id = p_campaign_id AND client_id = p_client_id
  FOR UPDATE;
  IF v_campaign.id IS NULL OR v_campaign.status = 'archived' THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = 'P0001';
  END IF;
  IF p_adapter_version < 1 OR p_max_charge_usd < 0.5 OR p_max_charge_usd > 25 THEN
    RAISE EXCEPTION 'Invalid provider budget.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM prospecting_jobs
    WHERE campaign_id = v_campaign.id AND status IN ('queued', 'running', 'ingesting')
  ) THEN
    RAISE EXCEPTION 'This campaign already has an active run.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO prospecting_usage (client_id, usage_date)
  VALUES (p_client_id, v_usage_date)
  ON CONFLICT (client_id, usage_date) DO NOTHING;
  SELECT * INTO v_usage FROM prospecting_usage
  WHERE client_id = p_client_id AND usage_date = v_usage_date
  FOR UPDATE;
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
    requested_results, max_charge_usd, created_by,
    provider_confirmation_deadline, usage_date
  ) VALUES (
    v_campaign.id, p_client_id, v_campaign.source, p_actor_identifier,
    p_adapter_version, v_campaign.max_results, p_max_charge_usd, p_actor_id,
    clock_timestamp() + interval '15 minutes', v_usage_date
  ) RETURNING * INTO v_job;

  UPDATE prospecting_campaigns SET status = 'running', last_job_id = v_job.id
  WHERE id = v_campaign.id;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION claim_prospecting_job(
  p_job_id UUID,
  p_client_id UUID,
  p_lease_seconds INT DEFAULT 120
)
RETURNS SETOF prospecting_jobs
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  UPDATE prospecting_jobs SET
    lease_token = gen_random_uuid(),
    lease_until = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300))
    )
  WHERE id = p_job_id
    AND client_id = p_client_id
    AND status IN ('queued', 'running', 'ingesting')
    AND (lease_until IS NULL OR lease_until <= clock_timestamp())
    AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp() OR cancel_requested_at IS NOT NULL)
  RETURNING *;
$$;

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
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('queued', 'running', 'ingesting', 'done', 'error', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid job status.' USING ERRCODE = '22023';
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
    completed_at = CASE WHEN p_status IN ('done', 'error', 'cancelled') THEN clock_timestamp() ELSE completed_at END
  WHERE id = p_job_id AND lease_token = p_lease_token
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status IN ('error', 'cancelled') THEN
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
  v_delay INT;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  v_failures := v_job.failure_count + CASE WHEN p_count_failure THEN 1 ELSE 0 END;
  v_terminal := p_count_failure AND v_failures >= greatest(1, least(coalesce(p_max_failures, 5), 10));
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
      THEN 'Lead collection stopped after repeated provider failures. Run the campaign again.'
      ELSE left(coalesce(p_error_message, 'Lead collection will retry automatically.'), 500)
    END,
    lease_token = NULL,
    lease_until = NULL,
    completed_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE completed_at END
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  IF v_terminal THEN
    UPDATE prospecting_campaigns SET status = 'failed'
    WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  END IF;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION request_prospecting_job_cancel(
  p_job_id UUID,
  p_client_id UUID,
  p_actor_id UUID
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND client_id = p_client_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection job not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.status IN ('done', 'error', 'cancelled') THEN
    RETURN NEXT v_job;
    RETURN;
  END IF;
  UPDATE prospecting_jobs SET
    cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp()),
    next_attempt_at = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_prospecting_provider_run(
  p_job_id UUID,
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
  IF char_length(coalesce(p_actor_run_id, '')) < 5 THEN
    RAISE EXCEPTION 'Invalid provider run.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM prospecting_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection job not found.' USING ERRCODE = 'P0001';
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

CREATE OR REPLACE FUNCTION ingest_prospecting_job_results(
  p_job_id UUID,
  p_lease_token UUID,
  p_results JSONB,
  p_usage_total_usd NUMERIC DEFAULT NULL
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
  v_row JSONB;
  v_keys TEXT[];
  v_prospect_id UUID;
  v_created INT := 0;
  v_deduplicated INT := 0;
  v_returned INT := 0;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token AND lease_until > clock_timestamp()
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_job.client_id::TEXT, 0));

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) LOOP
    v_returned := v_returned + 1;
    SELECT coalesce(array_agg(value), '{}') INTO v_keys
    FROM jsonb_array_elements_text(coalesce(v_row->'dedupeKeys', '[]'::jsonb));
    IF cardinality(v_keys) < 1 OR char_length(coalesce(v_row->>'canonicalKey', '')) <> 64 THEN
      RAISE EXCEPTION 'Normalized prospect is missing its identity.' USING ERRCODE = '22023';
    END IF;
    v_keys := ARRAY[v_row->>'canonicalKey'];

    SELECT id INTO v_prospect_id
    FROM prospecting_prospects
    WHERE client_id = v_job.client_id AND canonical_key = v_row->>'canonicalKey'
    LIMIT 1 FOR UPDATE;

    IF v_prospect_id IS NULL THEN
      INSERT INTO prospecting_prospects (
        client_id, kind, canonical_key, dedupe_keys, company_name, person_name,
        job_title, website_url, linkedin_url, source_url, email, phone, address,
        locality, region, country_code, industry, employee_count, rating,
        review_count, latitude, longitude, description, source, actor_id,
        actor_build_id, actor_run_id, adapter_version, raw_payload, captured_at
      ) VALUES (
        v_job.client_id, v_row->>'kind', v_row->>'canonicalKey', v_keys,
        nullif(v_row->>'companyName',''), nullif(v_row->>'personName',''),
        nullif(v_row->>'jobTitle',''), nullif(v_row->>'websiteUrl',''),
        nullif(v_row->>'linkedinUrl',''), nullif(v_row->>'sourceUrl',''),
        nullif(v_row->>'email',''), nullif(v_row->>'phone',''),
        nullif(v_row->>'address',''), nullif(v_row->>'locality',''),
        nullif(v_row->>'region',''), nullif(v_row->>'countryCode',''),
        nullif(v_row->>'industry',''), (v_row->>'employeeCount')::INT,
        (v_row->>'rating')::NUMERIC, (v_row->>'reviewCount')::INT,
        (v_row->>'latitude')::DOUBLE PRECISION, (v_row->>'longitude')::DOUBLE PRECISION,
        nullif(v_row->>'description',''), v_row->'source'->>'source',
        v_row->'source'->>'actorId', nullif(v_row->'source'->>'actorBuildId',''),
        nullif(v_row->'source'->>'providerRunId',''),
        (v_row->'source'->>'adapterVersion')::INT,
        coalesce(v_row->'raw', '{}'::jsonb),
        coalesce((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp())
      ) RETURNING id INTO v_prospect_id;
      v_created := v_created + 1;
    ELSE
      UPDATE prospecting_prospects SET
        company_name = coalesce(nullif(v_row->>'companyName',''), company_name),
        person_name = coalesce(nullif(v_row->>'personName',''), person_name),
        job_title = coalesce(nullif(v_row->>'jobTitle',''), job_title),
        website_url = coalesce(nullif(v_row->>'websiteUrl',''), website_url),
        linkedin_url = coalesce(nullif(v_row->>'linkedinUrl',''), linkedin_url),
        source_url = coalesce(nullif(v_row->>'sourceUrl',''), source_url),
        email = coalesce(nullif(v_row->>'email',''), email),
        phone = coalesce(nullif(v_row->>'phone',''), phone),
        address = coalesce(nullif(v_row->>'address',''), address),
        locality = coalesce(nullif(v_row->>'locality',''), locality),
        region = coalesce(nullif(v_row->>'region',''), region),
        country_code = coalesce(nullif(v_row->>'countryCode',''), country_code),
        industry = coalesce(nullif(v_row->>'industry',''), industry),
        rating = coalesce((v_row->>'rating')::NUMERIC, rating),
        review_count = coalesce((v_row->>'reviewCount')::INT, review_count),
        description = coalesce(nullif(v_row->>'description',''), description),
        source = v_row->'source'->>'source', actor_id = v_row->'source'->>'actorId',
        actor_build_id = nullif(v_row->'source'->>'actorBuildId',''),
        actor_run_id = nullif(v_row->'source'->>'providerRunId',''),
        adapter_version = (v_row->'source'->>'adapterVersion')::INT,
        raw_payload = coalesce(v_row->'raw', raw_payload),
        captured_at = coalesce((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp()),
        last_seen_at = clock_timestamp()
      WHERE id = v_prospect_id;
      v_deduplicated := v_deduplicated + 1;
    END IF;

    INSERT INTO prospecting_campaign_leads (campaign_id, prospect_id, job_id, client_id)
    VALUES (v_job.campaign_id, v_prospect_id, v_job.id, v_job.client_id)
    ON CONFLICT (campaign_id, prospect_id) DO UPDATE SET
      job_id = EXCLUDED.job_id, last_seen_at = clock_timestamp();
    v_prospect_id := NULL;
  END LOOP;

  UPDATE prospecting_jobs SET
    status = 'done', provider_status = 'SUCCEEDED', returned_results = v_returned,
    created_results = v_created, deduplicated_results = v_deduplicated,
    usage_total_usd = coalesce(p_usage_total_usd, usage_total_usd),
    error_code = NULL, error_message = NULL, next_attempt_at = NULL,
    lease_token = NULL, lease_until = NULL, completed_at = clock_timestamp()
  WHERE id = v_job.id RETURNING * INTO v_job;
  UPDATE prospecting_campaigns SET status = 'completed'
  WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  UPDATE prospecting_usage SET
    results_returned = results_returned + v_returned,
    reported_cost_usd = reported_cost_usd + coalesce(p_usage_total_usd, 0),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION promote_prospecting_lead_to_crm(
  p_campaign_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_lead prospecting_campaign_leads%ROWTYPE;
  v_prospect prospecting_prospects%ROWTYPE;
  v_contact_id UUID;
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_campaign_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_prospect FROM prospecting_prospects
  WHERE id = v_lead.prospect_id AND client_id = p_client_id FOR UPDATE;
  IF v_prospect.id IS NULL THEN RAISE EXCEPTION 'Prospect not found.' USING ERRCODE = 'P0001'; END IF;

  v_contact_id := v_prospect.crm_contact_id;
  IF v_contact_id IS NULL AND v_prospect.email IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM crm_contacts
    WHERE client_id = p_client_id AND lower(email) = lower(v_prospect.email)
    ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN
    INSERT INTO crm_contacts (
      client_id, first_name, company, email, phone, job_title, status,
      source, tags, notes, created_by
    ) VALUES (
      p_client_id,
      left(coalesce(v_prospect.person_name, 'Company lead'), 100),
      left(v_prospect.company_name, 200),
      v_prospect.email, left(v_prospect.phone, 50), left(v_prospect.job_title, 200),
      'lead', 'RapidTal Lead Generation · ' || v_prospect.source,
      ARRAY['lead-generation'],
      nullif(concat_ws(E'\n',
        CASE WHEN v_prospect.website_url IS NOT NULL THEN 'Website: ' || v_prospect.website_url END,
        CASE WHEN v_prospect.source_url IS NOT NULL THEN 'Discovery source: ' || v_prospect.source_url END,
        CASE WHEN v_prospect.address IS NOT NULL THEN 'Address: ' || v_prospect.address END
      ), ''),
      p_actor_id
    ) RETURNING id INTO v_contact_id;
  END IF;
  UPDATE prospecting_prospects SET crm_contact_id = v_contact_id WHERE id = v_prospect.id;
  UPDATE prospecting_campaign_leads
  SET status = 'imported', crm_contact_id = v_contact_id
  WHERE prospect_id = v_prospect.id AND client_id = p_client_id;
  RETURN v_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION defer_prospecting_job(UUID, UUID, TEXT, TEXT, BOOLEAN, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION request_prospecting_job_cancel(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_prospecting_provider_run(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION defer_prospecting_job(UUID, UUID, TEXT, TEXT, BOOLEAN, INT) TO service_role;
GRANT EXECUTE ON FUNCTION request_prospecting_job_cancel(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_prospecting_provider_run(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000201_prospecting_phase1_hardening.sql')
ON CONFLICT (version) DO NOTHING;
