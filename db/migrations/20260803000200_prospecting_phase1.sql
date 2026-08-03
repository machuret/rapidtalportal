-- ============================================================
-- Lead Generation Phase 1
-- Tenant-safe campaigns, durable Apify jobs, deduplicated prospects and
-- deliberate/atomic CRM promotion. This domain is intentionally named
-- prospecting_* so it cannot be confused with the admin recruitment leads.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospecting_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  source TEXT NOT NULL CHECK (source IN ('google_maps', 'google_search')),
  queries TEXT[] NOT NULL CHECK (cardinality(queries) BETWEEN 1 AND 10),
  locations TEXT[] NOT NULL DEFAULT '{}',
  country_code TEXT NOT NULL DEFAULT 'au' CHECK (char_length(country_code) = 2),
  language_code TEXT NOT NULL DEFAULT 'en' CHECK (char_length(language_code) BETWEEN 2 AND 10),
  max_results INT NOT NULL DEFAULT 20 CHECK (max_results BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'running', 'completed', 'failed', 'archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (id, client_id)
);

CREATE INDEX IF NOT EXISTS prospecting_campaigns_client_idx
  ON prospecting_campaigns (client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS prospecting_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('google_maps', 'google_search')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ingesting', 'done', 'error', 'cancelled')),
  provider_status TEXT,
  actor_id TEXT NOT NULL,
  actor_build_id TEXT,
  actor_run_id TEXT,
  actor_dataset_id TEXT,
  adapter_version INT NOT NULL CHECK (adapter_version > 0),
  requested_results INT NOT NULL CHECK (requested_results BETWEEN 1 AND 100),
  returned_results INT NOT NULL DEFAULT 0 CHECK (returned_results >= 0),
  created_results INT NOT NULL DEFAULT 0 CHECK (created_results >= 0),
  deduplicated_results INT NOT NULL DEFAULT 0 CHECK (deduplicated_results >= 0),
  max_charge_usd NUMERIC(10,4) NOT NULL CHECK (max_charge_usd BETWEEN 0.5 AND 25),
  usage_total_usd NUMERIC(10,4),
  error_code TEXT,
  error_message TEXT,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (campaign_id, client_id)
    REFERENCES prospecting_campaigns(id, client_id) ON DELETE CASCADE,
  UNIQUE (id, client_id)
);

CREATE INDEX IF NOT EXISTS prospecting_jobs_client_idx
  ON prospecting_jobs (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_jobs_campaign_idx
  ON prospecting_jobs (campaign_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS prospecting_jobs_one_active_campaign
  ON prospecting_jobs (campaign_id)
  WHERE status IN ('queued', 'running', 'ingesting');

ALTER TABLE prospecting_campaigns
  ADD COLUMN IF NOT EXISTS last_job_id UUID;
ALTER TABLE prospecting_campaigns
  DROP CONSTRAINT IF EXISTS prospecting_campaigns_last_job_id_fkey;
ALTER TABLE prospecting_campaigns
  ADD CONSTRAINT prospecting_campaigns_last_job_id_fkey
  FOREIGN KEY (last_job_id)
  REFERENCES prospecting_jobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS prospecting_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('company', 'person')),
  canonical_key TEXT NOT NULL CHECK (char_length(canonical_key) = 64),
  dedupe_keys TEXT[] NOT NULL CHECK (cardinality(dedupe_keys) >= 1),
  company_name TEXT,
  person_name TEXT,
  job_title TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  source_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  locality TEXT,
  region TEXT,
  country_code TEXT,
  industry TEXT,
  employee_count INT,
  rating NUMERIC(4,2),
  review_count INT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('google_maps', 'google_search', 'linkedin_profiles')),
  actor_id TEXT NOT NULL,
  actor_build_id TEXT,
  actor_run_id TEXT,
  adapter_version INT NOT NULL CHECK (adapter_version > 0),
  raw_payload JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, client_id),
  UNIQUE (client_id, canonical_key)
);

CREATE INDEX IF NOT EXISTS prospecting_prospects_client_idx
  ON prospecting_prospects (client_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_prospects_dedupe_idx
  ON prospecting_prospects USING GIN (dedupe_keys);

CREATE TABLE IF NOT EXISTS prospecting_campaign_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  prospect_id UUID NOT NULL,
  job_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'shortlisted', 'dismissed', 'imported')),
  crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, prospect_id),
  UNIQUE (id, client_id),
  FOREIGN KEY (campaign_id, client_id)
    REFERENCES prospecting_campaigns(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (prospect_id, client_id)
    REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, client_id)
    REFERENCES prospecting_jobs(id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS prospecting_campaign_leads_inbox_idx
  ON prospecting_campaign_leads (client_id, status, discovered_at DESC);

CREATE TABLE IF NOT EXISTS prospecting_usage (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  runs_started INT NOT NULL DEFAULT 0 CHECK (runs_started >= 0),
  results_reserved INT NOT NULL DEFAULT 0 CHECK (results_reserved >= 0),
  results_returned INT NOT NULL DEFAULT 0 CHECK (results_returned >= 0),
  reported_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (reported_cost_usd >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, usage_date)
);

DROP TRIGGER IF EXISTS prospecting_campaigns_updated_at ON prospecting_campaigns;
CREATE TRIGGER prospecting_campaigns_updated_at
BEFORE UPDATE ON prospecting_campaigns
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS prospecting_jobs_updated_at ON prospecting_jobs;
CREATE TRIGGER prospecting_jobs_updated_at
BEFORE UPDATE ON prospecting_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS prospecting_prospects_updated_at ON prospecting_prospects;
CREATE TRIGGER prospecting_prospects_updated_at
BEFORE UPDATE ON prospecting_prospects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS prospecting_campaign_leads_updated_at ON prospecting_campaign_leads;
CREATE TRIGGER prospecting_campaign_leads_updated_at
BEFORE UPDATE ON prospecting_campaign_leads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE prospecting_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_usage ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'prospecting_campaigns', 'prospecting_jobs', 'prospecting_prospects',
    'prospecting_campaign_leads', 'prospecting_usage'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_table || '_super_admin_all', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (current_user_role() = ''super_admin'') WITH CHECK (current_user_role() = ''super_admin'')',
      v_table || '_super_admin_all', v_table
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_table || '_tenant_select', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (client_id = current_user_client_id())',
      v_table || '_tenant_select', v_table
    );
  END LOOP;
END $$;

-- Tenant users can read their records directly, but every mutation is routed
-- through the authenticated API and service-role database operations. This
-- prevents bypassing daily budgets, leases, deduplication and CRM promotion.

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
    WHERE id = p_actor_id
      AND (role = 'super_admin' OR client_id = p_client_id)
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
  VALUES (p_client_id, CURRENT_DATE)
  ON CONFLICT (client_id, usage_date) DO NOTHING;
  SELECT * INTO v_usage FROM prospecting_usage
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE
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
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE;

  INSERT INTO prospecting_jobs (
    campaign_id, client_id, source, actor_id, adapter_version,
    requested_results, max_charge_usd, created_by
  ) VALUES (
    v_campaign.id, p_client_id, v_campaign.source, p_actor_identifier,
    p_adapter_version, v_campaign.max_results, p_max_charge_usd, p_actor_id
  ) RETURNING * INTO v_job;

  UPDATE prospecting_campaigns
  SET status = 'running', last_job_id = v_job.id
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
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_until > clock_timestamp()
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;

  -- Two campaigns for the same tenant may finish at the same instant. Serialize
  -- only the short ingestion transaction so overlapping identity keys cannot
  -- race the unique constraint and turn a valid run into a false failure.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_job.client_id::TEXT, 0));

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) LOOP
    v_returned := v_returned + 1;
    SELECT coalesce(array_agg(value), '{}') INTO v_keys
    FROM jsonb_array_elements_text(coalesce(v_row->'dedupeKeys', '[]'::jsonb));
    IF cardinality(v_keys) < 1 OR char_length(coalesce(v_row->>'canonicalKey', '')) <> 64 THEN
      RAISE EXCEPTION 'Normalized prospect is missing its identity.' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_prospect_id
    FROM prospecting_prospects
    WHERE client_id = v_job.client_id AND dedupe_keys && v_keys
    ORDER BY last_seen_at DESC
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
        dedupe_keys = ARRAY(SELECT DISTINCT unnest(dedupe_keys || v_keys)),
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
        source = v_row->'source'->>'source',
        actor_id = v_row->'source'->>'actorId',
        actor_build_id = nullif(v_row->'source'->>'actorBuildId',''),
        actor_run_id = nullif(v_row->'source'->>'providerRunId',''),
        adapter_version = (v_row->'source'->>'adapterVersion')::INT,
        raw_payload = coalesce(v_row->'raw', raw_payload),
        captured_at = coalesce((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp()),
        last_seen_at = clock_timestamp()
      WHERE id = v_prospect_id;
      v_deduplicated := v_deduplicated + 1;
    END IF;

    INSERT INTO prospecting_campaign_leads (
      campaign_id, prospect_id, job_id, client_id
    ) VALUES (
      v_job.campaign_id, v_prospect_id, v_job.id, v_job.client_id
    ) ON CONFLICT (campaign_id, prospect_id) DO UPDATE SET
      job_id = EXCLUDED.job_id,
      last_seen_at = clock_timestamp();
    v_prospect_id := NULL;
  END LOOP;

  UPDATE prospecting_jobs SET
    status = 'done', provider_status = 'SUCCEEDED',
    returned_results = v_returned, created_results = v_created,
    deduplicated_results = v_deduplicated,
    usage_total_usd = coalesce(p_usage_total_usd, usage_total_usd),
    lease_token = NULL, lease_until = NULL, completed_at = clock_timestamp()
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  UPDATE prospecting_campaigns SET status = 'completed'
  WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  UPDATE prospecting_usage SET
    results_returned = results_returned + v_returned,
    reported_cost_usd = reported_cost_usd + coalesce(p_usage_total_usd, 0),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = CURRENT_DATE;
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
  WHERE id = p_campaign_lead_id AND client_id = p_client_id
  FOR UPDATE;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_actor_id
      AND (role = 'super_admin' OR client_id = p_client_id)
  ) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  IF v_lead.crm_contact_id IS NOT NULL THEN RETURN v_lead.crm_contact_id; END IF;
  SELECT * INTO v_prospect FROM prospecting_prospects
  WHERE id = v_lead.prospect_id AND client_id = p_client_id;
  IF v_prospect.id IS NULL THEN
    RAISE EXCEPTION 'Prospect not found.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO crm_contacts (
    client_id, first_name, company, email, phone, job_title, status,
    source, tags, notes, created_by
  ) VALUES (
    p_client_id,
    left(coalesce(v_prospect.person_name, v_prospect.company_name, 'Lead'), 100),
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
  UPDATE prospecting_campaign_leads
  SET status = 'imported', crm_contact_id = v_contact_id
  WHERE id = v_lead.id;
  RETURN v_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION reserve_prospecting_job(UUID, UUID, UUID, TEXT, INT, NUMERIC, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_prospecting_job(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION checkpoint_prospecting_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ingest_prospecting_job_results(UUID, UUID, JSONB, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION promote_prospecting_lead_to_crm(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_prospecting_job(UUID, UUID, UUID, TEXT, INT, NUMERIC, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_prospecting_job(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION checkpoint_prospecting_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION ingest_prospecting_job_results(UUID, UUID, JSONB, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION promote_prospecting_lead_to_crm(UUID, UUID, UUID) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000200_prospecting_phase1.sql')
ON CONFLICT (version) DO NOTHING;
