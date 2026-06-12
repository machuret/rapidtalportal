-- ============================================================
-- 055_notebook.sql – Notebook: shared per-placement documentation
-- Run in Supabase SQL Editor after 054_task_recurrences.sql
--
-- SECURITY MODEL (non-negotiable):
--   * A Notebook belongs to a PLACEMENT (a VA<->client engagement).
--   * Only the placement's two participants (va_user_id, client_user_id) may
--     read or write page content/titles/revisions — and only while the
--     placement is ACTIVE.
--   * RapidTal admins (super_admin) have NO access to content or titles. This
--     is enforced here in RLS: there is deliberately NO policy granting admin
--     access to notebook_pages or notebook_page_revisions, so an admin JWT
--     selects ZERO rows. Admins may read notebook_activity only (metadata).
--   * All app reads/writes of content go through the user-scoped Supabase
--     client (anon key + user JWT) so these policies actually apply. The
--     service-role key bypasses RLS and is only used server-side to SEED
--     templates at placement creation — never to read content back.
-- Idempotent.
-- ============================================================

-- ---- Placements: one row per VA<->client engagement -----------------------
CREATE TABLE IF NOT EXISTS placements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  va_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS placements_va_idx ON placements (va_user_id, status);
CREATE INDEX IF NOT EXISTS placements_client_user_idx ON placements (client_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS placements_unique_idx ON placements (va_user_id, client_user_id);

-- ---- Notebook pages -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notebook_pages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id   UUID NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  parent_page_id UUID REFERENCES notebook_pages(id) ON DELETE CASCADE,
  title          TEXT NOT NULL DEFAULT 'Untitled',
  content        JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  last_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notebook_pages_placement_idx ON notebook_pages (placement_id, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS notebook_pages_parent_idx ON notebook_pages (parent_page_id);

-- ---- Page revisions (immutable snapshots) ---------------------------------
CREATE TABLE IF NOT EXISTS notebook_page_revisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  content    JSONB NOT NULL,
  title      TEXT NOT NULL,
  edited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notebook_revisions_page_idx ON notebook_page_revisions (page_id, created_at DESC);

-- ---- Activity (the ONLY table admins can read) ----------------------------
-- Deliberately carries NO user id, NO page id, NO title — role + event only.
CREATE TABLE IF NOT EXISTS notebook_activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  event        TEXT NOT NULL CHECK (event IN ('page_created','page_edited','page_archived')),
  actor_role   TEXT NOT NULL CHECK (actor_role IN ('va','client')),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notebook_activity_placement_idx ON notebook_activity (placement_id, created_at DESC);

-- ============================================================
-- Helper functions (SECURITY DEFINER → bypass RLS internally, the standard
-- Supabase pattern for helpers called inside policies; see 013).
-- ============================================================

-- True iff the current user is a participant of an ACTIVE placement.
CREATE OR REPLACE FUNCTION notebook_is_participant(p_placement UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM placements
    WHERE id = p_placement
      AND status = 'active'
      AND (va_user_id = auth.uid() OR client_user_id = auth.uid())
  )
$$;

-- Same check, resolved from a page id (for the revisions table).
CREATE OR REPLACE FUNCTION notebook_page_is_participant(p_page UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM notebook_pages pg
    JOIN placements pl ON pl.id = pg.placement_id
    WHERE pg.id = p_page
      AND pl.status = 'active'
      AND (pl.va_user_id = auth.uid() OR pl.client_user_id = auth.uid())
  )
$$;

-- 'va' | 'client' | NULL for the current user on a placement.
CREATE OR REPLACE FUNCTION notebook_actor_role(p_placement UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN va_user_id = auth.uid() THEN 'va'
    WHEN client_user_id = auth.uid() THEN 'client'
  END
  FROM placements WHERE id = p_placement
$$;

-- ============================================================
-- Triggers: snapshot revisions + log activity on every page change.
-- Runs as definer so it can write to revisions/activity regardless of the
-- caller's table grants, but actor_role is derived from auth.uid() so seeding
-- via the service role (auth.uid() IS NULL) logs no activity.
-- ============================================================
CREATE OR REPLACE FUNCTION notebook_on_page_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT;
  v_event TEXT;
  v_changed BOOLEAN := false;
BEGIN
  v_role := notebook_actor_role(NEW.placement_id);

  IF TG_OP = 'INSERT' THEN
    v_event := 'page_created';
    v_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_archived AND NOT OLD.is_archived THEN
      v_event := 'page_archived';
    ELSIF NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title THEN
      v_event := 'page_edited';
      v_changed := true;
    ELSE
      RETURN NEW; -- sort/no-op change: nothing to record
    END IF;
  END IF;

  -- Snapshot a revision whenever content/title materially changed.
  IF v_changed THEN
    INSERT INTO notebook_page_revisions (page_id, content, title, edited_by)
    VALUES (NEW.id, NEW.content, NEW.title, NEW.last_edited_by);
  END IF;

  -- Log activity for genuine user actions only (seeds have NULL role).
  IF v_role IS NOT NULL THEN
    INSERT INTO notebook_activity (placement_id, event, actor_role)
    VALUES (NEW.placement_id, v_event, v_role);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notebook_pages_change ON notebook_pages;
CREATE TRIGGER notebook_pages_change
  AFTER INSERT OR UPDATE ON notebook_pages
  FOR EACH ROW EXECUTE FUNCTION notebook_on_page_change();

-- Keep only the most recent 50 revisions per page.
CREATE OR REPLACE FUNCTION notebook_prune_revisions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM notebook_page_revisions
  WHERE page_id = NEW.page_id
    AND id NOT IN (
      SELECT id FROM notebook_page_revisions
      WHERE page_id = NEW.page_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notebook_revisions_prune ON notebook_page_revisions;
CREATE TRIGGER notebook_revisions_prune
  AFTER INSERT ON notebook_page_revisions
  FOR EACH ROW EXECUTE FUNCTION notebook_prune_revisions();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE placements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_pages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_activity       ENABLE ROW LEVEL SECURITY;

-- Placements: participants and admins may read the ROW (no content here);
-- only admins create/alter the engagement.
DROP POLICY IF EXISTS "placements_select" ON placements;
CREATE POLICY "placements_select" ON placements FOR SELECT
  USING (current_user_role() = 'super_admin' OR va_user_id = auth.uid() OR client_user_id = auth.uid());

DROP POLICY IF EXISTS "placements_admin_write" ON placements;
CREATE POLICY "placements_admin_write" ON placements FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- Pages: participants of an ACTIVE placement only. NO admin policy → admin
-- JWT gets zero rows. No DELETE policy → archive only.
DROP POLICY IF EXISTS "notebook_pages_select" ON notebook_pages;
CREATE POLICY "notebook_pages_select" ON notebook_pages FOR SELECT
  USING (notebook_is_participant(placement_id));

DROP POLICY IF EXISTS "notebook_pages_insert" ON notebook_pages;
CREATE POLICY "notebook_pages_insert" ON notebook_pages FOR INSERT
  WITH CHECK (notebook_is_participant(placement_id));

DROP POLICY IF EXISTS "notebook_pages_update" ON notebook_pages;
CREATE POLICY "notebook_pages_update" ON notebook_pages FOR UPDATE
  USING (notebook_is_participant(placement_id))
  WITH CHECK (notebook_is_participant(placement_id));

-- Revisions: participants only (read + insert). Pruning is done by the
-- definer trigger, so no user DELETE policy is needed.
DROP POLICY IF EXISTS "notebook_revisions_select" ON notebook_page_revisions;
CREATE POLICY "notebook_revisions_select" ON notebook_page_revisions FOR SELECT
  USING (notebook_page_is_participant(page_id));

DROP POLICY IF EXISTS "notebook_revisions_insert" ON notebook_page_revisions;
CREATE POLICY "notebook_revisions_insert" ON notebook_page_revisions FOR INSERT
  WITH CHECK (notebook_page_is_participant(page_id));

-- Activity: participants AND admins may read (metadata only). No user inserts
-- (the definer trigger writes these rows).
DROP POLICY IF EXISTS "notebook_activity_select" ON notebook_activity;
CREATE POLICY "notebook_activity_select" ON notebook_activity FOR SELECT
  USING (current_user_role() = 'super_admin' OR notebook_is_participant(placement_id));

-- ============================================================
-- Storage: private bucket for page images; same participant gate, same admin
-- exclusion (path layout is placement_id/page_id/filename).
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('notebook-images', 'notebook-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "notebook_images_select" ON storage.objects;
CREATE POLICY "notebook_images_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'notebook-images' AND notebook_is_participant(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "notebook_images_insert" ON storage.objects;
CREATE POLICY "notebook_images_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'notebook-images' AND notebook_is_participant(((storage.foldername(name))[1])::uuid));

-- ---- Realtime: let participants see each other's page changes live ---------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notebook_pages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notebook_pages;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('055_notebook.sql')
ON CONFLICT DO NOTHING;
