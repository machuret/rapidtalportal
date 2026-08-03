-- ============================================================
-- Lead Generation Phase 2 — qualification and company enrichment
-- Explainable ICP scoring plus explicit, durable Apify website enrichment.
-- Person/email discovery remains a later, separately approved spend step.
-- ============================================================

ALTER TABLE prospecting_campaigns
  ADD COLUMN IF NOT EXISTS ideal_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE prospecting_campaigns
  DROP CONSTRAINT IF EXISTS prospecting_campaigns_ideal_profile_object;
ALTER TABLE prospecting_campaigns
  ADD CONSTRAINT prospecting_campaigns_ideal_profile_object
  CHECK (jsonb_typeof(ideal_profile) = 'object');

ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_source_check;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_source_check
  CHECK (source IN ('google_maps', 'google_search', 'website_enrichment'));
ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'collection',
  ADD COLUMN IF NOT EXISTS lead_id UUID,
  ADD COLUMN IF NOT EXISTS prospect_id UUID;
ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_job_type_check;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_job_type_check
  CHECK (job_type IN ('collection', 'enrichment'));
ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_kind_fields_check;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_kind_fields_check CHECK (
  (job_type = 'collection' AND source IN ('google_maps', 'google_search') AND lead_id IS NULL AND prospect_id IS NULL)
  OR
  (job_type = 'enrichment' AND source = 'website_enrichment' AND lead_id IS NOT NULL AND prospect_id IS NOT NULL)
);

ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_lead_client_fkey;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_lead_client_fkey
  FOREIGN KEY (lead_id, client_id)
  REFERENCES prospecting_campaign_leads(id, client_id) ON DELETE CASCADE;
ALTER TABLE prospecting_jobs DROP CONSTRAINT IF EXISTS prospecting_jobs_prospect_client_fkey;
ALTER TABLE prospecting_jobs ADD CONSTRAINT prospecting_jobs_prospect_client_fkey
  FOREIGN KEY (prospect_id, client_id)
  REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE;

DROP INDEX IF EXISTS prospecting_jobs_one_active_campaign;
CREATE UNIQUE INDEX prospecting_jobs_one_active_campaign
  ON prospecting_jobs (campaign_id)
  WHERE job_type = 'collection' AND status IN ('queued', 'running', 'ingesting');
CREATE UNIQUE INDEX IF NOT EXISTS prospecting_jobs_one_active_enrichment
  ON prospecting_jobs (lead_id)
  WHERE job_type = 'enrichment' AND status IN ('queued', 'running', 'ingesting');
CREATE INDEX IF NOT EXISTS prospecting_jobs_lead_idx
  ON prospecting_jobs (lead_id, created_at DESC) WHERE lead_id IS NOT NULL;

ALTER TABLE prospecting_usage
  ADD COLUMN IF NOT EXISTS enrichments_started INT NOT NULL DEFAULT 0 CHECK (enrichments_started >= 0),
  ADD COLUMN IF NOT EXISTS enrichment_pages INT NOT NULL DEFAULT 0 CHECK (enrichment_pages >= 0);

CREATE TABLE IF NOT EXISTS prospecting_enrichment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  prospect_id UUID NOT NULL,
  job_id UUID NOT NULL,
  website_url TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  page_count INT NOT NULL DEFAULT 0 CHECK (page_count BETWEEN 0 AND 25),
  page_urls TEXT[] NOT NULL DEFAULT '{}',
  title TEXT,
  description TEXT,
  content_excerpt TEXT,
  emails TEXT[] NOT NULL DEFAULT '{}',
  phones TEXT[] NOT NULL DEFAULT '{}',
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) = 64),
  actor_id TEXT NOT NULL,
  actor_build_id TEXT,
  actor_run_id TEXT NOT NULL,
  adapter_version INT NOT NULL CHECK (adapter_version > 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, client_id),
  UNIQUE (job_id),
  UNIQUE (client_id, actor_run_id),
  FOREIGN KEY (campaign_id, client_id)
    REFERENCES prospecting_campaigns(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id, client_id)
    REFERENCES prospecting_campaign_leads(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (prospect_id, client_id)
    REFERENCES prospecting_prospects(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, client_id)
    REFERENCES prospecting_jobs(id, client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prospecting_enrichment_lead_idx
  ON prospecting_enrichment_snapshots (client_id, lead_id, captured_at DESC);

ALTER TABLE prospecting_campaign_leads
  ADD COLUMN IF NOT EXISTS fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS fit_band TEXT,
  ADD COLUMN IF NOT EXISTS fit_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score_version TEXT,
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_enrichment_id UUID;
ALTER TABLE prospecting_campaign_leads DROP CONSTRAINT IF EXISTS prospecting_campaign_leads_fit_score_check;
ALTER TABLE prospecting_campaign_leads ADD CONSTRAINT prospecting_campaign_leads_fit_score_check
  CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100);
ALTER TABLE prospecting_campaign_leads DROP CONSTRAINT IF EXISTS prospecting_campaign_leads_fit_band_check;
ALTER TABLE prospecting_campaign_leads ADD CONSTRAINT prospecting_campaign_leads_fit_band_check
  CHECK (fit_band IS NULL OR fit_band IN ('strong', 'possible', 'weak'));
ALTER TABLE prospecting_campaign_leads DROP CONSTRAINT IF EXISTS prospecting_campaign_leads_latest_enrichment_fkey;
ALTER TABLE prospecting_campaign_leads ADD CONSTRAINT prospecting_campaign_leads_latest_enrichment_fkey
  FOREIGN KEY (latest_enrichment_id, client_id)
  REFERENCES prospecting_enrichment_snapshots(id, client_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS prospecting_campaign_leads_fit_idx
  ON prospecting_campaign_leads (client_id, fit_score DESC NULLS LAST, discovered_at DESC);

ALTER TABLE prospecting_enrichment_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospecting_enrichment_snapshots_super_admin_all ON prospecting_enrichment_snapshots;
CREATE POLICY prospecting_enrichment_snapshots_super_admin_all
  ON prospecting_enrichment_snapshots FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');
DROP POLICY IF EXISTS prospecting_enrichment_snapshots_tenant_select ON prospecting_enrichment_snapshots;
CREATE POLICY prospecting_enrichment_snapshots_tenant_select
  ON prospecting_enrichment_snapshots FOR SELECT
  USING (client_id = current_user_client_id());

CREATE OR REPLACE FUNCTION refresh_prospecting_lead_score(
  p_lead_id UUID,
  p_client_id UUID
)
RETURNS SETOF prospecting_campaign_leads
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_lead prospecting_campaign_leads%ROWTYPE;
  v_campaign prospecting_campaigns%ROWTYPE;
  v_prospect prospecting_prospects%ROWTYPE;
  v_snapshot prospecting_enrichment_snapshots%ROWTYPE;
  v_profile JSONB;
  v_haystack TEXT;
  v_required TEXT[];
  v_preferred TEXT[];
  v_excluded TEXT[];
  v_required_matches INT := 0;
  v_preferred_matches INT := 0;
  v_excluded_matches INT := 0;
  v_query_score INT := 0;
  v_location_score INT := 0;
  v_quality_score INT := 0;
  v_contact_score INT := 0;
  v_completeness_score INT := 0;
  v_score INT := 0;
  v_band TEXT;
  v_min_rating NUMERIC := 0;
  v_min_reviews INT := 0;
  v_must_have_website BOOLEAN := false;
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_campaign FROM prospecting_campaigns
  WHERE id = v_lead.campaign_id AND client_id = p_client_id;
  SELECT * INTO v_prospect FROM prospecting_prospects
  WHERE id = v_lead.prospect_id AND client_id = p_client_id;
  IF v_lead.latest_enrichment_id IS NOT NULL THEN
    SELECT * INTO v_snapshot FROM prospecting_enrichment_snapshots
    WHERE id = v_lead.latest_enrichment_id AND client_id = p_client_id;
  END IF;

  v_profile := COALESCE(v_campaign.ideal_profile, '{}'::jsonb);
  SELECT COALESCE(array_agg(lower(trim(value))), '{}') INTO v_required
  FROM jsonb_array_elements_text(COALESCE(v_profile->'requiredKeywords', '[]'::jsonb));
  SELECT COALESCE(array_agg(lower(trim(value))), '{}') INTO v_preferred
  FROM jsonb_array_elements_text(COALESCE(v_profile->'preferredKeywords', '[]'::jsonb));
  SELECT COALESCE(array_agg(lower(trim(value))), '{}') INTO v_excluded
  FROM jsonb_array_elements_text(COALESCE(v_profile->'excludedKeywords', '[]'::jsonb));
  v_min_rating := COALESCE(NULLIF(v_profile->>'minRating', '')::numeric, 0);
  v_min_reviews := COALESCE(NULLIF(v_profile->>'minReviewCount', '')::int, 0);
  v_must_have_website := COALESCE((v_profile->>'mustHaveWebsite')::boolean, false);
  v_haystack := lower(concat_ws(' ',
    v_prospect.company_name, v_prospect.industry, v_prospect.description,
    v_prospect.address, v_prospect.locality, v_prospect.region,
    v_snapshot.title, v_snapshot.description, v_snapshot.content_excerpt
  ));

  SELECT count(*) INTO v_required_matches FROM unnest(v_required) term
  WHERE term <> '' AND v_haystack LIKE '%' || term || '%';
  SELECT count(*) INTO v_preferred_matches FROM unnest(v_preferred) term
  WHERE term <> '' AND v_haystack LIKE '%' || term || '%';
  SELECT count(*) INTO v_excluded_matches FROM unnest(v_excluded) term
  WHERE term <> '' AND v_haystack LIKE '%' || term || '%';

  IF EXISTS (
    SELECT 1 FROM unnest(v_campaign.queries) query
    WHERE query <> '' AND to_tsvector('simple', v_haystack) @@ plainto_tsquery('simple', query)
  ) THEN v_query_score := 25;
  ELSE v_query_score := 10;
  END IF;
  IF cardinality(v_required) = 0 THEN v_query_score := v_query_score + 5;
  ELSE v_query_score := v_query_score + round(5.0 * v_required_matches / cardinality(v_required));
  END IF;
  IF cardinality(v_preferred) = 0 THEN v_query_score := v_query_score + 5;
  ELSE v_query_score := v_query_score + round(5.0 * v_preferred_matches / cardinality(v_preferred));
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_campaign.locations) location
    WHERE location <> '' AND v_haystack LIKE '%' || lower(location) || '%'
  ) THEN v_location_score := 20;
  ELSIF v_prospect.locality IS NOT NULL OR v_prospect.region IS NOT NULL THEN v_location_score := 14;
  ELSE v_location_score := 5;
  END IF;

  IF v_prospect.rating IS NOT NULL THEN
    v_quality_score := v_quality_score + CASE WHEN v_min_rating = 0 OR v_prospect.rating >= v_min_rating THEN 8 ELSE 3 END;
  END IF;
  IF v_prospect.review_count IS NOT NULL THEN
    v_quality_score := v_quality_score + CASE WHEN v_min_reviews = 0 OR v_prospect.review_count >= v_min_reviews THEN 7 ELSE 2 END;
  END IF;

  v_contact_score :=
    CASE WHEN v_prospect.website_url IS NOT NULL THEN 5 ELSE 0 END +
    CASE WHEN v_prospect.phone IS NOT NULL OR cardinality(COALESCE(v_snapshot.phones, '{}')) > 0 THEN 4 ELSE 0 END +
    CASE WHEN v_prospect.email IS NOT NULL OR cardinality(COALESCE(v_snapshot.emails, '{}')) > 0 THEN 4 ELSE 0 END +
    CASE WHEN v_prospect.linkedin_url IS NOT NULL OR COALESCE(v_snapshot.social_links, '{}'::jsonb) ? 'linkedin' THEN 2 ELSE 0 END;
  v_completeness_score :=
    CASE WHEN v_prospect.company_name IS NOT NULL THEN 3 ELSE 0 END +
    CASE WHEN v_prospect.industry IS NOT NULL THEN 4 ELSE 0 END +
    CASE WHEN v_prospect.description IS NOT NULL OR v_snapshot.description IS NOT NULL THEN 4 ELSE 0 END +
    CASE WHEN v_prospect.address IS NOT NULL THEN 4 ELSE 0 END;

  v_score := least(100, v_query_score + v_location_score + v_quality_score + v_contact_score + v_completeness_score);
  IF v_excluded_matches > 0 THEN v_score := least(v_score, 25); END IF;
  IF v_must_have_website AND v_prospect.website_url IS NULL THEN v_score := least(v_score, 35); END IF;
  IF cardinality(v_required) > 0 AND v_required_matches < cardinality(v_required) THEN v_score := least(v_score, 49); END IF;
  v_band := CASE WHEN v_score >= 75 THEN 'strong' WHEN v_score >= 50 THEN 'possible' ELSE 'weak' END;

  UPDATE prospecting_campaign_leads SET
    fit_score = v_score,
    fit_band = v_band,
    score_version = 'prospecting-fit-v1',
    scored_at = clock_timestamp(),
    fit_breakdown = jsonb_build_object(
      'dimensions', jsonb_build_object(
        'relevance', jsonb_build_object('score', v_query_score, 'maximum', 35),
        'location', jsonb_build_object('score', v_location_score, 'maximum', 20),
        'businessProof', jsonb_build_object('score', v_quality_score, 'maximum', 15),
        'contactability', jsonb_build_object('score', v_contact_score, 'maximum', 15),
        'completeness', jsonb_build_object('score', v_completeness_score, 'maximum', 15)
      ),
      'criteria', jsonb_build_object(
        'requiredMatched', v_required_matches, 'requiredTotal', cardinality(v_required),
        'preferredMatched', v_preferred_matches, 'preferredTotal', cardinality(v_preferred),
        'excludedMatched', v_excluded_matches,
        'mustHaveWebsite', v_must_have_website
      ),
      'explanation', CASE
        WHEN v_excluded_matches > 0 THEN 'Excluded terms were found.'
        WHEN cardinality(v_required) > 0 AND v_required_matches < cardinality(v_required) THEN 'Not all required terms were found.'
        WHEN v_must_have_website AND v_prospect.website_url IS NULL THEN 'A website is required but was not found.'
        WHEN v_score >= 75 THEN 'Strong match across the campaign criteria and available business details.'
        WHEN v_score >= 50 THEN 'Possible match; enrichment or manual review may confirm the fit.'
        ELSE 'Limited evidence of fit from the currently available information.'
      END
    )
  WHERE id = v_lead.id
  RETURNING * INTO v_lead;
  RETURN NEXT v_lead;
END;
$$;

CREATE OR REPLACE FUNCTION score_new_prospecting_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM refresh_prospecting_lead_score(NEW.id, NEW.client_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prospecting_campaign_leads_initial_score ON prospecting_campaign_leads;
CREATE TRIGGER prospecting_campaign_leads_initial_score
AFTER INSERT ON prospecting_campaign_leads
FOR EACH ROW EXECUTE FUNCTION score_new_prospecting_lead();

CREATE OR REPLACE FUNCTION rescore_prospecting_campaign(
  p_campaign_id UUID,
  p_client_id UUID
)
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID; v_count INT := 0;
BEGIN
  FOR v_id IN SELECT id FROM prospecting_campaign_leads
    WHERE campaign_id = p_campaign_id AND client_id = p_client_id
  LOOP
    PERFORM refresh_prospecting_lead_score(v_id, p_client_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_prospecting_enrichment(
  p_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_actor_identifier TEXT,
  p_adapter_version INT,
  p_max_charge_usd NUMERIC,
  p_daily_enrichment_limit INT DEFAULT 50
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_lead prospecting_campaign_leads%ROWTYPE;
  v_prospect prospecting_prospects%ROWTYPE;
  v_usage prospecting_usage%ROWTYPE;
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_prospect FROM prospecting_prospects
  WHERE id = v_lead.prospect_id AND client_id = p_client_id;
  IF v_prospect.website_url IS NULL THEN
    RAISE EXCEPTION 'This lead has no website to enrich.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM prospecting_jobs WHERE lead_id = p_lead_id AND job_type = 'enrichment' AND status IN ('queued','running','ingesting')) THEN
    RAISE EXCEPTION 'This lead already has an active enrichment.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO prospecting_usage (client_id, usage_date) VALUES (p_client_id, CURRENT_DATE)
  ON CONFLICT (client_id, usage_date) DO NOTHING;
  SELECT * INTO v_usage FROM prospecting_usage
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE FOR UPDATE;
  IF v_usage.enrichments_started + 1 > greatest(1, p_daily_enrichment_limit) THEN
    RAISE EXCEPTION 'Daily enrichment budget reached.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE prospecting_usage SET enrichments_started = enrichments_started + 1, updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE;
  INSERT INTO prospecting_jobs (
    campaign_id, client_id, source, job_type, lead_id, prospect_id, status,
    actor_id, adapter_version, requested_results, max_charge_usd, usage_date,
    created_by, provider_confirmation_deadline
  ) VALUES (
    v_lead.campaign_id, p_client_id, 'website_enrichment', 'enrichment', v_lead.id, v_lead.prospect_id, 'queued',
    p_actor_identifier, p_adapter_version, 5, p_max_charge_usd, CURRENT_DATE,
    p_actor_id, clock_timestamp() + interval '15 minutes'
  ) RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION complete_prospecting_enrichment(
  p_job_id UUID,
  p_lease_token UUID,
  p_enrichment JSONB,
  p_usage_total_usd NUMERIC
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
  v_snapshot prospecting_enrichment_snapshots%ROWTYPE;
  v_emails TEXT[];
  v_phones TEXT[];
  v_page_urls TEXT[];
  v_social JSONB;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token FOR UPDATE;
  IF v_job.id IS NULL OR v_job.job_type <> 'enrichment' THEN
    RAISE EXCEPTION 'Enrichment lease is not valid.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.status = 'done' THEN RETURN NEXT v_job; RETURN; END IF;
  SELECT COALESCE(array_agg(value), '{}') INTO v_emails
    FROM jsonb_array_elements_text(COALESCE(p_enrichment->'emails', '[]'::jsonb));
  SELECT COALESCE(array_agg(value), '{}') INTO v_phones
    FROM jsonb_array_elements_text(COALESCE(p_enrichment->'phones', '[]'::jsonb));
  SELECT COALESCE(array_agg(value), '{}') INTO v_page_urls
    FROM jsonb_array_elements_text(COALESCE(p_enrichment->'pageUrls', '[]'::jsonb));
  v_social := COALESCE(p_enrichment->'socialLinks', '{}'::jsonb);
  INSERT INTO prospecting_enrichment_snapshots (
    client_id, campaign_id, lead_id, prospect_id, job_id, website_url, canonical_domain,
    page_count, page_urls, title, description, content_excerpt, emails, phones, social_links,
    content_hash, actor_id, actor_build_id, actor_run_id, adapter_version, captured_at
  ) VALUES (
    v_job.client_id, v_job.campaign_id, v_job.lead_id, v_job.prospect_id, v_job.id,
    p_enrichment->>'websiteUrl', p_enrichment->>'canonicalDomain',
    least(25, greatest(0, COALESCE((p_enrichment->>'pageCount')::int, 0))), v_page_urls,
    NULLIF(p_enrichment->>'title',''), NULLIF(p_enrichment->>'description',''),
    NULLIF(p_enrichment->>'contentExcerpt',''), v_emails, v_phones, v_social,
    p_enrichment->>'contentHash', v_job.actor_id, v_job.actor_build_id,
    v_job.actor_run_id, v_job.adapter_version, clock_timestamp()
  )
  ON CONFLICT (job_id) DO UPDATE SET job_id = EXCLUDED.job_id
  RETURNING * INTO v_snapshot;

  UPDATE prospecting_prospects SET
    email = COALESCE(email, v_emails[1]),
    phone = COALESCE(phone, v_phones[1]),
    linkedin_url = COALESCE(linkedin_url, NULLIF(v_social->>'linkedin','')),
    description = COALESCE(NULLIF(description,''), v_snapshot.description),
    updated_at = clock_timestamp()
  WHERE id = v_job.prospect_id AND client_id = v_job.client_id;
  UPDATE prospecting_campaign_leads SET latest_enrichment_id = v_snapshot.id
  WHERE id = v_job.lead_id AND client_id = v_job.client_id;
  PERFORM refresh_prospecting_lead_score(v_job.lead_id, v_job.client_id);

  UPDATE prospecting_usage SET
    enrichment_pages = enrichment_pages + v_snapshot.page_count,
    reported_cost_usd = reported_cost_usd + COALESCE(p_usage_total_usd, 0),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  UPDATE prospecting_jobs SET
    status = 'done', provider_status = 'SUCCEEDED',
    returned_results = v_snapshot.page_count, created_results = 1,
    usage_total_usd = p_usage_total_usd,
    completed_at = clock_timestamp(), lease_token = NULL, lease_until = NULL,
    error_code = NULL, error_message = NULL
  WHERE id = v_job.id RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

DO $$ DECLARE v_id UUID; v_client UUID; BEGIN
  FOR v_id, v_client IN SELECT id, client_id FROM prospecting_campaign_leads LOOP
    PERFORM refresh_prospecting_lead_score(v_id, v_client);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION refresh_prospecting_lead_score(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rescore_prospecting_campaign(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_prospecting_enrichment(UUID, UUID, UUID, TEXT, INT, NUMERIC, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_prospecting_enrichment(UUID, UUID, JSONB, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_prospecting_lead_score(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rescore_prospecting_campaign(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_prospecting_enrichment(UUID, UUID, UUID, TEXT, INT, NUMERIC, INT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_prospecting_enrichment(UUID, UUID, JSONB, NUMERIC) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000300_prospecting_phase2_qualification.sql')
ON CONFLICT (version) DO NOTHING;
