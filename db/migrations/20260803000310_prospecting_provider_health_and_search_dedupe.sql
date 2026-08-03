-- Lead Generation provider health, atomic duplicate-search prevention and
-- storage bounds. Provider checks are global operational metadata; campaign
-- and lead data remain tenant scoped.

CREATE TABLE IF NOT EXISTS prospecting_provider_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN (
    'google_maps','google_search','linkedin_profiles','website_enrichment'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','running','passed','warning','failed'
  )),
  actor_id TEXT NOT NULL,
  actor_provider_id TEXT NOT NULL,
  actor_build_requested TEXT NOT NULL,
  actor_build_id TEXT,
  actor_run_id TEXT,
  actor_dataset_id TEXT,
  input_hash TEXT NOT NULL CHECK (char_length(input_hash) = 64),
  requested_results INT NOT NULL DEFAULT 1 CHECK (requested_results BETWEEN 1 AND 5),
  usable_results INT CHECK (usable_results BETWEEN 0 AND 5),
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >= 0),
  usage_total_usd NUMERIC(10,4) CHECK (usage_total_usd IS NULL OR usage_total_usd >= 0),
  provider_status TEXT,
  diagnostic TEXT CHECK (diagnostic IS NULL OR char_length(diagnostic) <= 1000),
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS prospecting_provider_checks_latest_idx
  ON prospecting_provider_checks (provider, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS prospecting_provider_checks_one_active
  ON prospecting_provider_checks (provider)
  WHERE status IN ('queued','running');

DROP TRIGGER IF EXISTS prospecting_provider_checks_updated_at ON prospecting_provider_checks;
CREATE TRIGGER prospecting_provider_checks_updated_at
BEFORE UPDATE ON prospecting_provider_checks
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE prospecting_provider_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospecting_provider_checks_super_admin_all ON prospecting_provider_checks;
CREATE POLICY prospecting_provider_checks_super_admin_all ON prospecting_provider_checks
FOR ALL USING (current_user_role() = 'super_admin')
WITH CHECK (current_user_role() = 'super_admin');

-- Exact duplicate campaign definitions are blocked atomically. An archived
-- campaign may be recreated; an active one must be opened and run again.
ALTER TABLE prospecting_campaigns ADD COLUMN IF NOT EXISTS search_fingerprint TEXT;
ALTER TABLE prospecting_campaigns DROP CONSTRAINT IF EXISTS prospecting_campaigns_search_fingerprint_check;
ALTER TABLE prospecting_campaigns ADD CONSTRAINT prospecting_campaigns_search_fingerprint_check
  CHECK (search_fingerprint IS NULL OR char_length(search_fingerprint) = 64);

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
      'language', lower(trim(COALESCE(p_language_code, ''))),
      'maxResults', p_max_results
    )::TEXT,
    'UTF8'
  ), 'sha256'), 'hex')
$$;

WITH ranked AS (
  SELECT id,
    prospecting_search_fingerprint(source, queries, locations, country_code, language_code, max_results) AS fingerprint,
    row_number() OVER (
      PARTITION BY client_id,
        prospecting_search_fingerprint(source, queries, locations, country_code, language_code, max_results)
      ORDER BY updated_at DESC, id DESC
    ) AS duplicate_rank
  FROM prospecting_campaigns
  WHERE archived_at IS NULL
)
UPDATE prospecting_campaigns c
SET search_fingerprint = CASE WHEN ranked.duplicate_rank = 1 THEN ranked.fingerprint ELSE NULL END
FROM ranked WHERE ranked.id = c.id;

CREATE UNIQUE INDEX IF NOT EXISTS prospecting_campaigns_active_search_unique
  ON prospecting_campaigns (client_id, search_fingerprint)
  WHERE archived_at IS NULL AND search_fingerprint IS NOT NULL;

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
    IF v_existing.search_fingerprint IS NULL THEN
      UPDATE prospecting_campaigns SET search_fingerprint = v_fingerprint WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;
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

-- Bound future provider payload storage even if a caller bypasses the current
-- application truncation. NOT VALID avoids rewriting legacy rows immediately,
-- while still enforcing the constraint for every new or changed row.
ALTER TABLE prospecting_prospects DROP CONSTRAINT IF EXISTS prospecting_prospects_raw_payload_size;
ALTER TABLE prospecting_prospects ADD CONSTRAINT prospecting_prospects_raw_payload_size
  CHECK (octet_length(raw_payload::TEXT) <= 30000) NOT VALID;
ALTER TABLE prospecting_discovery_captures DROP CONSTRAINT IF EXISTS prospecting_capture_raw_payload_size;
ALTER TABLE prospecting_discovery_captures ADD CONSTRAINT prospecting_capture_raw_payload_size
  CHECK (octet_length(raw_payload::TEXT) <= 30000) NOT VALID;
ALTER TABLE prospecting_discovery_captures DROP CONSTRAINT IF EXISTS prospecting_capture_normalized_payload_size;
ALTER TABLE prospecting_discovery_captures ADD CONSTRAINT prospecting_capture_normalized_payload_size
  CHECK (octet_length(normalized_payload::TEXT) <= 50000) NOT VALID;

CREATE OR REPLACE FUNCTION cap_prospecting_merge_evidence()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT COALESCE(jsonb_agg(value ORDER BY first_seen), '[]'::jsonb) INTO NEW.evidence
  FROM (
    SELECT value, min(ordinality) AS first_seen
    FROM jsonb_array_elements(COALESCE(NEW.evidence, '[]'::jsonb)) WITH ORDINALITY item(value, ordinality)
    GROUP BY value
    ORDER BY min(ordinality)
    LIMIT 20
  ) bounded;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prospecting_merge_evidence_cap ON prospecting_merge_suggestions;
CREATE TRIGGER prospecting_merge_evidence_cap
BEFORE INSERT OR UPDATE OF evidence ON prospecting_merge_suggestions
FOR EACH ROW EXECUTE FUNCTION cap_prospecting_merge_evidence();

UPDATE prospecting_merge_suggestions SET evidence = evidence;
ALTER TABLE prospecting_merge_suggestions DROP CONSTRAINT IF EXISTS prospecting_merge_evidence_size;
ALTER TABLE prospecting_merge_suggestions ADD CONSTRAINT prospecting_merge_evidence_size
  CHECK (jsonb_array_length(evidence) <= 20);

INSERT INTO schema_migrations (version)
VALUES ('20260803000310_prospecting_provider_health_and_search_dedupe.sql')
ON CONFLICT (version) DO NOTHING;
