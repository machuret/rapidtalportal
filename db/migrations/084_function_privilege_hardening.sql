-- ============================================================
-- 084_function_privilege_hardening.sql – close service-only RPC exposure
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default. These
-- cross-tenant/admin aggregations are called only through server code using the
-- service role, so they must neither bypass RLS nor be callable through an
-- authenticated/anonymous PostgREST session.
-- ============================================================

-- Production environments created before the automated migration ledger can
-- legitimately be missing one of these helpers. A missing function is already
-- non-exploitable; harden every function that is actually present without
-- making the urgent privilege migration fail on harmless schema drift.
DO $$
BEGIN
  IF to_regprocedure('public.admin_client_overview()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_client_overview() SECURITY INVOKER';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_client_overview() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_client_overview() TO service_role';
  END IF;

  IF to_regprocedure('public.health_vault_tallies()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.health_vault_tallies() SECURITY INVOKER';
    EXECUTE 'REVOKE ALL ON FUNCTION public.health_vault_tallies() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.health_vault_tallies() TO service_role';
  END IF;

  IF to_regprocedure('public.health_schema_check()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.health_schema_check() SECURITY INVOKER';
    EXECUTE 'REVOKE ALL ON FUNCTION public.health_schema_check() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.health_schema_check() TO service_role';
  END IF;

  IF to_regprocedure('public.get_contact_status_counts(uuid)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_contact_status_counts(UUID) SECURITY INVOKER';
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_contact_status_counts(UUID) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_contact_status_counts(UUID) TO service_role';
  END IF;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('084_function_privilege_hardening.sql')
ON CONFLICT DO NOTHING;
