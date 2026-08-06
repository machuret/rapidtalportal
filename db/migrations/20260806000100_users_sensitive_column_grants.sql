-- ============================================================
-- 20260806000100_users_sensitive_column_grants.sql
-- SECURITY FIX (P2): restrict which users columns end users can read.
--
-- The users_own_client_select RLS policy grants a co-tenant user row access to
-- the WHOLE users row, and RLS cannot column-filter, so a VA could
--   GET /rest/v1/users?select=*&client_id=eq.<own-client>
-- and read peers' salary, payment_details, personal_email, address, birthday,
-- whatsapp and payment_terms straight from PostgREST. (The app's API strips
-- these fields; PostgREST does not.)
--
-- Every read of the users table in the app goes through the service-role admin
-- client, or the SECURITY DEFINER current_user_role()/current_user_client_id()
-- helpers — no user- or browser-scoped read relies on the default table grant.
-- So we revoke the table-wide SELECT from authenticated and grant it back only
-- on the non-sensitive columns; anon needs no access at all. service_role is
-- unaffected (it does not depend on these grants), so all app reads keep working.
--
-- Idempotent.
-- ============================================================

REVOKE SELECT ON users FROM anon, authenticated;

GRANT SELECT (
  id,
  client_id,
  role,
  full_name,
  email,
  avatar_url,
  phone,
  timezone,
  skills,
  notification_prefs,
  created_at
) ON users TO authenticated;

INSERT INTO schema_migrations (version) VALUES ('20260806000100_users_sensitive_column_grants.sql')
ON CONFLICT DO NOTHING;
