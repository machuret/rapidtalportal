-- ============================================================
-- 20260805000200_help_content_access_lockdown.sql
-- SECURITY FIX (P1): feature_videos and guides (081) were created with no RLS
-- and no REVOKE. With the default `authenticated`/`anon` grants on public
-- tables, any authenticated user (or anyone holding the public anon key) could
--   PATCH /rest/v1/guides?key=eq.client   or   POST /rest/v1/feature_videos
-- to rewrite the global Client/VA guide text or inject arbitrary Loom/href
-- URLs. That content renders to EVERY user in EVERY tenant, making it a
-- product-wide defacement / phishing-link injection vector and a broken-access-
-- control escalation (non-admins writing admin-only content).
--
-- The app only ever reads/writes these tables via the service-role admin
-- client (lib/tutorials/server.ts, lib/guides/server.ts, app/api/admin/*),
-- which bypasses RLS and keeps its grants, so locking out anon/authenticated is
-- transparent to the app. We both REVOKE the default grants and ENABLE RLS with
-- no permissive policy (deny-all to non-service roles) for defense in depth.
--
-- Idempotent.
-- ============================================================

REVOKE ALL ON TABLE feature_videos FROM anon, authenticated;
REVOKE ALL ON TABLE guides         FROM anon, authenticated;

ALTER TABLE feature_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides         ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies: with RLS enabled and no policy present, every
-- access via a user or anon JWT is denied. service_role bypasses RLS entirely,
-- so the admin-client read/write paths are unaffected.

INSERT INTO schema_migrations (version) VALUES ('20260805000200_help_content_access_lockdown.sql')
ON CONFLICT DO NOTHING;
