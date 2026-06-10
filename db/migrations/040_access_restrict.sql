-- ============================================================
-- 040_access_restrict.sql – Per-VA scoping for Access credentials
-- Run in Supabase SQL Editor after 039_task_events.sql
--
-- By default a credential is visible to everyone on the client. Admins can
-- restrict one to specific people: restricted_to holds the allowed user ids.
-- NULL/empty = everyone (current behaviour). Admins always see all; the API
-- enforces the filter for VAs on both list and reveal. Idempotent.
-- ============================================================

ALTER TABLE access_credentials
  ADD COLUMN IF NOT EXISTS restricted_to UUID[];

INSERT INTO schema_migrations (version) VALUES ('040_access_restrict.sql')
ON CONFLICT DO NOTHING;
