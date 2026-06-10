-- ============================================================
-- 042_app_errors.sql – In-app error tracking
-- Run in Supabase SQL Editor after 041_crm_archive.sql
--
-- Ends "we find out when a user complains": every unhandled API error and
-- reported browser error lands here, surfaced at /admin/errors and flagged
-- on the admin Overview. Service-role writes only; no RLS policies granted,
-- so the table is invisible to client-side queries entirely.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_errors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL,         -- 'api' | 'client' | 'proxy'
  message    TEXT NOT NULL,
  stack      TEXT,
  url        TEXT,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_errors_time_idx ON app_errors (created_at DESC);

ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version) VALUES ('042_app_errors.sql')
ON CONFLICT DO NOTHING;
