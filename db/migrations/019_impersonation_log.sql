-- ============================================================
-- 019_impersonation_log.sql – Audit trail for super_admin "Login as" / impersonation
-- Run in Supabase SQL Editor after 018_vault_embeddings.sql
--
-- Records every start/stop of an impersonation session so there's an accountable
-- trail of which admin viewed the app as which user. Written best-effort by
-- /api/admin/impersonate (service role); a missing table never blocks the feature.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  target_email TEXT,
  action      TEXT NOT NULL CHECK (action IN ('start', 'stop')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS impersonation_log_actor_idx
  ON impersonation_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS impersonation_log_created_idx
  ON impersonation_log (created_at DESC);

-- RLS: written via service role (bypasses RLS). Only super_admins may read it.
ALTER TABLE impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impersonation_log_super_admin_select" ON impersonation_log;
CREATE POLICY "impersonation_log_super_admin_select"
  ON impersonation_log FOR SELECT
  USING (current_user_role() = 'super_admin');
