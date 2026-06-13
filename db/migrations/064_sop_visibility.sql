-- ============================================================
-- 064_sop_visibility.sql – per-VA SOP visibility
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 063.
--
-- A SOP is either 'public' (every VA who can see its scope) or 'restricted' to
-- an explicit allow-list of VAs (sop_access). Applies to both global library
-- SOPs and a client's own SOPs. Enforcement is in code (the /sops reads use the
-- service-role client and filter by access); RLS here is defence-in-depth.
-- Idempotent.
-- ============================================================

ALTER TABLE sops ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sops_visibility_chk') THEN
    ALTER TABLE sops ADD CONSTRAINT sops_visibility_chk CHECK (visibility IN ('public', 'restricted'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sop_access (
  sop_id     UUID NOT NULL REFERENCES sops(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sop_id, user_id)
);
CREATE INDEX IF NOT EXISTS sop_access_user_idx ON sop_access(user_id);

ALTER TABLE sop_access ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_access' AND policyname = 'sop_access_super_admin_all') THEN
    CREATE POLICY "sop_access_super_admin_all" ON sop_access FOR ALL
      USING (current_user_role() = 'super_admin')
      WITH CHECK (current_user_role() = 'super_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_access' AND policyname = 'sop_access_select_own') THEN
    CREATE POLICY "sop_access_select_own" ON sop_access FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('064_sop_visibility.sql')
ON CONFLICT DO NOTHING;
