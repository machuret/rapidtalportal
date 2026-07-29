-- Account for sitemap/feed discovery requests in the same hard tenant budget
-- as captured content pages.

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
  IF p_pages_requested < 1 OR p_pages_requested > 112 THEN
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

REVOKE ALL ON FUNCTION create_competitor_crawl_job(UUID, UUID, UUID, UUID, INT, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_competitor_crawl_job(UUID, UUID, UUID, UUID, INT, INT, INT)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('097_competitor_discovery_budget.sql')
ON CONFLICT DO NOTHING;
