-- ============================================================
-- 096_competitor_ingestion_reliability.sql
-- Durable, bounded and tenant-budgeted competitor collection.
-- ============================================================

ALTER TABLE competitor_sources
  DROP CONSTRAINT IF EXISTS competitor_sources_status_check;
ALTER TABLE competitor_sources
  ADD CONSTRAINT competitor_sources_status_check
  CHECK (status IN ('active', 'paused', 'retrying', 'error', 'connector_required'));
ALTER TABLE competitor_sources
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0);

DROP INDEX IF EXISTS competitor_sources_due_idx;
CREATE INDEX competitor_sources_due_idx
  ON competitor_sources (next_refresh_at)
  WHERE status IN ('active', 'retrying') AND next_refresh_at IS NOT NULL;

ALTER TABLE competitor_crawl_jobs
  DROP CONSTRAINT IF EXISTS competitor_crawl_jobs_status_check;
ALTER TABLE competitor_crawl_jobs
  ADD CONSTRAINT competitor_crawl_jobs_status_check
  CHECK (status IN ('queued', 'crawling', 'ingesting', 'done', 'error', 'cancelled'));
ALTER TABLE competitor_crawl_jobs
  ADD COLUMN IF NOT EXISTS generation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS next_result_url TEXT,
  ADD COLUMN IF NOT EXISTS provider_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

ALTER TABLE competitor_content_items
  ADD COLUMN IF NOT EXISTS last_seen_generation UUID;

CREATE TABLE IF NOT EXISTS competitor_crawl_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES competitor_crawl_jobs(id) ON DELETE CASCADE,
  source_id UUID NOT NULL,
  competitor_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, provider_url),
  FOREIGN KEY (source_id, competitor_id, client_id)
    REFERENCES competitor_sources(id, competitor_id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS competitor_crawl_pages_pending_idx
  ON competitor_crawl_pages (job_id, created_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS competitor_crawl_usage (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  crawls_started INT NOT NULL DEFAULT 0 CHECK (crawls_started >= 0),
  pages_reserved INT NOT NULL DEFAULT 0 CHECK (pages_reserved >= 0),
  pages_captured INT NOT NULL DEFAULT 0 CHECK (pages_captured >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, usage_date)
);

ALTER TABLE competitor_crawl_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_crawl_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitor_crawl_usage_tenant_select
  ON competitor_crawl_usage FOR SELECT
  USING (
    client_id = current_user_client_id()
    OR current_user_role() = 'super_admin'
  );

CREATE OR REPLACE FUNCTION create_competitor_crawl_job(
  p_source_id UUID,
  p_competitor_id UUID,
  p_client_id UUID,
  p_created_by UUID,
  p_pages_requested INT,
  p_daily_crawl_limit INT DEFAULT 20,
  p_daily_page_limit INT DEFAULT 500
)
RETURNS SETOF competitor_crawl_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usage competitor_crawl_usage%ROWTYPE;
BEGIN
  IF p_pages_requested < 1 OR p_pages_requested > 100 THEN
    RAISE EXCEPTION 'Invalid page budget.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO competitor_crawl_usage (client_id, usage_date)
  VALUES (p_client_id, CURRENT_DATE)
  ON CONFLICT (client_id, usage_date) DO NOTHING;

  SELECT * INTO v_usage
  FROM competitor_crawl_usage
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE
  FOR UPDATE;

  IF v_usage.crawls_started + 1 > greatest(1, p_daily_crawl_limit)
     OR v_usage.pages_reserved + p_pages_requested > greatest(1, p_daily_page_limit) THEN
    RAISE EXCEPTION 'Daily competitor collection budget reached.'
      USING ERRCODE = 'P0001', HINT = 'Try again after the daily budget resets.';
  END IF;

  UPDATE competitor_crawl_usage
  SET
    crawls_started = crawls_started + 1,
    pages_reserved = pages_reserved + p_pages_requested,
    updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE;

  RETURN QUERY
  INSERT INTO competitor_crawl_jobs (
    source_id, competitor_id, client_id, status, created_by
  ) VALUES (
    p_source_id, p_competitor_id, p_client_id, 'queued', p_created_by
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION stage_competitor_crawl_pages(
  p_job_id UUID,
  p_lease_token UUID,
  p_pages JSONB,
  p_next_result_url TEXT,
  p_provider_complete BOOLEAN,
  p_pages_discovered INT
)
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job competitor_crawl_jobs%ROWTYPE;
  v_inserted INT := 0;
BEGIN
  SELECT * INTO v_job
  FROM competitor_crawl_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO competitor_crawl_pages (
    job_id, source_id, competitor_id, client_id, provider_url, payload
  )
  SELECT
    v_job.id, v_job.source_id, v_job.competitor_id, v_job.client_id,
    left(coalesce(
      page->'metadata'->>'canonicalUrl',
      page->'metadata'->>'sourceURL',
      page->'metadata'->>'url',
      'urn:firecrawl:' || md5(page::text)
    ), 4000),
    page
  FROM jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) page
  ON CONFLICT (job_id, provider_url) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE competitor_crawl_jobs
  SET
    status = CASE WHEN p_provider_complete THEN 'ingesting' ELSE 'crawling' END,
    next_result_url = nullif(p_next_result_url, ''),
    provider_complete = coalesce(p_provider_complete, false),
    pages_discovered = greatest(pages_discovered, coalesce(p_pages_discovered, 0))
  WHERE id = v_job.id;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION commit_competitor_crawl_page(
  p_job_id UUID,
  p_lease_token UUID,
  p_page_id UUID,
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
  v_job competitor_crawl_jobs%ROWTYPE;
  v_page competitor_crawl_pages%ROWTYPE;
  v_item_id UUID;
BEGIN
  SELECT * INTO v_job
  FROM competitor_crawl_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_page
  FROM competitor_crawl_pages
  WHERE id = p_page_id
    AND job_id = v_job.id
    AND client_id = v_job.client_id
    AND processed_at IS NULL
  FOR UPDATE;
  IF v_page.id IS NULL THEN
    RAISE EXCEPTION 'Captured page is unavailable.' USING ERRCODE = 'P0001';
  END IF;

  v_item_id := upsert_competitor_content_item(
    v_job.source_id, v_job.competitor_id, v_job.client_id,
    p_canonical_url, p_platform, p_content_type, p_title, p_raw_content,
    p_author, p_published_at, p_content_hash, p_metadata
  );

  UPDATE competitor_content_items
  SET last_seen_generation = v_job.generation_id, is_removed = false
  WHERE id = v_item_id
    AND source_id = v_job.source_id
    AND client_id = v_job.client_id;

  UPDATE competitor_crawl_pages
  SET processed_at = clock_timestamp()
  WHERE id = v_page.id;

  UPDATE competitor_crawl_jobs
  SET items_captured = items_captured + 1
  WHERE id = v_job.id;

  UPDATE competitor_crawl_usage
  SET pages_captured = pages_captured + 1, updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = CURRENT_DATE;

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_competitor_crawl_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_authoritative BOOLEAN,
  p_next_refresh_at TIMESTAMPTZ
)
RETURNS SETOF competitor_crawl_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_job competitor_crawl_jobs%ROWTYPE;
  v_count INT;
BEGIN
  SELECT * INTO v_job
  FROM competitor_crawl_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Collection lease expired.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM competitor_crawl_pages
    WHERE job_id = v_job.id AND processed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Captured pages are still pending.' USING ERRCODE = 'P0001';
  END IF;

  IF p_authoritative THEN
    UPDATE competitor_content_items
    SET is_removed = true, captured_at = clock_timestamp()
    WHERE source_id = v_job.source_id
      AND client_id = v_job.client_id
      AND is_removed = false
      AND last_seen_generation IS DISTINCT FROM v_job.generation_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM competitor_content_items
  WHERE source_id = v_job.source_id
    AND client_id = v_job.client_id
    AND is_removed = false;

  UPDATE competitor_sources
  SET
    status = 'active',
    content_count = v_count,
    last_crawled_at = clock_timestamp(),
    last_success_at = clock_timestamp(),
    next_refresh_at = p_next_refresh_at,
    last_error = NULL,
    failure_count = 0
  WHERE id = v_job.source_id AND client_id = v_job.client_id;

  RETURN QUERY
  UPDATE competitor_crawl_jobs
  SET
    status = 'done',
    lease_token = NULL,
    lease_until = NULL,
    completed_at = clock_timestamp(),
    error_message = NULL
  WHERE id = v_job.id
  RETURNING *;
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
    pages_discovered = greatest(pages_discovered, greatest(0, coalesce(p_pages_discovered, 0))),
    items_captured = greatest(items_captured, greatest(0, coalesce(p_items_captured, 0))),
    error_message = p_error_message,
    meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta, '{}'::jsonb),
    lease_token = NULL,
    lease_until = NULL,
    completed_at = CASE WHEN p_status IN ('done', 'error', 'cancelled') THEN clock_timestamp() ELSE NULL END
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND p_status IN ('queued', 'crawling', 'ingesting', 'done', 'error', 'cancelled')
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION create_competitor_crawl_job(UUID, UUID, UUID, UUID, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION stage_competitor_crawl_pages(UUID, UUID, JSONB, TEXT, BOOLEAN, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION commit_competitor_crawl_page(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finalize_competitor_crawl_job(UUID, UUID, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_competitor_crawl_job(UUID, UUID, UUID, UUID, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION stage_competitor_crawl_pages(UUID, UUID, JSONB, TEXT, BOOLEAN, INT) TO service_role;
GRANT EXECUTE ON FUNCTION commit_competitor_crawl_page(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_competitor_crawl_job(UUID, UUID, BOOLEAN, TIMESTAMPTZ) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('096_competitor_ingestion_reliability.sql')
ON CONFLICT DO NOTHING;
