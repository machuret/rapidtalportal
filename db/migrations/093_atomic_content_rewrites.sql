-- ============================================================
-- 093_atomic_content_rewrites.sql – version-aware editorial commits
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

  IF p_body IS NULL OR length(btrim(p_body)) = 0 OR length(p_body) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid content body is required.';
  END IF;

  IF jsonb_typeof(p_content_brief) <> 'object'
     OR jsonb_typeof(p_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content provenance.';
  END IF;

  RETURN QUERY
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
  RETURNING content_pieces.*;
END;
$$;

REVOKE ALL ON FUNCTION commit_content_piece_rewrite(
  UUID, UUID, UUID, TIMESTAMPTZ, TEXT, JSONB, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION commit_content_piece_rewrite(
  UUID, UUID, UUID, TIMESTAMPTZ, TEXT, JSONB, JSONB, JSONB, TEXT
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('093_atomic_content_rewrites.sql')
ON CONFLICT DO NOTHING;
