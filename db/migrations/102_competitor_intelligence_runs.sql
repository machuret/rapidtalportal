-- ============================================================
-- 102_competitor_intelligence_runs.sql
-- Durable, evidence-linked synthesis over the isolated competitor mini-Vault.
-- Competitor material remains market context and is never factual client proof.
-- ============================================================

CREATE TABLE IF NOT EXISTS competitor_intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('complete', 'superseded')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  competitor_ids UUID[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(competitor_ids) BETWEEN 1 AND 20),
  source_item_ids UUID[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(source_item_ids) BETWEEN 3 AND 80),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 3 AND 80),
  source_character_count INTEGER NOT NULL CHECK (source_character_count >= 600),
  analysis JSONB NOT NULL CHECK (
    jsonb_typeof(analysis) = 'object'
    AND analysis @> '{"schema_version": 1}'::jsonb
  ),
  model TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  CHECK (source_count = cardinality(source_item_ids))
);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_intelligence_one_complete
  ON competitor_intelligence_runs (client_id)
  WHERE status = 'complete';

CREATE INDEX IF NOT EXISTS competitor_intelligence_client_history
  ON competitor_intelligence_runs (client_id, created_at DESC);

ALTER TABLE competitor_intelligence_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE competitor_intelligence_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE competitor_intelligence_runs TO service_role;

-- Replace the active report atomically so readers never see a half-written or
-- missing report while a new synthesis is promoted.
CREATE OR REPLACE FUNCTION replace_competitor_intelligence_run(
  p_client_id UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ,
  p_competitor_ids UUID[],
  p_source_item_ids UUID[],
  p_source_character_count INTEGER,
  p_analysis JSONB,
  p_model TEXT,
  p_actor_id UUID
)
RETURNS competitor_intelligence_runs
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_run competitor_intelligence_runs;
BEGIN
  -- Serialize replacement per tenant.
  PERFORM id FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found.' USING ERRCODE = 'P0002';
  END IF;

  IF cardinality(p_competitor_ids) IS NULL
    OR cardinality(p_competitor_ids) <> (
      SELECT count(*)
      FROM competitors
      WHERE client_id = p_client_id
        AND id = ANY(p_competitor_ids)
    )
  THEN
    RAISE EXCEPTION 'Competitor provenance is outside the client boundary.'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(p_source_item_ids) IS NULL
    OR cardinality(p_source_item_ids) <> (
      SELECT count(*)
      FROM competitor_content_items
      WHERE client_id = p_client_id
        AND competitor_id = ANY(p_competitor_ids)
        AND id = ANY(p_source_item_ids)
        AND is_removed = false
    )
  THEN
    RAISE EXCEPTION 'Source provenance is outside the client boundary.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE competitor_intelligence_runs
  SET status = 'superseded', updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND status = 'complete';

  INSERT INTO competitor_intelligence_runs (
    client_id,
    status,
    schema_version,
    window_start,
    window_end,
    competitor_ids,
    source_item_ids,
    source_count,
    source_character_count,
    analysis,
    model,
    created_by
  ) VALUES (
    p_client_id,
    'complete',
    1,
    p_window_start,
    p_window_end,
    p_competitor_ids,
    p_source_item_ids,
    cardinality(p_source_item_ids),
    p_source_character_count,
    p_analysis,
    p_model,
    p_actor_id
  )
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION replace_competitor_intelligence_run(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[], INTEGER, JSONB, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_competitor_intelligence_run(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[], INTEGER, JSONB, TEXT, UUID
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('102_competitor_intelligence_runs.sql')
ON CONFLICT DO NOTHING;
