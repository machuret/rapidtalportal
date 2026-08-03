-- Phase 2 audit fixes: enforce declared qualification minimums, keep scraped
-- contact details as reviewable evidence, align enrichment budgets to Sydney time,
-- and make paid enrichment reservations refundable when no provider run starts.

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
  v_required_matched TEXT[] := '{}';
  v_preferred_matched TEXT[] := '{}';
  v_excluded_matched TEXT[] := '{}';
  v_required_missing TEXT[] := '{}';
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
  v_rating_pass BOOLEAN := true;
  v_reviews_pass BOOLEAN := true;
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
  SELECT COALESCE(array_agg(lower(trim(value)) ORDER BY lower(trim(value))), '{}') INTO v_required
  FROM jsonb_array_elements_text(COALESCE(v_profile->'requiredKeywords', '[]'::jsonb));
  SELECT COALESCE(array_agg(lower(trim(value)) ORDER BY lower(trim(value))), '{}') INTO v_preferred
  FROM jsonb_array_elements_text(COALESCE(v_profile->'preferredKeywords', '[]'::jsonb));
  SELECT COALESCE(array_agg(lower(trim(value)) ORDER BY lower(trim(value))), '{}') INTO v_excluded
  FROM jsonb_array_elements_text(COALESCE(v_profile->'excludedKeywords', '[]'::jsonb));
  v_min_rating := COALESCE(NULLIF(v_profile->>'minRating', '')::numeric, 0);
  v_min_reviews := COALESCE(NULLIF(v_profile->>'minReviewCount', '')::int, 0);
  v_must_have_website := COALESCE((v_profile->>'mustHaveWebsite')::boolean, false);
  v_rating_pass := v_min_rating = 0 OR COALESCE(v_prospect.rating, -1) >= v_min_rating;
  v_reviews_pass := v_min_reviews = 0 OR COALESCE(v_prospect.review_count, -1) >= v_min_reviews;
  v_haystack := lower(concat_ws(' ',
    v_prospect.company_name, v_prospect.industry, v_prospect.description,
    v_prospect.address, v_prospect.locality, v_prospect.region,
    v_snapshot.title, v_snapshot.description, v_snapshot.content_excerpt
  ));

  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_required_matched
  FROM unnest(v_required) term WHERE term <> '' AND v_haystack LIKE '%' || term || '%';
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_required_missing
  FROM unnest(v_required) term WHERE term <> '' AND v_haystack NOT LIKE '%' || term || '%';
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_preferred_matched
  FROM unnest(v_preferred) term WHERE term <> '' AND v_haystack LIKE '%' || term || '%';
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_excluded_matched
  FROM unnest(v_excluded) term WHERE term <> '' AND v_haystack LIKE '%' || term || '%';
  v_required_matches := cardinality(v_required_matched);
  v_preferred_matches := cardinality(v_preferred_matched);
  v_excluded_matches := cardinality(v_excluded_matched);

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
    v_quality_score := v_quality_score + CASE WHEN v_rating_pass THEN 8 ELSE 3 END;
  END IF;
  IF v_prospect.review_count IS NOT NULL THEN
    v_quality_score := v_quality_score + CASE WHEN v_reviews_pass THEN 7 ELSE 2 END;
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
  IF NOT v_rating_pass OR NOT v_reviews_pass THEN v_score := least(v_score, 49); END IF;
  v_band := CASE WHEN v_score >= 75 THEN 'strong' WHEN v_score >= 50 THEN 'possible' ELSE 'weak' END;

  UPDATE prospecting_campaign_leads SET
    fit_score = v_score,
    fit_band = v_band,
    score_version = 'prospecting-fit-v2',
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
        'requiredMatched', to_jsonb(v_required_matched),
        'requiredMissing', to_jsonb(v_required_missing),
        'preferredMatched', to_jsonb(v_preferred_matched),
        'excludedMatched', to_jsonb(v_excluded_matched),
        'minimumRating', v_min_rating,
        'ratingObserved', v_prospect.rating,
        'minimumRatingMet', v_rating_pass,
        'minimumReviews', v_min_reviews,
        'reviewsObserved', v_prospect.review_count,
        'minimumReviewsMet', v_reviews_pass,
        'mustHaveWebsite', v_must_have_website,
        'hasWebsite', v_prospect.website_url IS NOT NULL
      ),
      'explanation', CASE
        WHEN v_excluded_matches > 0 THEN 'Excluded terms were found.'
        WHEN cardinality(v_required_missing) > 0 THEN 'One or more required terms were not found.'
        WHEN NOT v_rating_pass THEN 'The minimum rating was not met or could not be verified.'
        WHEN NOT v_reviews_pass THEN 'The minimum review count was not met or could not be verified.'
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
  v_usage_date DATE := (clock_timestamp() AT TIME ZONE 'Australia/Sydney')::date;
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  IF v_lead.status NOT IN ('new', 'shortlisted') THEN
    RAISE EXCEPTION 'Only new or shortlisted leads can be enriched.' USING ERRCODE = 'P0001';
  END IF;
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
  INSERT INTO prospecting_usage (client_id, usage_date) VALUES (p_client_id, v_usage_date)
  ON CONFLICT (client_id, usage_date) DO NOTHING;
  SELECT * INTO v_usage FROM prospecting_usage
  WHERE client_id = p_client_id AND usage_date = v_usage_date FOR UPDATE;
  IF v_usage.enrichments_started + 1 > greatest(1, p_daily_enrichment_limit) THEN
    RAISE EXCEPTION 'Daily enrichment budget reached.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE prospecting_usage SET enrichments_started = enrichments_started + 1, updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND usage_date = v_usage_date;
  INSERT INTO prospecting_jobs (
    campaign_id, client_id, source, job_type, lead_id, prospect_id, status,
    actor_id, adapter_version, requested_results, max_charge_usd, usage_date,
    created_by, provider_confirmation_deadline
  ) VALUES (
    v_lead.campaign_id, p_client_id, 'website_enrichment', 'enrichment', v_lead.id, v_lead.prospect_id, 'queued',
    p_actor_identifier, p_adapter_version, 5, p_max_charge_usd, v_usage_date,
    p_actor_id, clock_timestamp() + interval '15 minutes'
  ) RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION release_prospecting_enrichment_reservation(
  p_job_id UUID,
  p_client_id UUID,
  p_error_code TEXT DEFAULT 'provider_not_started',
  p_error_message TEXT DEFAULT 'Company enrichment did not start. No daily allowance was used.'
)
RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND client_id = p_client_id FOR UPDATE;
  IF v_job.id IS NULL OR v_job.job_type <> 'enrichment' THEN
    RAISE EXCEPTION 'Enrichment job not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.actor_run_id IS NOT NULL OR v_job.reservation_released_at IS NOT NULL THEN
    RETURN NEXT v_job;
    RETURN;
  END IF;
  UPDATE prospecting_usage SET
    enrichments_started = greatest(0, enrichments_started - 1),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  UPDATE prospecting_jobs SET
    status = 'error',
    error_code = left(coalesce(p_error_code, 'provider_not_started'), 120),
    error_message = left(coalesce(p_error_message, 'Company enrichment did not start.'), 500),
    completed_at = clock_timestamp(),
    reservation_released_at = clock_timestamp(),
    lease_token = NULL,
    lease_until = NULL
  WHERE id = v_job.id RETURNING * INTO v_job;
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

  -- Enrichment contact details remain evidence until a user selects them while
  -- adding the lead to CRM. They must not silently replace canonical fields.
  UPDATE prospecting_prospects SET
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
    usage_total_usd = p_usage_total_usd, usage_recorded_at = clock_timestamp(),
    completed_at = clock_timestamp(), lease_token = NULL, lease_until = NULL,
    error_code = NULL, error_message = NULL
  WHERE id = v_job.id RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION update_prospecting_campaign_profile(
  p_campaign_id UUID,
  p_client_id UUID,
  p_profile JSONB
)
RETURNS SETOF prospecting_campaigns
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_campaign prospecting_campaigns%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Ideal profile must be an object.' USING ERRCODE = '22023';
  END IF;
  UPDATE prospecting_campaigns SET ideal_profile = p_profile, updated_at = clock_timestamp()
  WHERE id = p_campaign_id AND client_id = p_client_id
  RETURNING * INTO v_campaign;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = 'P0001'; END IF;
  PERFORM rescore_prospecting_campaign(p_campaign_id, p_client_id);
  RETURN NEXT v_campaign;
END;
$$;

CREATE OR REPLACE FUNCTION promote_prospecting_lead_to_crm_v2(
  p_campaign_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_selected_email TEXT DEFAULT NULL,
  p_selected_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_lead prospecting_campaign_leads%ROWTYPE;
  v_prospect prospecting_prospects%ROWTYPE;
  v_snapshot prospecting_enrichment_snapshots%ROWTYPE;
  v_contact_id UUID;
  v_email TEXT := NULLIF(lower(trim(p_selected_email)), '');
  v_phone TEXT := NULLIF(trim(p_selected_phone), '');
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_campaign_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  IF v_lead.status = 'dismissed' THEN RAISE EXCEPTION 'Restore this lead before adding it to CRM.' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_prospect FROM prospecting_prospects
  WHERE id = v_lead.prospect_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.latest_enrichment_id IS NOT NULL THEN
    SELECT * INTO v_snapshot FROM prospecting_enrichment_snapshots
    WHERE id = v_lead.latest_enrichment_id AND client_id = p_client_id;
  END IF;
  IF v_email IS NOT NULL AND v_email IS DISTINCT FROM lower(v_prospect.email)
     AND NOT (v_email = ANY(COALESCE(v_snapshot.emails, '{}'))) THEN
    RAISE EXCEPTION 'Selected email is not part of this lead evidence.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone IS DISTINCT FROM v_prospect.phone
     AND NOT (v_phone = ANY(COALESCE(v_snapshot.phones, '{}'))) THEN
    RAISE EXCEPTION 'Selected phone is not part of this lead evidence.' USING ERRCODE = '22023';
  END IF;
  v_email := COALESCE(v_email, v_prospect.email);
  v_phone := COALESCE(v_phone, v_prospect.phone);

  v_contact_id := v_prospect.crm_contact_id;
  IF v_contact_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM crm_contacts
    WHERE client_id = p_client_id AND lower(email) = v_email ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN
    INSERT INTO crm_contacts (
      client_id, first_name, company, email, phone, job_title, status,
      source, tags, notes, created_by
    ) VALUES (
      p_client_id, left(coalesce(v_prospect.person_name, 'Company lead'), 100),
      left(v_prospect.company_name, 200), v_email, left(v_phone, 50), left(v_prospect.job_title, 200),
      'lead', 'RapidTal Lead Generation · ' || v_prospect.source, ARRAY['lead-generation'],
      nullif(concat_ws(E'\n',
        CASE WHEN v_prospect.website_url IS NOT NULL THEN 'Website: ' || v_prospect.website_url END,
        CASE WHEN v_prospect.source_url IS NOT NULL THEN 'Discovery source: ' || v_prospect.source_url END,
        CASE WHEN v_prospect.address IS NOT NULL THEN 'Address: ' || v_prospect.address END
      ), ''), p_actor_id
    ) RETURNING id INTO v_contact_id;
  END IF;
  UPDATE prospecting_prospects SET crm_contact_id = v_contact_id WHERE id = v_prospect.id;
  UPDATE prospecting_campaign_leads SET status = 'imported', crm_contact_id = v_contact_id
  WHERE prospect_id = v_prospect.id AND client_id = p_client_id;
  RETURN v_contact_id;
END;
$$;

DO $$ DECLARE v_id UUID; v_client UUID; BEGIN
  FOR v_id, v_client IN SELECT id, client_id FROM prospecting_campaign_leads LOOP
    PERFORM refresh_prospecting_lead_score(v_id, v_client);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION release_prospecting_enrichment_reservation(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_prospecting_campaign_profile(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION promote_prospecting_lead_to_crm_v2(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_prospecting_enrichment_reservation(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_prospecting_campaign_profile(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION promote_prospecting_lead_to_crm_v2(UUID, UUID, UUID, TEXT, TEXT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000303_prospecting_phase2_audit_fixes.sql')
ON CONFLICT (version) DO NOTHING;
