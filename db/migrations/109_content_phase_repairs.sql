-- ============================================================
-- 109_content_phase_repairs.sql
-- Close the production gaps found in the Phase 0-4 audit:
--   * repair the connected rewrite RPC
--   * preserve immutable style-analysis source captures
--   * make expired analysis attempts explicitly recoverable
-- ============================================================

CREATE OR REPLACE FUNCTION commit_content_piece_rewrite(
  p_client_id UUID,
  p_piece_id UUID,
  p_actor_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_body TEXT,
  p_content_brief JSONB,
  p_source_references JSONB,
  p_style_snapshot JSONB,
  p_reason TEXT
)
RETURNS SETOF content_pieces
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_piece content_pieces%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_project content_projects%ROWTYPE;
  v_source JSONB;
  v_item_id UUID;
  v_updated content_pieces%ROWTYPE;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Content actor not found.';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;

  SELECT *
    INTO v_piece
  FROM content_pieces
  WHERE id = p_piece_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Content piece not found.';
  END IF;
  IF v_piece.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only draft content can be rewritten.';
  END IF;
  IF p_expected_updated_at IS NULL
     OR v_piece.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Content changed while the rewrite was running. Reload and try again.';
  END IF;
  IF p_body IS NULL
     OR length(btrim(p_body)) = 0
     OR length(p_body) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid content body is required.';
  END IF;
  IF jsonb_typeof(p_content_brief) <> 'object'
     OR jsonb_typeof(p_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content provenance.';
  END IF;

  IF v_piece.project_id IS NOT NULL THEN
    SELECT *
      INTO v_project
    FROM content_projects
    WHERE id = v_piece.project_id
      AND client_id = p_client_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected content project not found.';
    END IF;

    FOR v_source IN SELECT value FROM jsonb_array_elements(p_source_references)
    LOOP
      BEGIN
        v_item_id := (v_source ->> 'itemId')::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid factual source reference.';
      END;
      IF v_item_id IS NULL OR NOT (v_item_id = ANY(v_project.vault_source_ids)) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A rewritten source was not selected as factual Vault evidence.';
      END IF;
    END LOOP;
  END IF;

  UPDATE content_pieces
  SET
    body = p_body,
    content_brief = p_content_brief,
    source_references = p_source_references,
    style_snapshot = p_style_snapshot,
    generation_kind = 'rewrite',
    revision_reason = coalesce(nullif(btrim(p_reason), ''), 'rewrite'),
    updated_at = clock_timestamp()
  WHERE id = p_piece_id
    AND client_id = p_client_id
  RETURNING * INTO v_updated;

  IF v_piece.project_id IS NOT NULL THEN
    UPDATE content_projects
    SET
      current_piece_id = v_updated.id,
      content_brief = v_updated.content_brief,
      vault_source_references = v_updated.source_references,
      style_snapshot = v_updated.style_snapshot
    WHERE id = v_piece.project_id
      AND client_id = p_client_id;
  END IF;

  RETURN NEXT v_updated;
END;
$$;

REVOKE ALL ON FUNCTION commit_content_piece_rewrite(
  UUID, UUID, UUID, TIMESTAMPTZ, TEXT, JSONB, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_content_piece_rewrite(
  UUID, UUID, UUID, TIMESTAMPTZ, TEXT, JSONB, JSONB, JSONB, TEXT
) TO service_role;

ALTER TABLE content_style_analyses
  ADD COLUMN IF NOT EXISTS source_evidence JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_style_analyses_source_evidence_array'
  ) THEN
    ALTER TABLE content_style_analyses
      ADD CONSTRAINT content_style_analyses_source_evidence_array
      CHECK (jsonb_typeof(source_evidence) = 'array');
  END IF;
END $$;

UPDATE content_style_analyses AS analysis
SET source_evidence = coalesce((
  SELECT jsonb_agg(
    jsonb_build_object(
      'itemId', item.id,
      'title', item.title,
      'sourceUrl', item.source_url,
      'contentHash', encode(sha256(convert_to(coalesce(item.raw_content, ''), 'UTF8')), 'hex'),
      'capturedAt', item.created_at
    )
    ORDER BY item.id
  )
  FROM vault_items AS item
  WHERE item.client_id = analysis.client_id
    AND item.id = ANY(analysis.source_item_ids)
), '[]'::jsonb)
WHERE source_evidence = '[]'::jsonb
  AND cardinality(source_item_ids) > 0;

CREATE OR REPLACE FUNCTION expire_stale_content_analysis_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE content_analysis_attempts
  SET
    status = 'failed',
    error_code = 'LEASE_EXPIRED',
    error_message = 'The analysis worker did not finish before its lease expired.',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE status = 'running'
    AND lease_until < clock_timestamp();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_content_analysis_attempts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_content_analysis_attempts()
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('109_content_phase_repairs.sql')
ON CONFLICT DO NOTHING;
