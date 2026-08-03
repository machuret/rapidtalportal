-- Treat one source/query/location combination as one reusable search campaign.
-- Changing only the requested result limit must not create a second campaign.

DROP INDEX IF EXISTS prospecting_campaigns_active_search_unique;

CREATE OR REPLACE FUNCTION prospecting_search_fingerprint(
  p_source TEXT,
  p_queries TEXT[],
  p_locations TEXT[],
  p_country_code TEXT,
  p_language_code TEXT,
  p_max_results INT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(convert_to(
    jsonb_build_object(
      'source', lower(trim(COALESCE(p_source, ''))),
      'queries', COALESCE((
        SELECT jsonb_agg(normalized ORDER BY normalized)
        FROM (
          SELECT DISTINCT lower(regexp_replace(trim(value), '\s+', ' ', 'g')) AS normalized
          FROM unnest(COALESCE(p_queries, ARRAY[]::TEXT[])) value
        ) q WHERE normalized <> ''
      ), '[]'::jsonb),
      'locations', COALESCE((
        SELECT jsonb_agg(normalized ORDER BY normalized)
        FROM (
          SELECT DISTINCT lower(regexp_replace(trim(value), '\s+', ' ', 'g')) AS normalized
          FROM unnest(COALESCE(p_locations, ARRAY[]::TEXT[])) value
        ) l WHERE normalized <> ''
      ), '[]'::jsonb),
      'country', lower(trim(COALESCE(p_country_code, ''))),
      'language', lower(trim(COALESCE(p_language_code, '')))
    )::TEXT,
    'UTF8'
  ), 'sha256'), 'hex')
$$;

WITH ranked AS (
  SELECT campaign.id,
    prospecting_search_fingerprint(
      campaign.source, campaign.queries, campaign.locations,
      campaign.country_code, campaign.language_code, campaign.max_results
    ) AS fingerprint,
    row_number() OVER (
      PARTITION BY campaign.client_id, prospecting_search_fingerprint(
        campaign.source, campaign.queries, campaign.locations,
        campaign.country_code, campaign.language_code, campaign.max_results
      )
      ORDER BY
        (SELECT count(*) FROM prospecting_campaign_leads lead WHERE lead.campaign_id = campaign.id) DESC,
        CASE campaign.status WHEN 'completed' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
        campaign.updated_at DESC,
        campaign.id DESC
    ) AS duplicate_rank
  FROM prospecting_campaigns campaign
  WHERE campaign.archived_at IS NULL
), archived AS (
  UPDATE prospecting_campaigns campaign
  SET archived_at = clock_timestamp(),
      status = 'archived',
      search_fingerprint = NULL,
      updated_at = clock_timestamp()
  FROM ranked
  WHERE ranked.id = campaign.id AND ranked.duplicate_rank > 1
  RETURNING campaign.id
)
UPDATE prospecting_campaigns campaign
SET search_fingerprint = ranked.fingerprint,
    updated_at = clock_timestamp()
FROM ranked
WHERE ranked.id = campaign.id AND ranked.duplicate_rank = 1;

CREATE UNIQUE INDEX prospecting_campaigns_active_search_unique
  ON prospecting_campaigns (client_id, search_fingerprint)
  WHERE archived_at IS NULL AND search_fingerprint IS NOT NULL;

-- Reusing the same search may safely increase its collection limit; it must
-- never reduce an existing campaign or create a parallel paid search.
CREATE OR REPLACE FUNCTION create_prospecting_campaign_once(
  p_client_id UUID,
  p_name TEXT,
  p_source TEXT,
  p_queries TEXT[],
  p_locations TEXT[],
  p_country_code TEXT,
  p_language_code TEXT,
  p_max_results INT,
  p_ideal_profile JSONB,
  p_created_by UUID
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  v_fingerprint TEXT;
  v_existing prospecting_campaigns%ROWTYPE;
  v_campaign prospecting_campaigns%ROWTYPE;
BEGIN
  IF p_source NOT IN ('google_maps','google_search')
     OR cardinality(p_queries) NOT BETWEEN 1 AND 10
     OR cardinality(p_locations) > 10
     OR p_max_results NOT BETWEEN 1 AND 100
     OR char_length(trim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 160
     OR NOT EXISTS (
       SELECT 1 FROM users
       WHERE id = p_created_by AND (role = 'super_admin' OR client_id = p_client_id)
     ) THEN
    RAISE EXCEPTION 'Invalid campaign definition.' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := prospecting_search_fingerprint(
    p_source, p_queries, p_locations, p_country_code, p_language_code, p_max_results
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::TEXT || ':' || v_fingerprint, 0));

  SELECT * INTO v_existing FROM prospecting_campaigns
  WHERE client_id = p_client_id AND archived_at IS NULL
    AND (
      search_fingerprint = v_fingerprint
      OR (
        search_fingerprint IS NULL
        AND prospecting_search_fingerprint(source, queries, locations, country_code, language_code, max_results) = v_fingerprint
      )
    )
  ORDER BY updated_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    UPDATE prospecting_campaigns
    SET search_fingerprint = v_fingerprint,
        max_results = greatest(max_results, p_max_results),
        updated_at = clock_timestamp()
    WHERE id = v_existing.id
    RETURNING * INTO v_existing;
    RETURN jsonb_build_object('campaign', to_jsonb(v_existing), 'reused', true);
  END IF;

  INSERT INTO prospecting_campaigns (
    client_id, name, source, queries, locations, country_code, language_code,
    max_results, ideal_profile, status, created_by, search_fingerprint
  ) VALUES (
    p_client_id, trim(p_name), p_source, p_queries, p_locations,
    lower(p_country_code), lower(p_language_code), p_max_results,
    COALESCE(p_ideal_profile, '{}'::jsonb), 'ready', p_created_by, v_fingerprint
  ) RETURNING * INTO v_campaign;

  RETURN jsonb_build_object('campaign', to_jsonb(v_campaign), 'reused', false);
END $$;

REVOKE ALL ON FUNCTION prospecting_search_fingerprint(TEXT, TEXT[], TEXT[], TEXT, TEXT, INT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_prospecting_campaign_once(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, INT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_prospecting_campaign_once(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, INT, JSONB, UUID)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000314_prospecting_search_identity.sql')
ON CONFLICT (version) DO NOTHING;
