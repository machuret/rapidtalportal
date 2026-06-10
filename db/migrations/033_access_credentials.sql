-- ============================================================
-- 033_access_credentials.sql – "Access" section: shared logins for VAs
-- Run in Supabase SQL Editor after 032_tasks_realtime.sql
--
-- Clients (and super admin) store site logins; VAs assigned to the client
-- can view them. The password column NEVER holds plaintext — the app
-- encrypts with AES-256-GCM (key in CREDENTIALS_ENCRYPTION_KEY env var,
-- never in this database) before insert, so a DB dump alone cannot
-- recover any password.
--
-- reveal audit: every time someone decrypts a password we log who/when,
-- so the client can see exactly which VA looked at which login.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS access_credentials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  site         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Other',
  url          TEXT NOT NULL DEFAULT '',
  username     TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL,            -- AES-256-GCM ciphertext, never plaintext
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_credentials_client_idx
  ON access_credentials (client_id, category, site);

ALTER TABLE access_credentials ENABLE ROW LEVEL SECURITY;

-- Everyone in the client (VA + client_admin) can list logins; super admin all.
-- (The API additionally strips password_enc from list responses.)
DROP POLICY IF EXISTS "access_select" ON access_credentials;
CREATE POLICY "access_select"
  ON access_credentials FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

-- Only admins manage entries (VAs are read-only).
DROP POLICY IF EXISTS "access_insert" ON access_credentials;
CREATE POLICY "access_insert"
  ON access_credentials FOR INSERT
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'client_admin' AND client_id = current_user_client_id())
  );

DROP POLICY IF EXISTS "access_update" ON access_credentials;
CREATE POLICY "access_update"
  ON access_credentials FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'client_admin' AND client_id = current_user_client_id())
  );

DROP POLICY IF EXISTS "access_delete" ON access_credentials;
CREATE POLICY "access_delete"
  ON access_credentials FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'client_admin' AND client_id = current_user_client_id())
  );

-- ── Reveal audit log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_credential_reveals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES access_credentials(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  revealed_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_reveals_cred_idx
  ON access_credential_reveals (credential_id, revealed_at DESC);

ALTER TABLE access_credential_reveals ENABLE ROW LEVEL SECURITY;

-- Admins can audit who viewed what; VAs don't need to read the log.
DROP POLICY IF EXISTS "access_reveals_select" ON access_credential_reveals;
CREATE POLICY "access_reveals_select"
  ON access_credential_reveals FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'client_admin' AND client_id = current_user_client_id())
  );
