-- ============================================================
-- 110_content_db_lint_cleanup.sql
-- Make the deterministic phrase guard's return contract explicit to both
-- PostgreSQL and plpgsql_check. The final return is unreachable in normal
-- execution because the loop exits through RETURN, but it prevents future
-- lint pipelines from treating the guard as potentially nullable.
-- ============================================================

CREATE OR REPLACE FUNCTION content_contains_phrase(p_body TEXT, p_phrase TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_body TEXT := lower(coalesce(p_body, ''));
  v_phrase TEXT := lower(btrim(coalesce(p_phrase, '')));
  v_offset INT := 1;
  v_relative_hit INT;
  v_hit INT;
  v_before TEXT;
  v_after TEXT;
BEGIN
  IF length(v_phrase) < 2 THEN
    RETURN FALSE;
  END IF;

  LOOP
    v_relative_hit := strpos(substr(v_body, v_offset), v_phrase);
    IF v_relative_hit = 0 THEN
      RETURN FALSE;
    END IF;

    v_hit := v_offset + v_relative_hit - 1;
    v_before := CASE WHEN v_hit <= 1 THEN '' ELSE substr(v_body, v_hit - 1, 1) END;
    v_after := substr(v_body, v_hit + length(v_phrase), 1);

    IF (v_before = '' OR v_before !~ '[[:alnum:]]')
       AND (v_after = '' OR v_after !~ '[[:alnum:]]') THEN
      RETURN TRUE;
    END IF;

    v_offset := v_hit + 1;
  END LOOP;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION content_contains_phrase(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION content_contains_phrase(TEXT, TEXT)
  TO service_role;

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

  PERFORM 1
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
VALUES ('110_content_db_lint_cleanup.sql')
ON CONFLICT DO NOTHING;
