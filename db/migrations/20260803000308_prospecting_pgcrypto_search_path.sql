-- Migration 00307 was deployed before the discovery capture path was exercised.
-- Supabase installs pgcrypto in `extensions`; include it in the stored function
-- search path so the already-deployed unqualified digest call resolves safely.
-- Fresh installations use the explicitly qualified call in 00307 as well.

ALTER FUNCTION ingest_prospecting_job_results_v2(UUID, UUID, JSONB, NUMERIC)
  SET search_path = public, extensions;

INSERT INTO schema_migrations (version)
VALUES ('20260803000308_prospecting_pgcrypto_search_path.sql')
ON CONFLICT (version) DO NOTHING;
