-- ============================================================
-- 079_sop_soft_delete.sql – Recoverable SOP deletion
-- Run in Supabase SQL Editor after 078_va_leave_allowance.sql
--
-- SOPs were hard-deleted, so an accidental delete was unrecoverable and any
-- fork's `forked_from` pointer was nulled (ON DELETE SET NULL). This switches
-- delete to a soft archive: rows get a `deleted_at` stamp and every list/read
-- filters `deleted_at IS NULL`, matching the archive pattern used by tasks /
-- CRM / notebook. A partial index keeps the live-row scans fast.
-- Idempotent.
-- ============================================================

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sops_live_idx
  ON sops (client_id)
  WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('079_sop_soft_delete.sql')
ON CONFLICT DO NOTHING;
