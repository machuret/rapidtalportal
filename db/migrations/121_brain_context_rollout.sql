-- ============================================================
-- 121_brain_context_rollout.sql
-- Brain 3.0 Phase 1: independently reversible resolver rollout and immutable
-- context links for Ideas, Content and Tools.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_context_feature_flags (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  ask_enabled BOOLEAN NOT NULL DEFAULT true,
  content_enabled BOOLEAN NOT NULL DEFAULT true,
  topics_enabled BOOLEAN NOT NULL DEFAULT true,
  tools_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE brain_context_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brain_context_feature_flags
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE brain_context_feature_flags FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE brain_context_feature_flags
  TO service_role;

ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS brain_context_snapshot_id UUID
    REFERENCES brain_context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE content_projects
  ADD COLUMN IF NOT EXISTS brain_context_snapshot_id UUID
    REFERENCES brain_context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE content_pieces
  ADD COLUMN IF NOT EXISTS brain_context_snapshot_id UUID
    REFERENCES brain_context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE tool_runs
  ADD COLUMN IF NOT EXISTS brain_context_snapshot_id UUID
    REFERENCES brain_context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE content_style_analyses
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    CHECK (version > 0);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY client_id, channel
      ORDER BY created_at, id
    )::INTEGER AS resolved_version
  FROM content_style_analyses
)
UPDATE content_style_analyses AS analysis
SET version = ranked.resolved_version
FROM ranked
WHERE ranked.id = analysis.id
  AND analysis.version <> ranked.resolved_version;

CREATE OR REPLACE FUNCTION set_content_style_analysis_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM id
  FROM clients
  WHERE id = NEW.client_id
  FOR UPDATE;
  SELECT coalesce(max(version), 0) + 1
  INTO NEW.version
  FROM content_style_analyses
  WHERE client_id = NEW.client_id
    AND channel = NEW.channel;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_style_analysis_version_before_insert
  ON content_style_analyses;
CREATE TRIGGER content_style_analysis_version_before_insert
BEFORE INSERT ON content_style_analyses
FOR EACH ROW EXECUTE FUNCTION set_content_style_analysis_version();

REVOKE ALL ON FUNCTION set_content_style_analysis_version()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_content_style_analysis_version()
  TO service_role;

CREATE INDEX IF NOT EXISTS content_topics_brain_context_snapshot
  ON content_topics (brain_context_snapshot_id)
  WHERE brain_context_snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_projects_brain_context_snapshot
  ON content_projects (brain_context_snapshot_id)
  WHERE brain_context_snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_pieces_brain_context_snapshot
  ON content_pieces (brain_context_snapshot_id)
  WHERE brain_context_snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tool_runs_brain_context_snapshot
  ON tool_runs (brain_context_snapshot_id)
  WHERE brain_context_snapshot_id IS NOT NULL;

-- Prevent a service-role API bug or direct database call from attaching a
-- context snapshot belonging to another tenant or surface.
CREATE OR REPLACE FUNCTION enforce_brain_context_snapshot_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_surface TEXT;
BEGIN
  IF NEW.brain_context_snapshot_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id, surface
  INTO v_client_id, v_surface
  FROM brain_context_snapshots
  WHERE id = NEW.brain_context_snapshot_id;

  IF NOT FOUND OR v_client_id <> NEW.client_id THEN
    RAISE EXCEPTION 'Brain context snapshot is outside the client boundary.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'tool_runs' AND v_surface <> 'tool' THEN
    RAISE EXCEPTION 'Tool run requires a tool Brain context snapshot.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME IN ('content_topics', 'content_projects', 'content_pieces')
    AND v_surface NOT IN ('content', 'compose')
  THEN
    RAISE EXCEPTION 'Content record requires a content Brain context snapshot.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_brain_context_snapshot_link()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_brain_context_snapshot_link()
  TO service_role;

DROP TRIGGER IF EXISTS content_topics_brain_context_link ON content_topics;
CREATE TRIGGER content_topics_brain_context_link
BEFORE INSERT OR UPDATE OF brain_context_snapshot_id ON content_topics
FOR EACH ROW EXECUTE FUNCTION enforce_brain_context_snapshot_link();

DROP TRIGGER IF EXISTS content_projects_brain_context_link ON content_projects;
CREATE TRIGGER content_projects_brain_context_link
BEFORE INSERT OR UPDATE OF brain_context_snapshot_id ON content_projects
FOR EACH ROW EXECUTE FUNCTION enforce_brain_context_snapshot_link();

DROP TRIGGER IF EXISTS content_pieces_brain_context_link ON content_pieces;
CREATE TRIGGER content_pieces_brain_context_link
BEFORE INSERT OR UPDATE OF brain_context_snapshot_id ON content_pieces
FOR EACH ROW EXECUTE FUNCTION enforce_brain_context_snapshot_link();

DROP TRIGGER IF EXISTS tool_runs_brain_context_link ON tool_runs;
CREATE TRIGGER tool_runs_brain_context_link
BEFORE INSERT OR UPDATE OF brain_context_snapshot_id ON tool_runs
FOR EACH ROW EXECUTE FUNCTION enforce_brain_context_snapshot_link();

INSERT INTO schema_migrations (version)
VALUES ('121_brain_context_rollout.sql')
ON CONFLICT DO NOTHING;
