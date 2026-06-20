-- ============================================================
-- 080_notification_prefs.sql – Per-user notification preferences
-- Run in Supabase SQL Editor after 079_sop_soft_delete.sql
--
-- Lets each user choose, per category, whether they get the in-app
-- notification and/or the email. Stored as JSONB on the user row:
--   { "<category>": { "in_app": bool, "email": bool } }
-- A missing category (or missing channel) defaults to ON, so existing
-- users keep today's behaviour until they change anything.
-- Idempotent.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO schema_migrations (version) VALUES ('080_notification_prefs.sql')
ON CONFLICT DO NOTHING;
