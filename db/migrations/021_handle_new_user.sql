-- ============================================================
-- 021_handle_new_user.sql – Capture the on-signup profile trigger in version control
--
-- A trigger on auth.users already exists in this project (created via the
-- Supabase dashboard, never committed): when an auth user is created it inserts
-- a matching public.users profile row. This file captures a canonical, idempotent
-- version so new environments reproduce it and the behaviour is reviewable.
--
-- ⚠️ BEFORE running this against the EXISTING database, confirm the live name +
-- definition so you don't end up with TWO triggers (which would double-insert):
--
--   select tgname, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
--   select pg_get_functiondef('public.handle_new_user()'::regprocedure);
--
-- If the live trigger has a different NAME, drop it by that name first (or skip
-- the CREATE TRIGGER below on the existing DB — it already works there). This
-- migration is primarily for fresh environments + documentation.
-- ============================================================

-- Profile-creation function. SECURITY DEFINER so it can write to public.users
-- (which has RLS) from the auth context; ON CONFLICT DO NOTHING so it can never
-- block auth user creation even if a row already exists. The API route
-- (/api/admin/users) upserts afterwards to set the real role/client/name.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    -- role is NOT NULL + CHECK(super_admin|client_admin|va); default new
    -- signups to 'va'. The admin route overwrites this via upsert.
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'va')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
