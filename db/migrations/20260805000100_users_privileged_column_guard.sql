-- ============================================================
-- 20260805000100_users_privileged_column_guard.sql
-- SECURITY FIX (P0): prevent privilege escalation / tenant hopping via the
-- self-profile UPDATE path.
--
-- The RLS policy "users_update_own_profile" (006) gates the ROW
-- (id = auth.uid()) but Postgres RLS cannot restrict WHICH COLUMNS an UPDATE
-- touches. Because `authenticated` holds the default table UPDATE grant and
-- PostgREST is reachable with any user JWT, a client_admin/va could
--   PATCH /rest/v1/users?id=eq.<self>  {"role":"super_admin"}
-- or rewrite their own client_id and self-escalate / jump into another tenant
-- (the WITH CHECK (id = auth.uid()) still passes because id is unchanged).
--
-- Fix: a BEFORE UPDATE trigger that forbids changing `role` or `client_id`
-- from within a real end-user session. Legitimate role/tenant changes go
-- through the service-role admin client (app/api/admin/users/*), which is not
-- a user session — auth.uid() IS NULL there — and is therefore unaffected, as
-- are the SQL migration runner and psql. Ordinary profile edits (name, phone,
-- avatar, birthday, notification_prefs) never touch these columns, so the
-- self-service edit flow keeps working.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_users_privileged_columns_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only constrain real end-user sessions. The service-role admin client, the
  -- migration runner and psql all present a NULL auth.uid().
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Changing role is not permitted for this session'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Changing client_id is not permitted for this session'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_privileged_columns_immutable ON users;
CREATE TRIGGER trg_users_privileged_columns_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_users_privileged_columns_immutable();

INSERT INTO schema_migrations (version) VALUES ('20260805000100_users_privileged_column_guard.sql')
ON CONFLICT DO NOTHING;
