-- ============================================================
-- 101_content_style_analysis.sql
-- Versioned, human-approved style analysis for owned content.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_style_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (
    channel IN ('linkedin', 'facebook', 'instagram', 'x', 'email', 'blog', 'newsletter')
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(analysis) = 'object'),
  source_item_ids UUID[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(source_item_ids) <= 50),
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0 AND source_count <= 50),
  source_character_count INTEGER NOT NULL DEFAULT 0 CHECK (source_character_count >= 0),
  model TEXT,
  analysed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_style_analyses_one_draft
  ON content_style_analyses (client_id, channel)
  WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS content_style_analyses_one_approved
  ON content_style_analyses (client_id, channel)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS content_style_analyses_lookup
  ON content_style_analyses (client_id, channel, status, updated_at DESC);

ALTER TABLE content_style_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_style_analyses FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_style_analyses TO service_role;

-- Approval is intentionally atomic: an old approved profile remains active
-- while a new draft is reviewed, then is archived in the same transaction that
-- promotes the replacement.
CREATE OR REPLACE FUNCTION approve_content_style_analysis(
  p_client_id UUID,
  p_analysis_id UUID,
  p_actor_id UUID
)
RETURNS content_style_analyses
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_target content_style_analyses;
BEGIN
  SELECT *
  INTO v_target
  FROM content_style_analyses
  WHERE id = p_analysis_id
    AND client_id = p_client_id
    AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Style analysis draft not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Serialize approvals for this tenant/channel before replacing authority.
  PERFORM id
  FROM content_style_analyses
  WHERE client_id = p_client_id
    AND channel = v_target.channel
  FOR UPDATE;

  UPDATE content_style_analyses
  SET
    status = 'archived',
    updated_by = p_actor_id,
    updated_at = clock_timestamp()
  WHERE client_id = p_client_id
    AND channel = v_target.channel
    AND status = 'approved';

  UPDATE content_style_analyses
  SET
    status = 'approved',
    approved_by = p_actor_id,
    approved_at = clock_timestamp(),
    updated_by = p_actor_id,
    updated_at = clock_timestamp()
  WHERE id = p_analysis_id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION approve_content_style_analysis(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_content_style_analysis(UUID, UUID, UUID)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('101_content_style_analysis.sql')
ON CONFLICT DO NOTHING;
