-- ============================================================
-- 065_sop_suggestions.sql – persistent SOP idea backlog
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 064.
--
-- Mass-generated SOP ideas live here so the same idea is never suggested twice:
-- generation excludes existing SOP titles AND every prior suggestion (open,
-- dismissed, or created). Dismiss = never show again; create = turned into a SOP.
-- Scope: client_id NULL = global library. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS sop_suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = global
  title       TEXT NOT NULL,
  scope       TEXT,
  category    TEXT,
  step_count  INT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'created')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- One suggestion per (scope, title) — the de-dup backstop behind the in-code filter.
CREATE UNIQUE INDEX IF NOT EXISTS sop_suggestions_uniq
  ON sop_suggestions (coalesce(client_id::text, 'global'), lower(title));
CREATE INDEX IF NOT EXISTS sop_suggestions_scope_idx ON sop_suggestions (client_id, status);

ALTER TABLE sop_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_suggestions' AND policyname = 'sop_suggestions_super_admin_all') THEN
    CREATE POLICY "sop_suggestions_super_admin_all" ON sop_suggestions FOR ALL
      USING (current_user_role() = 'super_admin')
      WITH CHECK (current_user_role() = 'super_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sop_suggestions' AND policyname = 'sop_suggestions_client_admin') THEN
    CREATE POLICY "sop_suggestions_client_admin" ON sop_suggestions FOR ALL
      USING (client_id = current_user_client_id())
      WITH CHECK (client_id = current_user_client_id());
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('065_sop_suggestions.sql')
ON CONFLICT DO NOTHING;
