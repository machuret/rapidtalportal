-- ============================================================
-- 041_crm_archive.sql – CRM archive + per-contact activity trail
-- Run in Supabase SQL Editor after 040_access_restrict.sql
--
-- Contacts are never hard-deleted by accident again: anyone can archive
-- (recoverable, logged), only admins can permanently delete. crm_events is
-- the audit trail — created / status moves / edits / archive / restore /
-- notes — so there's always a "who touched this". Idempotent.
-- ============================================================

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS crm_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_events_contact_idx ON crm_events (contact_id, created_at DESC);

ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_events_select" ON crm_events;
CREATE POLICY "crm_events_select"
  ON crm_events FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

INSERT INTO schema_migrations (version) VALUES ('041_crm_archive.sql')
ON CONFLICT DO NOTHING;
