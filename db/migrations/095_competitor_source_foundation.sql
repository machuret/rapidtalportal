-- ============================================================
-- 095_competitor_source_foundation.sql – competitor intelligence Phase 1
--
-- Competitor material is deliberately isolated from the Vault. It is public
-- market context, never evidence for claims about the client.
-- ============================================================

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description TEXT,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  refresh_cadence TEXT NOT NULL DEFAULT 'manual'
    CHECK (refresh_cadence IN ('manual', 'daily', 'weekly', 'monthly')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, client_id)
);

CREATE INDEX IF NOT EXISTS competitors_client_idx
  ON competitors (client_id, status, name);

CREATE TABLE IF NOT EXISTS competitor_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN (
      'website', 'blog', 'page', 'sitemap', 'rss',
      'newsletter_archive', 'youtube', 'social_profile', 'other'
    )),
  platform TEXT NOT NULL DEFAULT 'web'
    CHECK (platform IN (
      'web', 'rss', 'newsletter', 'youtube',
      'linkedin', 'facebook', 'instagram', 'x', 'other'
    )),
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  crawl_scope TEXT NOT NULL
    CHECK (crawl_scope IN ('exact', 'path', 'domain', 'sitemap', 'feed', 'profile')),
  path_prefix TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error', 'connector_required')),
  refresh_cadence TEXT
    CHECK (refresh_cadence IS NULL OR refresh_cadence IN ('manual', 'daily', 'weekly', 'monthly')),
  max_pages INT NOT NULL DEFAULT 30 CHECK (max_pages BETWEEN 1 AND 100),
  content_count INT NOT NULL DEFAULT 0 CHECK (content_count >= 0),
  last_crawled_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  next_refresh_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competitor_id, normalized_url),
  UNIQUE (id, competitor_id, client_id),
  FOREIGN KEY (competitor_id, client_id)
    REFERENCES competitors(id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS competitor_sources_client_idx
  ON competitor_sources (client_id, competitor_id, status);
CREATE INDEX IF NOT EXISTS competitor_sources_due_idx
  ON competitor_sources (next_refresh_at)
  WHERE status = 'active' AND next_refresh_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS competitor_crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  competitor_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'crawling', 'ingesting', 'done', 'error')),
  provider TEXT NOT NULL DEFAULT 'firecrawl',
  provider_job_id TEXT,
  pages_discovered INT NOT NULL DEFAULT 0 CHECK (pages_discovered >= 0),
  items_captured INT NOT NULL DEFAULT 0 CHECK (items_captured >= 0),
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (source_id, competitor_id, client_id)
    REFERENCES competitor_sources(id, competitor_id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS competitor_crawl_jobs_source_idx
  ON competitor_crawl_jobs (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS competitor_crawl_jobs_client_idx
  ON competitor_crawl_jobs (client_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS competitor_crawl_jobs_one_active_source
  ON competitor_crawl_jobs (source_id)
  WHERE status IN ('queued', 'crawling', 'ingesting');

CREATE TABLE IF NOT EXISTS competitor_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  competitor_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  content_type TEXT NOT NULL DEFAULT 'page',
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_removed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (source_id, canonical_url),
  UNIQUE (id, source_id, competitor_id, client_id),
  FOREIGN KEY (source_id, competitor_id, client_id)
    REFERENCES competitor_sources(id, competitor_id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS competitor_content_items_client_idx
  ON competitor_content_items (client_id, competitor_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS competitor_content_items_hash_idx
  ON competitor_content_items (client_id, content_hash);

CREATE TABLE IF NOT EXISTS competitor_capture_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  source_id UUID NOT NULL,
  competitor_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id, source_id, competitor_id, client_id)
    REFERENCES competitor_content_items(id, source_id, competitor_id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS competitor_capture_versions_item_idx
  ON competitor_capture_versions (item_id, captured_at DESC);

DROP TRIGGER IF EXISTS competitors_updated_at ON competitors;
CREATE TRIGGER competitors_updated_at
BEFORE UPDATE ON competitors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS competitor_sources_updated_at ON competitor_sources;
CREATE TRIGGER competitor_sources_updated_at
BEFORE UPDATE ON competitor_sources
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS competitor_crawl_jobs_updated_at ON competitor_crawl_jobs;
CREATE TRIGGER competitor_crawl_jobs_updated_at
BEFORE UPDATE ON competitor_crawl_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_capture_versions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'competitors',
    'competitor_sources',
    'competitor_crawl_jobs',
    'competitor_content_items',
    'competitor_capture_versions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_super_admin_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (current_user_role() = ''super_admin'') WITH CHECK (current_user_role() = ''super_admin'')',
      table_name || '_super_admin_all',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_select', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (client_id = current_user_client_id())',
      table_name || '_tenant_select',
      table_name
    );
  END LOOP;
END $$;

-- Only client admins manage competitor configuration through user-scoped DB
-- clients. Crawl workers use service_role and are still tenant-qualified in
-- every application query.
DROP POLICY IF EXISTS competitors_client_admin_write ON competitors;
CREATE POLICY competitors_client_admin_write
  ON competitors FOR ALL
  USING (
    current_user_role() = 'client_admin'
    AND client_id = current_user_client_id()
  )
  WITH CHECK (
    current_user_role() = 'client_admin'
    AND client_id = current_user_client_id()
  );

DROP POLICY IF EXISTS competitor_sources_client_admin_write ON competitor_sources;
CREATE POLICY competitor_sources_client_admin_write
  ON competitor_sources FOR ALL
  USING (
    current_user_role() = 'client_admin'
    AND client_id = current_user_client_id()
  )
  WITH CHECK (
    current_user_role() = 'client_admin'
    AND client_id = current_user_client_id()
  );

CREATE OR REPLACE FUNCTION claim_competitor_crawl_job(
  p_job_id UUID,
  p_lease_seconds INT DEFAULT 90
)
RETURNS SETOF competitor_crawl_jobs
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  UPDATE competitor_crawl_jobs
  SET
    lease_token = gen_random_uuid(),
    lease_until = clock_timestamp() + make_interval(
      secs => greatest(15, least(coalesce(p_lease_seconds, 90), 300))
    )
  WHERE id = p_job_id
    AND status IN ('queued', 'crawling', 'ingesting')
    AND (lease_until IS NULL OR lease_until <= clock_timestamp())
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION create_competitor_with_source(
  p_client_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_website_url TEXT,
  p_refresh_cadence TEXT,
  p_source_type TEXT,
  p_platform TEXT,
  p_normalized_url TEXT,
  p_crawl_scope TEXT,
  p_path_prefix TEXT,
  p_source_status TEXT,
  p_max_pages INT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_competitor_id UUID;
BEGIN
  INSERT INTO competitors (
    client_id, name, description, website_url, refresh_cadence, created_by
  ) VALUES (
    p_client_id,
    p_name,
    nullif(p_description, ''),
    nullif(p_website_url, ''),
    p_refresh_cadence,
    p_actor_id
  )
  RETURNING id INTO v_competitor_id;

  IF nullif(p_normalized_url, '') IS NOT NULL THEN
    INSERT INTO competitor_sources (
      competitor_id, client_id, source_type, platform, url, normalized_url,
      crawl_scope, path_prefix, status, max_pages, created_by,
      next_refresh_at
    ) VALUES (
      v_competitor_id, p_client_id, p_source_type, p_platform,
      p_normalized_url, p_normalized_url, p_crawl_scope, p_path_prefix,
      p_source_status, p_max_pages, p_actor_id,
      CASE
        WHEN p_refresh_cadence = 'daily' THEN clock_timestamp()
        WHEN p_refresh_cadence = 'weekly' THEN clock_timestamp()
        WHEN p_refresh_cadence = 'monthly' THEN clock_timestamp()
        ELSE NULL
      END
    );
  END IF;

  RETURN v_competitor_id;
END;
$$;

CREATE OR REPLACE FUNCTION checkpoint_competitor_crawl_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_status TEXT,
  p_pages_discovered INT DEFAULT 0,
  p_items_captured INT DEFAULT 0,
  p_error_message TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS SETOF competitor_crawl_jobs
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  UPDATE competitor_crawl_jobs
  SET
    status = p_status,
    pages_discovered = greatest(0, coalesce(p_pages_discovered, 0)),
    items_captured = greatest(0, coalesce(p_items_captured, 0)),
    error_message = p_error_message,
    meta = coalesce(p_meta, '{}'::jsonb),
    lease_token = NULL,
    lease_until = NULL,
    completed_at = CASE WHEN p_status IN ('done', 'error') THEN clock_timestamp() ELSE NULL END
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND p_status IN ('queued', 'crawling', 'ingesting', 'done', 'error')
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION upsert_competitor_content_item(
  p_source_id UUID,
  p_competitor_id UUID,
  p_client_id UUID,
  p_canonical_url TEXT,
  p_platform TEXT,
  p_content_type TEXT,
  p_title TEXT,
  p_raw_content TEXT,
  p_author TEXT,
  p_published_at TIMESTAMPTZ,
  p_content_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_item competitor_content_items%ROWTYPE;
  v_changed BOOLEAN := false;
BEGIN
  SELECT * INTO v_item
  FROM competitor_content_items
  WHERE source_id = p_source_id AND canonical_url = p_canonical_url
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    INSERT INTO competitor_content_items (
      source_id, competitor_id, client_id, canonical_url, platform,
      content_type, title, raw_content, author, published_at,
      content_hash, metadata
    ) VALUES (
      p_source_id, p_competitor_id, p_client_id, p_canonical_url, p_platform,
      p_content_type, p_title, p_raw_content, p_author, p_published_at,
      p_content_hash, coalesce(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_item;
    v_changed := true;
  ELSIF v_item.content_hash IS DISTINCT FROM p_content_hash THEN
    UPDATE competitor_content_items
    SET
      platform = p_platform,
      content_type = p_content_type,
      title = p_title,
      raw_content = p_raw_content,
      author = p_author,
      published_at = p_published_at,
      content_hash = p_content_hash,
      metadata = coalesce(p_metadata, '{}'::jsonb),
      last_seen_at = clock_timestamp(),
      captured_at = clock_timestamp(),
      is_removed = false
    WHERE id = v_item.id
    RETURNING * INTO v_item;
    v_changed := true;
  ELSE
    UPDATE competitor_content_items
    SET last_seen_at = clock_timestamp(), is_removed = false
    WHERE id = v_item.id;
  END IF;

  IF v_changed THEN
    INSERT INTO competitor_capture_versions (
      item_id, source_id, competitor_id, client_id, content_hash, raw_content
    ) VALUES (
      v_item.id, p_source_id, p_competitor_id, p_client_id, p_content_hash, p_raw_content
    );
  END IF;

  RETURN v_item.id;
END;
$$;

REVOKE ALL ON FUNCTION claim_competitor_crawl_job(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_competitor_with_source(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION checkpoint_competitor_crawl_job(UUID, UUID, TEXT, INT, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION upsert_competitor_content_item(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_competitor_crawl_job(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION create_competitor_with_source(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION checkpoint_competitor_crawl_job(UUID, UUID, TEXT, INT, INT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_competitor_content_item(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('095_competitor_source_foundation.sql')
ON CONFLICT DO NOTHING;
