-- ============================================================
-- 047_client_archive.sql – Client lifecycle (archive / restore)
-- Run in Supabase SQL Editor after 046_sop_versioning.sql
--
-- Wind a client down without destroying their data: archived clients drop out
-- of active lists, the Overview health board and the admin pickers, but stay
-- fully recoverable (and their history intact). Deletion stays separate.
-- Idempotent.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

INSERT INTO schema_migrations (version) VALUES ('047_client_archive.sql')
ON CONFLICT DO NOTHING;
