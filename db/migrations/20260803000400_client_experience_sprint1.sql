-- Client experience Sprint 1: durable, tenant-attributed route quality events.
-- The browser never writes directly; the authenticated API records through the
-- service role so a caller cannot forge another tenant or user.

CREATE TABLE IF NOT EXISTS portal_experience_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_ready', 'page_slow', 'page_retry', 'page_error')),
  path TEXT NOT NULL CHECK (path ~ '^/' AND char_length(path) <= 300),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 300000),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_experience_events_client_created_idx
  ON portal_experience_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_experience_events_path_created_idx
  ON portal_experience_events (path, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_experience_events_slow_idx
  ON portal_experience_events (created_at DESC)
  WHERE event_type IN ('page_slow', 'page_error');

ALTER TABLE portal_experience_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_experience_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE portal_experience_events TO service_role;

COMMENT ON TABLE portal_experience_events IS
  'Tenant-attributed client portal readiness, slow-load, retry and render-error events.';

INSERT INTO schema_migrations (version)
VALUES ('20260803000400_client_experience_sprint1.sql')
ON CONFLICT (version) DO NOTHING;
