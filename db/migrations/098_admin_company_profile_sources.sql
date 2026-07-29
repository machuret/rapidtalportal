-- ============================================================
-- 098_admin_company_profile_sources.sql
-- Structured admin-maintained company identity and style-only Vault sources.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS company_description TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(social_links) = 'object');

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS origin_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_role TEXT NOT NULL DEFAULT 'factual'
    CHECK (evidence_role IN ('factual', 'style_example', 'market_context'));

CREATE UNIQUE INDEX IF NOT EXISTS vault_items_client_origin_key_unique
  ON vault_items (client_id, origin_key);
CREATE INDEX IF NOT EXISTS vault_items_evidence_role_idx
  ON vault_items (client_id, evidence_role, status);

CREATE OR REPLACE FUNCTION sync_admin_company_profile(
  p_client_id UUID,
  p_actor_id UUID,
  p_company_name TEXT,
  p_company_description TEXT,
  p_website TEXT,
  p_address TEXT,
  p_location TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_founders TEXT,
  p_client_type TEXT,
  p_services TEXT,
  p_target_demographic TEXT,
  p_social_links JSONB
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_item_id UUID;
  v_social_text TEXT;
  v_content TEXT;
  v_social_links JSONB := coalesce(p_social_links, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_social_links) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Social links must be an object.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO company_dna (
    client_id, company_name, company_description, website, address, location,
    phone, email, founders, client_type, services, target_demographic,
    social_links, updated_at
  ) VALUES (
    p_client_id, nullif(btrim(p_company_name), ''),
    nullif(btrim(p_company_description), ''), nullif(btrim(p_website), ''),
    nullif(btrim(p_address), ''), nullif(btrim(p_location), ''),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    nullif(btrim(p_founders), ''), nullif(btrim(p_client_type), ''),
    nullif(btrim(p_services), ''), nullif(btrim(p_target_demographic), ''),
    v_social_links, clock_timestamp()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    company_description = EXCLUDED.company_description,
    website = EXCLUDED.website,
    address = EXCLUDED.address,
    location = EXCLUDED.location,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    founders = EXCLUDED.founders,
    client_type = EXCLUDED.client_type,
    services = EXCLUDED.services,
    target_demographic = EXCLUDED.target_demographic,
    social_links = EXCLUDED.social_links,
    updated_at = clock_timestamp();

  SELECT string_agg(initcap(replace(key, '_', ' ')) || ': ' || value, E'\n' ORDER BY key)
  INTO v_social_text
  FROM jsonb_each_text(v_social_links)
  WHERE nullif(btrim(value), '') IS NOT NULL;

  v_content := concat_ws(E'\n',
    nullif('Company name: ' || coalesce(nullif(btrim(p_company_name), ''), ''), 'Company name: '),
    nullif('Description: ' || coalesce(nullif(btrim(p_company_description), ''), ''), 'Description: '),
    nullif('Website: ' || coalesce(nullif(btrim(p_website), ''), ''), 'Website: '),
    nullif('Address: ' || coalesce(nullif(btrim(p_address), ''), ''), 'Address: '),
    nullif('Location / service area: ' || coalesce(nullif(btrim(p_location), ''), ''), 'Location / service area: '),
    nullif('Phone: ' || coalesce(nullif(btrim(p_phone), ''), ''), 'Phone: '),
    nullif('Email: ' || coalesce(nullif(btrim(p_email), ''), ''), 'Email: '),
    nullif('Founders: ' || coalesce(nullif(btrim(p_founders), ''), ''), 'Founders: '),
    nullif('Company type / industry: ' || coalesce(nullif(btrim(p_client_type), ''), ''), 'Company type / industry: '),
    nullif('Services: ' || coalesce(nullif(btrim(p_services), ''), ''), 'Services: '),
    nullif('Target audience: ' || coalesce(nullif(btrim(p_target_demographic), ''), ''), 'Target audience: '),
    nullif(v_social_text, '')
  );

  IF char_length(btrim(v_content)) < 10 THEN
    RAISE EXCEPTION 'Add at least one company profile field.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO vault_items (
    client_id, source_type, title, source_url, raw_content, status,
    created_by, updated_by, category, tags, meta_curated, content_hash,
    origin_key, evidence_role, indexed_at, index_error
  ) VALUES (
    p_client_id, 'text',
    coalesce(nullif(btrim(p_company_name), ''), 'Company') || ' — Admin company profile',
    nullif(btrim(p_website), ''), v_content, 'processing',
    p_actor_id, p_actor_id, 'contact',
    ARRAY['company_profile', 'company_dna', 'admin_curated']::TEXT[],
    true, NULL,
    'admin_company_profile', 'factual', NULL, NULL
  )
  ON CONFLICT (client_id, origin_key) DO UPDATE SET
    title = EXCLUDED.title,
    source_url = EXCLUDED.source_url,
    raw_content = EXCLUDED.raw_content,
    status = 'processing',
    error_message = NULL,
    updated_at = clock_timestamp(),
    updated_by = EXCLUDED.updated_by,
    category = EXCLUDED.category,
    tags = EXCLUDED.tags,
    meta_curated = true,
    content_hash = EXCLUDED.content_hash,
    evidence_role = 'factual',
    indexed_at = NULL,
    index_error = NULL
  RETURNING id INTO v_item_id;

  DELETE FROM vault_chunks WHERE item_id = v_item_id;
  RETURN v_item_id;
END;
$$;

-- Factual retrieval excludes channel-style examples. Content generation loads
-- those through a separate, explicitly labelled style-only path.
CREATE OR REPLACE FUNCTION match_vault_chunks(
  p_client_id UUID,
  p_query_embedding VECTOR(384),
  p_match_count INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    vc.id,
    vc.item_id,
    vc.content,
    vc.chunk_index,
    1 - (vc.embedding <=> p_query_embedding) AS similarity
  FROM vault_chunks vc
  JOIN vault_items vi
    ON vi.id = vc.item_id
   AND vi.client_id = vc.client_id
  WHERE vc.client_id = p_client_id
    AND vc.embedding IS NOT NULL
    AND vi.status = 'ready'
    AND vi.evidence_role = 'factual'
  ORDER BY vc.embedding <=> p_query_embedding
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 50));
$$;

REVOKE ALL ON FUNCTION sync_admin_company_profile(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_admin_company_profile(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION match_vault_chunks(UUID, VECTOR, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION match_vault_chunks(UUID, VECTOR, INT) TO authenticated, service_role;

INSERT INTO schema_migrations (version)
VALUES ('098_admin_company_profile_sources.sql')
ON CONFLICT DO NOTHING;
