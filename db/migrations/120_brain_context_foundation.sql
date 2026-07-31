-- ============================================================
-- 120_brain_context_foundation.sql
-- Brain 3.0 Phase 0: versioned context snapshots and baseline evaluations.
--
-- These tables are deliberately service-role only. Phase 0 establishes the
-- contract and storage without changing any current generation path. Phase 1
-- will populate snapshots behind per-surface feature flags.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS brain_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (version = 'brain-context-v1'),
  resolver_version TEXT NOT NULL CHECK (resolver_version = 'resolver-v1'),
  surface TEXT NOT NULL CHECK (surface IN ('ask', 'content', 'compose', 'tool')),
  channel TEXT CHECK (
    channel IS NULL OR channel IN (
      'linkedin', 'facebook', 'instagram', 'x', 'email',
      'blog', 'newsletter', 'message', 'other'
    )
  ),
  artifact_kind TEXT CHECK (
    artifact_kind IS NULL OR artifact_kind IN (
      'vault_answer', 'content_topic', 'content_project',
      'content_piece', 'tool_run', 'compose'
    )
  ),
  artifact_id UUID,
  request JSONB NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  model TEXT,
  prompt_version TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (snapshot->>'version' = version),
  CHECK (snapshot->>'clientId' = client_id::TEXT),
  CHECK (request->>'surface' = surface),
  CHECK ((snapshot->'request'->>'surface') = surface),
  CHECK ((snapshot->'request') = request)
);

CREATE OR REPLACE FUNCTION set_brain_context_snapshot_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.snapshot_hash := encode(
    extensions.digest(convert_to(NEW.snapshot::TEXT, 'UTF8'), 'sha256'),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_context_snapshot_hash_before_insert
  ON brain_context_snapshots;
CREATE TRIGGER brain_context_snapshot_hash_before_insert
BEFORE INSERT ON brain_context_snapshots
FOR EACH ROW
EXECUTE FUNCTION set_brain_context_snapshot_hash();

REVOKE ALL ON FUNCTION set_brain_context_snapshot_hash()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_brain_context_snapshot_hash()
  TO service_role;

CREATE INDEX IF NOT EXISTS brain_context_snapshots_client_time
  ON brain_context_snapshots (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_context_snapshots_artifact
  ON brain_context_snapshots (client_id, artifact_kind, artifact_id)
  WHERE artifact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_context_snapshots_hash
  ON brain_context_snapshots (client_id, snapshot_hash);

ALTER TABLE brain_context_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brain_context_snapshots FROM PUBLIC, anon, authenticated;
-- Snapshots are immutable audit records. They may only be inserted and read;
-- client deletion still removes them through the foreign-key cascade.
REVOKE ALL ON TABLE brain_context_snapshots FROM service_role;
GRANT SELECT, INSERT ON TABLE brain_context_snapshots TO service_role;

CREATE TABLE IF NOT EXISTS brain_evaluation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL DEFAULT 1 CHECK (version = 1),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  case_type TEXT NOT NULL CHECK (
    case_type IN ('ask', 'content_idea', 'content_draft', 'tool')
  ),
  channel TEXT CHECK (
    channel IS NULL OR channel IN (
      'linkedin', 'facebook', 'instagram', 'x', 'email',
      'blog', 'newsletter', 'message', 'other'
    )
  ),
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  expected JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(expected) = 'object'),
  baseline_output TEXT NOT NULL DEFAULT '',
  baseline_context_snapshot_id UUID
    REFERENCES brain_context_snapshots(id) ON DELETE SET NULL,
  baseline_model TEXT,
  baseline_prompt_version TEXT,
  baseline_captured_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[] CHECK (cardinality(tags) <= 30),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS brain_evaluation_cases_lookup
  ON brain_evaluation_cases (client_id, case_type, channel, active);

ALTER TABLE brain_evaluation_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brain_evaluation_cases FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE brain_evaluation_cases TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('120_brain_context_foundation.sql')
ON CONFLICT DO NOTHING;
