-- ============================================================
-- 085_crawl_job_leases.sql – atomic, tokenized crawl worker leases
--
-- A timestamp compare is not a worker lock: once the first request updates the
-- timestamp, another request can immediately claim the same job. Give each
-- worker an expiring token and require that token for its checkpoint.
-- ============================================================

ALTER TABLE crawl_jobs
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crawl_jobs_lease_idx
  ON crawl_jobs (lease_until)
  WHERE status IN ('crawling', 'ingesting', 'synthesizing');

CREATE OR REPLACE FUNCTION claim_crawl_job(
  p_job_id UUID,
  p_lease_seconds INT DEFAULT 90
)
RETURNS SETOF crawl_jobs
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  UPDATE crawl_jobs
  SET
    lease_token = gen_random_uuid(),
    lease_until = clock_timestamp() + make_interval(
      secs => greatest(15, least(coalesce(p_lease_seconds, 90), 300))
    ),
    updated_at = clock_timestamp()
  WHERE id = p_job_id
    AND status IN ('crawling', 'ingesting', 'synthesizing')
    AND (lease_until IS NULL OR lease_until <= clock_timestamp())
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION claim_crawl_job(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_crawl_job(UUID, INT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('085_crawl_job_leases.sql')
ON CONFLICT DO NOTHING;
