-- ============================================================
-- 021_handle_new_auth_user.sql – Capture the on-signup profile trigger in version control
--
-- This is a FAITHFUL capture of the trigger that already exists in the project
-- (it was created via the Supabase dashboard and never committed). Verified
-- against the live definition via pg_get_functiondef / pg_get_triggerdef.
--
-- Behaviour: when an auth user is created, insert a minimal public.users row
-- (id, email, role='va'). ON CONFLICT DO NOTHING makes it safe. The admin route
-- (/api/admin/users) then upserts the chosen full_name / role / client_id on top.
--
-- Because the names + body match the live objects exactly, running this is a
-- no-op reconciliation on the existing DB, and reproduces the trigger on fresh
-- environments. Idempotent / safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'va')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
