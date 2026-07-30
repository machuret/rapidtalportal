-- ============================================================
-- 106_connected_rewrite_provenance.sql
-- Keep connected rewrites and derived drafts inside the project's selected
-- evidence, updating piece and project provenance in one transaction.
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
  IF length(coalesce(p_body, '')) > 50000
     OR (p_generation_kind = 'adaptation' AND length(btrim(coalesce(p_body, ''))) = 0) THEN
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

CREATE OR REPLACE FUNCTION create_content_project_derived_draft(
  p_client_id UUID,
  p_project_id UUID,
  p_parent_piece_id UUID,
  p_actor_id UUID,
  p_content_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_content_brief JSONB,
  p_source_references JSONB,
  p_style_snapshot JSONB,
  p_generation_kind TEXT
)
RETURNS SETOF content_pieces
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project content_projects%ROWTYPE;
  v_parent content_pieces%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_source JSONB;
  v_item_id UUID;
  v_piece content_pieces%ROWTYPE;
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
  IF p_generation_kind NOT IN ('duplicate', 'adaptation') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid derived content type.';
  END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 OR length(p_body) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid content body is required.';
  END IF;
  IF jsonb_typeof(p_content_brief) <> 'object'
     OR jsonb_typeof(p_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content provenance.';
  END IF;

  SELECT *
    INTO v_project
  FROM content_projects
  WHERE id = p_project_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected content project not found.';
  END IF;
  IF v_project.status = 'rejected' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A rejected project cannot create derived drafts.';
  END IF;

  SELECT *
    INTO v_parent
  FROM content_pieces
  WHERE id = p_parent_piece_id
    AND client_id = p_client_id
    AND project_id = p_project_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The source content does not belong to this project.';
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(p_source_references)
  LOOP
    BEGIN
      v_item_id := (v_source ->> 'itemId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid factual source reference.';
    END;
    IF v_item_id IS NULL OR NOT (v_item_id = ANY(v_project.vault_source_ids)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A derived source was not selected as factual Vault evidence.';
    END IF;
  END LOOP;

  INSERT INTO content_pieces (
    client_id, project_id, content_type, title, brief, body, status,
    content_brief, source_references, style_snapshot, generation_kind,
    parent_piece_id, created_by
  ) VALUES (
    p_client_id, p_project_id, p_content_type, btrim(p_title),
    p_content_brief ->> 'objective', p_body, 'draft',
    p_content_brief, p_source_references, p_style_snapshot, p_generation_kind,
    p_parent_piece_id, p_actor_id
  )
  RETURNING * INTO v_piece;

  UPDATE content_projects
  SET
    current_piece_id = v_piece.id,
    current_step = 'edit',
    status = 'active',
    content_brief = v_piece.content_brief,
    vault_source_references = v_piece.source_references,
    style_snapshot = v_piece.style_snapshot
  WHERE id = p_project_id
    AND client_id = p_client_id;

  RETURN NEXT v_piece;
END;
$$;

REVOKE ALL ON FUNCTION create_content_project_derived_draft(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_content_project_derived_draft(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('106_connected_rewrite_provenance.sql')
ON CONFLICT DO NOTHING;
