-- Qualification must compare terms as words/phrases and must not penalise a
-- provider for fields it never supplies (for example Maps ratings in Web Search).

CREATE OR REPLACE FUNCTION prospecting_phrase_matches(p_haystack TEXT, p_phrase TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN nullif(trim(coalesce(p_phrase, '')), '') IS NULL THEN false
    ELSE to_tsvector('simple', coalesce(p_haystack, ''))
      @@ phraseto_tsquery('simple', trim(p_phrase))
  END;
$$;

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
  v_required_matched TEXT[] := ARRAY[]::TEXT[];
  v_preferred_matched TEXT[] := ARRAY[]::TEXT[];
  v_excluded_matched TEXT[] := ARRAY[]::TEXT[];
  v_required_missing TEXT[] := ARRAY[]::TEXT[];
  v_required_matches INT := 0;
  v_preferred_matches INT := 0;
  v_excluded_matches INT := 0;
  v_query_score INT := 0;
  v_location_score INT := 0;
  v_quality_score INT := 0;
  v_contact_score INT := 0;
  v_completeness_score INT := 0;
  v_raw_score INT := 0;
  v_available_max INT := 100;
  v_score INT := 0;
  v_band TEXT;
  v_min_rating NUMERIC := 0;
  v_min_reviews INT := 0;
  v_must_have_website BOOLEAN := false;
  v_rating_applicable BOOLEAN := false;
  v_reviews_applicable BOOLEAN := false;
  v_rating_pass BOOLEAN := true;
  v_reviews_pass BOOLEAN := true;
BEGIN
  SELECT * INTO v_lead FROM prospecting_campaign_leads
  WHERE id = p_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
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
  v_rating_applicable := v_campaign.source = 'google_maps';
  v_reviews_applicable := v_campaign.source = 'google_maps';
  v_min_rating := CASE WHEN v_rating_applicable THEN COALESCE(NULLIF(v_profile->>'minRating', '')::numeric, 0) ELSE 0 END;
  v_min_reviews := CASE WHEN v_reviews_applicable THEN COALESCE(NULLIF(v_profile->>'minReviewCount', '')::int, 0) ELSE 0 END;
  v_must_have_website := COALESCE((v_profile->>'mustHaveWebsite')::boolean, false);
  v_rating_pass := NOT v_rating_applicable OR v_min_rating = 0 OR COALESCE(v_prospect.rating, -1) >= v_min_rating;
  v_reviews_pass := NOT v_reviews_applicable OR v_min_reviews = 0 OR COALESCE(v_prospect.review_count, -1) >= v_min_reviews;
  v_haystack := lower(concat_ws(' ',
    v_prospect.company_name, v_prospect.industry, v_prospect.description,
    v_prospect.address, v_prospect.locality, v_prospect.region,
    v_snapshot.title, v_snapshot.description, v_snapshot.content_excerpt
  ));

  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_required_matched
  FROM unnest(v_required) term WHERE prospecting_phrase_matches(v_haystack, term);
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_required_missing
  FROM unnest(v_required) term WHERE NOT prospecting_phrase_matches(v_haystack, term);
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_preferred_matched
  FROM unnest(v_preferred) term WHERE prospecting_phrase_matches(v_haystack, term);
  SELECT COALESCE(array_agg(term ORDER BY term), '{}') INTO v_excluded_matched
  FROM unnest(v_excluded) term WHERE prospecting_phrase_matches(v_haystack, term);
  v_required_matches := cardinality(v_required_matched);
  v_preferred_matches := cardinality(v_preferred_matched);
  v_excluded_matches := cardinality(v_excluded_matched);

  IF EXISTS (
    SELECT 1 FROM unnest(v_campaign.queries) query
    WHERE prospecting_phrase_matches(v_haystack, query)
       OR to_tsvector('simple', v_haystack) @@ plainto_tsquery('simple', query)
  ) THEN v_query_score := 25; ELSE v_query_score := 10; END IF;
  IF cardinality(v_required) = 0 THEN v_query_score := v_query_score + 5;
  ELSE v_query_score := v_query_score + round(5.0 * v_required_matches / cardinality(v_required)); END IF;
  IF cardinality(v_preferred) = 0 THEN v_query_score := v_query_score + 5;
  ELSE v_query_score := v_query_score + round(5.0 * v_preferred_matches / cardinality(v_preferred)); END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_campaign.locations) location
    WHERE prospecting_phrase_matches(v_haystack, location)
  ) THEN v_location_score := 20;
  ELSIF v_prospect.locality IS NOT NULL OR v_prospect.region IS NOT NULL THEN v_location_score := 14;
  ELSE v_location_score := 5; END IF;

  IF v_rating_applicable AND v_prospect.rating IS NOT NULL THEN
    v_quality_score := v_quality_score + CASE WHEN v_rating_pass THEN 8 ELSE 3 END;
  END IF;
  IF v_reviews_applicable AND v_prospect.review_count IS NOT NULL THEN
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

  v_raw_score := v_query_score + v_location_score + v_quality_score + v_contact_score + v_completeness_score;
  v_available_max := CASE WHEN v_rating_applicable THEN 100 ELSE 85 END;
  v_score := least(100, round(100.0 * v_raw_score / v_available_max));
  IF v_excluded_matches > 0 THEN v_score := least(v_score, 25); END IF;
  IF v_must_have_website AND v_prospect.website_url IS NULL THEN v_score := least(v_score, 35); END IF;
  IF cardinality(v_required) > 0 AND v_required_matches < cardinality(v_required) THEN v_score := least(v_score, 49); END IF;
  IF NOT v_rating_pass OR NOT v_reviews_pass THEN v_score := least(v_score, 49); END IF;
  v_band := CASE WHEN v_score >= 75 THEN 'strong' WHEN v_score >= 50 THEN 'possible' ELSE 'weak' END;

  UPDATE prospecting_campaign_leads SET
    fit_score = v_score,
    fit_band = v_band,
    score_version = 'prospecting-fit-v3',
    scored_at = clock_timestamp(),
    fit_breakdown = jsonb_build_object(
      'dimensions', jsonb_build_object(
        'relevance', jsonb_build_object('score', v_query_score, 'maximum', 35),
        'location', jsonb_build_object('score', v_location_score, 'maximum', 20),
        'businessProof', jsonb_build_object('score', v_quality_score, 'maximum', CASE WHEN v_rating_applicable THEN 15 ELSE 0 END),
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
        'minimumRatingApplicable', v_rating_applicable,
        'minimumRatingMet', v_rating_pass,
        'minimumReviews', v_min_reviews,
        'reviewsObserved', v_prospect.review_count,
        'minimumReviewsApplicable', v_reviews_applicable,
        'minimumReviewsMet', v_reviews_pass,
        'mustHaveWebsite', v_must_have_website,
        'hasWebsite', v_prospect.website_url IS NOT NULL
      ),
      'coverage', jsonb_build_object(
        'source', v_campaign.source,
        'availableMaximum', v_available_max,
        'normalizedForAvailableEvidence', NOT v_rating_applicable
      ),
      'explanation', CASE
        WHEN v_excluded_matches > 0 THEN 'Excluded terms were found.'
        WHEN cardinality(v_required_missing) > 0 THEN 'One or more required terms were not found.'
        WHEN NOT v_rating_pass THEN 'The minimum rating was not met or could not be verified.'
        WHEN NOT v_reviews_pass THEN 'The minimum review count was not met or could not be verified.'
        WHEN v_must_have_website AND v_prospect.website_url IS NULL THEN 'A website is required but was not found.'
        WHEN v_score >= 75 THEN 'Strong match across the campaign criteria and the evidence available from this source.'
        WHEN v_score >= 50 THEN 'Possible match; enrichment or manual review may confirm the fit.'
        ELSE 'Limited evidence of fit from the currently available information.'
      END
    )
  WHERE id = v_lead.id RETURNING * INTO v_lead;
  RETURN NEXT v_lead;
END;
$$;

REVOKE ALL ON FUNCTION prospecting_phrase_matches(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prospecting_phrase_matches(TEXT, TEXT) TO service_role;

DO $$
DECLARE v_lead RECORD;
BEGIN
  FOR v_lead IN SELECT id, client_id FROM prospecting_campaign_leads LOOP
    PERFORM refresh_prospecting_lead_score(v_lead.id, v_lead.client_id);
  END LOOP;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('20260803000306_prospecting_source_aware_scoring.sql')
ON CONFLICT (version) DO NOTHING;
