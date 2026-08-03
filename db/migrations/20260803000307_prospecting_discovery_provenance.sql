-- Preserve every discovery result immutably and keep conservative identity
-- signals without automatically merging franchises or shared switchboards.

ALTER TABLE prospecting_prospects
  ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE prospecting_prospects DROP CONSTRAINT IF EXISTS prospecting_prospects_field_provenance_object;
ALTER TABLE prospecting_prospects ADD CONSTRAINT prospecting_prospects_field_provenance_object
  CHECK (jsonb_typeof(field_provenance) = 'object');

CREATE TABLE IF NOT EXISTS prospecting_discovery_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  job_id UUID NOT NULL,
  prospect_id UUID NOT NULL,
  source TEXT NOT NULL,
  canonical_key TEXT NOT NULL CHECK (char_length(canonical_key) = 64),
  dedupe_keys TEXT[] NOT NULL CHECK (cardinality(dedupe_keys) BETWEEN 1 AND 20),
  normalized_payload JSONB NOT NULL CHECK (jsonb_typeof(normalized_payload) = 'object'),
  raw_payload JSONB NOT NULL CHECK (jsonb_typeof(raw_payload) = 'object'),
  payload_hash TEXT NOT NULL CHECK (char_length(payload_hash) = 64),
  actor_id TEXT NOT NULL,
  actor_provider_id TEXT,
  actor_build_requested TEXT,
  actor_build_id TEXT,
  actor_run_id TEXT NOT NULL,
  adapter_version INT NOT NULL CHECK (adapter_version > 0),
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, client_id),
  UNIQUE (job_id, canonical_key),
  FOREIGN KEY (campaign_id, client_id) REFERENCES prospecting_campaigns(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, client_id) REFERENCES prospecting_jobs(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (prospect_id, client_id) REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prospecting_discovery_captures_prospect_idx
  ON prospecting_discovery_captures (client_id, prospect_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS prospecting_identity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL,
  identity_type TEXT NOT NULL CHECK (identity_type IN (
    'google_place','domain','phone','name_address','linkedin','email','person_name_company'
  )),
  identity_key TEXT NOT NULL CHECK (char_length(identity_key) = 64),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, prospect_id, identity_type, identity_key),
  FOREIGN KEY (prospect_id, client_id) REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prospecting_identity_alias_lookup_idx
  ON prospecting_identity_aliases (client_id, identity_type, identity_key);

CREATE TABLE IF NOT EXISTS prospecting_merge_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  left_prospect_id UUID NOT NULL,
  right_prospect_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (left_prospect_id < right_prospect_id),
  UNIQUE (client_id, left_prospect_id, right_prospect_id),
  FOREIGN KEY (left_prospect_id, client_id) REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (right_prospect_id, client_id) REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prospecting_merge_suggestions_inbox_idx
  ON prospecting_merge_suggestions (client_id, status, confidence DESC, created_at DESC);

DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'prospecting_discovery_captures','prospecting_identity_aliases','prospecting_merge_suggestions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
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

CREATE OR REPLACE FUNCTION ingest_prospecting_job_results_v2(
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
  v_signal JSONB;
  v_keys TEXT[];
  v_prospect_id UUID;
  v_other_id UUID;
  v_capture_id UUID;
  v_identity_type TEXT;
  v_identity_key TEXT;
  v_confidence NUMERIC;
  v_created INT := 0;
  v_deduplicated INT := 0;
  v_returned INT := 0;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token AND lease_until > clock_timestamp()
  FOR UPDATE;
  IF v_job.id IS NULL OR v_job.job_type <> 'collection' THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(COALESCE(p_results, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_results, '[]'::jsonb)) > v_job.requested_results THEN
    RAISE EXCEPTION 'Normalized result set is invalid.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_job.client_id::TEXT, 0));

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_results, '[]'::jsonb)) LOOP
    v_returned := v_returned + 1;
    SELECT COALESCE(array_agg(DISTINCT value), '{}') INTO v_keys
      FROM jsonb_array_elements_text(COALESCE(v_row->'dedupeKeys', '[]'::jsonb));
    IF char_length(COALESCE(v_row->>'canonicalKey', '')) <> 64
       OR cardinality(v_keys) < 1 OR cardinality(v_keys) > 20
       OR EXISTS (SELECT 1 FROM unnest(v_keys) key WHERE char_length(key) <> 64) THEN
      RAISE EXCEPTION 'Normalized prospect is missing its identity.' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_row->>'canonicalKey' = ANY(v_keys)) THEN
      v_keys := array_append(v_keys, v_row->>'canonicalKey');
    END IF;

    SELECT id INTO v_prospect_id FROM prospecting_prospects
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
        NULLIF(v_row->>'companyName',''), NULLIF(v_row->>'personName',''),
        NULLIF(v_row->>'jobTitle',''), NULLIF(v_row->>'websiteUrl',''),
        NULLIF(v_row->>'linkedinUrl',''), NULLIF(v_row->>'sourceUrl',''),
        NULLIF(v_row->>'email',''), NULLIF(v_row->>'phone',''), NULLIF(v_row->>'address',''),
        NULLIF(v_row->>'locality',''), NULLIF(v_row->>'region',''), NULLIF(v_row->>'countryCode',''),
        NULLIF(v_row->>'industry',''), (v_row->>'employeeCount')::INT,
        (v_row->>'rating')::NUMERIC, (v_row->>'reviewCount')::INT,
        (v_row->>'latitude')::DOUBLE PRECISION, (v_row->>'longitude')::DOUBLE PRECISION,
        NULLIF(v_row->>'description',''), v_row->'source'->>'source',
        v_row->'source'->>'actorId', NULLIF(v_row->'source'->>'actorBuildId',''),
        NULLIF(v_row->'source'->>'providerRunId',''), (v_row->'source'->>'adapterVersion')::INT,
        COALESCE(v_row->'raw', '{}'::jsonb),
        COALESCE((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp())
      ) RETURNING id INTO v_prospect_id;
      v_created := v_created + 1;
    ELSE
      UPDATE prospecting_prospects SET
        dedupe_keys = ARRAY(SELECT DISTINCT key FROM unnest(dedupe_keys || v_keys) key),
        company_name = COALESCE(NULLIF(v_row->>'companyName',''), company_name),
        person_name = COALESCE(NULLIF(v_row->>'personName',''), person_name),
        job_title = COALESCE(NULLIF(v_row->>'jobTitle',''), job_title),
        website_url = COALESCE(NULLIF(v_row->>'websiteUrl',''), website_url),
        linkedin_url = COALESCE(NULLIF(v_row->>'linkedinUrl',''), linkedin_url),
        source_url = COALESCE(NULLIF(v_row->>'sourceUrl',''), source_url),
        email = COALESCE(NULLIF(v_row->>'email',''), email), phone = COALESCE(NULLIF(v_row->>'phone',''), phone),
        address = COALESCE(NULLIF(v_row->>'address',''), address), locality = COALESCE(NULLIF(v_row->>'locality',''), locality),
        region = COALESCE(NULLIF(v_row->>'region',''), region), country_code = COALESCE(NULLIF(v_row->>'countryCode',''), country_code),
        industry = COALESCE(NULLIF(v_row->>'industry',''), industry),
        employee_count = COALESCE((v_row->>'employeeCount')::INT, employee_count),
        rating = COALESCE((v_row->>'rating')::NUMERIC, rating), review_count = COALESCE((v_row->>'reviewCount')::INT, review_count),
        latitude = COALESCE((v_row->>'latitude')::DOUBLE PRECISION, latitude), longitude = COALESCE((v_row->>'longitude')::DOUBLE PRECISION, longitude),
        description = COALESCE(NULLIF(v_row->>'description',''), description),
        source = v_row->'source'->>'source', actor_id = v_row->'source'->>'actorId',
        actor_build_id = NULLIF(v_row->'source'->>'actorBuildId',''),
        actor_run_id = NULLIF(v_row->'source'->>'providerRunId',''),
        adapter_version = (v_row->'source'->>'adapterVersion')::INT,
        raw_payload = COALESCE(v_row->'raw', raw_payload),
        captured_at = COALESCE((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp()),
        last_seen_at = clock_timestamp()
      WHERE id = v_prospect_id;
      v_deduplicated := v_deduplicated + 1;
    END IF;

    INSERT INTO prospecting_discovery_captures (
      client_id, campaign_id, job_id, prospect_id, source, canonical_key, dedupe_keys,
      normalized_payload, raw_payload, payload_hash, actor_id, actor_provider_id,
      actor_build_requested, actor_build_id, actor_run_id, adapter_version, captured_at
    ) VALUES (
      v_job.client_id, v_job.campaign_id, v_job.id, v_prospect_id, v_job.source,
      v_row->>'canonicalKey', v_keys, v_row - 'raw', COALESCE(v_row->'raw', '{}'::jsonb),
      encode(extensions.digest(convert_to(v_row::text, 'UTF8'), 'sha256'), 'hex'), v_job.actor_id, v_job.actor_provider_id,
      v_job.actor_build_requested, v_job.actor_build_id, v_job.actor_run_id, v_job.adapter_version,
      COALESCE((v_row->'source'->>'capturedAt')::TIMESTAMPTZ, clock_timestamp())
    ) ON CONFLICT (job_id, canonical_key) DO NOTHING;
    SELECT id INTO v_capture_id FROM prospecting_discovery_captures
    WHERE job_id = v_job.id AND canonical_key = v_row->>'canonicalKey';

    UPDATE prospecting_prospects SET field_provenance = field_provenance || jsonb_strip_nulls(jsonb_build_object(
      'company_name', CASE WHEN NULLIF(v_row->>'companyName','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'website_url', CASE WHEN NULLIF(v_row->>'websiteUrl','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'linkedin_url', CASE WHEN NULLIF(v_row->>'linkedinUrl','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'email', CASE WHEN NULLIF(v_row->>'email','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'phone', CASE WHEN NULLIF(v_row->>'phone','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'address', CASE WHEN NULLIF(v_row->>'address','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'industry', CASE WHEN NULLIF(v_row->>'industry','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'rating', CASE WHEN v_row->>'rating' IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'review_count', CASE WHEN v_row->>'reviewCount' IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END,
      'description', CASE WHEN NULLIF(v_row->>'description','') IS NOT NULL THEN jsonb_build_object('captureId',v_capture_id,'source',v_job.source) END
    )) WHERE id = v_prospect_id;

    FOR v_signal IN SELECT value FROM jsonb_array_elements(COALESCE(v_row->'identitySignals', '[]'::jsonb)) LOOP
      v_identity_type := v_signal->>'type';
      v_identity_key := v_signal->>'key';
      IF v_identity_type IN ('google_place','domain','phone','name_address','linkedin','email','person_name_company')
         AND char_length(COALESCE(v_identity_key,'')) = 64 THEN
        FOR v_other_id IN SELECT prospect_id FROM prospecting_identity_aliases
          WHERE client_id = v_job.client_id AND identity_type = v_identity_type
            AND identity_key = v_identity_key AND prospect_id <> v_prospect_id LOOP
          v_confidence := CASE v_identity_type
            WHEN 'linkedin' THEN 0.95 WHEN 'email' THEN 0.92 WHEN 'domain' THEN 0.85
            WHEN 'phone' THEN 0.75 WHEN 'name_address' THEN 0.70 ELSE 0.65 END;
          INSERT INTO prospecting_merge_suggestions (
            client_id, left_prospect_id, right_prospect_id, confidence, evidence
          ) VALUES (
            v_job.client_id, least(v_prospect_id, v_other_id), greatest(v_prospect_id, v_other_id),
            v_confidence, jsonb_build_array(jsonb_build_object('type',v_identity_type,'identityKey',v_identity_key,'captureId',v_capture_id))
          ) ON CONFLICT (client_id, left_prospect_id, right_prospect_id) DO UPDATE SET
            confidence = greatest(prospecting_merge_suggestions.confidence, EXCLUDED.confidence),
            evidence = prospecting_merge_suggestions.evidence || EXCLUDED.evidence,
            updated_at = clock_timestamp();
        END LOOP;
        INSERT INTO prospecting_identity_aliases (
          client_id, prospect_id, identity_type, identity_key, is_primary, source
        ) VALUES (
          v_job.client_id, v_prospect_id, v_identity_type, v_identity_key,
          COALESCE((v_signal->>'primary')::BOOLEAN, false), v_job.source
        ) ON CONFLICT (client_id, prospect_id, identity_type, identity_key) DO UPDATE SET
          is_primary = prospecting_identity_aliases.is_primary OR EXCLUDED.is_primary,
          last_seen_at = clock_timestamp();
      END IF;
    END LOOP;

    INSERT INTO prospecting_campaign_leads (campaign_id, prospect_id, job_id, client_id)
    VALUES (v_job.campaign_id, v_prospect_id, v_job.id, v_job.client_id)
    ON CONFLICT (campaign_id, prospect_id) DO UPDATE SET job_id = EXCLUDED.job_id, last_seen_at = clock_timestamp();
    v_prospect_id := NULL;
  END LOOP;

  UPDATE prospecting_jobs SET
    status = 'done', provider_status = 'SUCCEEDED', returned_results = v_returned,
    created_results = v_created, deduplicated_results = v_deduplicated,
    usage_total_usd = COALESCE(p_usage_total_usd, usage_total_usd),
    usage_recorded_at = clock_timestamp(), error_code = NULL, error_message = NULL,
    next_attempt_at = NULL, lease_token = NULL, lease_until = NULL, completed_at = clock_timestamp()
  WHERE id = v_job.id RETURNING * INTO v_job;
  UPDATE prospecting_campaigns SET status = 'completed' WHERE id = v_job.campaign_id AND client_id = v_job.client_id;
  UPDATE prospecting_usage SET
    results_returned = results_returned + v_returned,
    reported_cost_usd = reported_cost_usd + COALESCE(p_usage_total_usd, 0),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION ingest_prospecting_job_results_v2(UUID, UUID, JSONB, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_prospecting_job_results_v2(UUID, UUID, JSONB, NUMERIC) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000307_prospecting_discovery_provenance.sql')
ON CONFLICT (version) DO NOTHING;
