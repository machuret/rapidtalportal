-- Per-client vault item tallies for /admin/health.
--
-- Previously the health page loaded the ENTIRE vault_items table (every row,
-- four columns) into the Next process and counted in JS — fine at launch, an
-- O(all items) read that grows unbounded with every client's uploads. This does
-- the same tally with a single grouped scan in Postgres and returns one small
-- row per client. SECURITY DEFINER + fixed search_path mirrors 059's
-- health_schema_check; the page calls it with the service-role client.

CREATE OR REPLACE FUNCTION health_vault_tallies()
RETURNS TABLE (
  client_id UUID,
  total     BIGINT,
  ready     BIGINT,
  indexed   BIGINT,
  errored   BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    client_id,
    count(*)                                                            AS total,
    count(*) FILTER (WHERE status = 'ready')                            AS ready,
    count(*) FILTER (WHERE status = 'ready' AND indexed_at IS NOT NULL) AS indexed,
    count(*) FILTER (WHERE status = 'error' OR index_error IS NOT NULL) AS errored
  FROM vault_items
  GROUP BY client_id
$$;

INSERT INTO schema_migrations (version) VALUES ('082_health_vault_tallies.sql')
ON CONFLICT DO NOTHING;
