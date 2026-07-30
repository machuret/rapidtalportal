-- ============================================================
-- 113_content_high_priority_integrity.sql
-- Release-blocking Content Studio integrity repairs:
--   * one active generation lease per connected project
--   * lifecycle changes reserved for client/super administrators
--   * duplicate/adapt creates a new connected project and never reopens or
--     overwrites the source project's approved provenance
-- ============================================================

ALTER TABLE content_projects
  ADD COLUMN IF NOT EXISTS generation_lease_token UUID,
  ADD COLUMN IF NOT EXISTS generation_lease_until TIMESTAMPTZ;

-- Migration 003 granted every tenant member FOR ALL access to content pieces.
-- That allows a VA to bypass the API and approve/archive content through
-- PostgREST. Tenant members may read their content, but all writes now flow
-- through the authenticated API and its actor-aware service-role RPCs.
DROP POLICY IF EXISTS "content_own_client_all" ON content_pieces;
DROP POLICY IF EXISTS "content_own_client_select" ON content_pieces;
CREATE POLICY "content_own_client_select"
  ON content_pieces FOR SELECT
  USING (client_id = current_user_client_id());

CREATE OR REPLACE FUNCTION claim_content_project_generation(
  p_client_id UUID,
  p_project_id UUID,
  p_actor_id UUID,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE(lease_token UUID, lease_until TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project content_projects%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_token UUID := gen_random_uuid();
  v_until TIMESTAMPTZ;
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
  IF p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid generation lease duration.';
  END IF;

  SELECT *
    INTO v_project
  FROM content_projects
  WHERE id = p_project_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Content project not found.';
  END IF;
  IF v_project.status NOT IN ('active', 'saved') OR v_project.current_step <> 'generate' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'This project is not ready to generate. Reload the latest version.';
  END IF;
  IF v_project.generation_lease_until IS NOT NULL
     AND v_project.generation_lease_until > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'A draft is already being generated for this project.';
  END IF;

  v_until := clock_timestamp() + make_interval(secs => p_lease_seconds);
  UPDATE content_projects
  SET generation_lease_token = v_token,
      generation_lease_until = v_until
  WHERE id = p_project_id
    AND client_id = p_client_id;

  RETURN QUERY SELECT v_token, v_until;
END;
$$;

REVOKE ALL ON FUNCTION claim_content_project_generation(UUID, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_content_project_generation(UUID, UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION renew_content_project_generation(
  p_client_id UUID,
  p_project_id UUID,
  p_actor_id UUID,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 600
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;
  IF NOT FOUND OR (v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid generation lease duration.';
  END IF;

  v_until := clock_timestamp() + make_interval(secs => p_lease_seconds);
  UPDATE content_projects
  SET generation_lease_until = v_until
  WHERE id = p_project_id
    AND client_id = p_client_id
    AND generation_lease_token = p_lease_token
    AND generation_lease_until > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The generation claim expired or was replaced.';
  END IF;
  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION renew_content_project_generation(UUID, UUID, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION renew_content_project_generation(UUID, UUID, UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION release_content_project_generation(
  p_client_id UUID,
  p_project_id UUID,
  p_actor_id UUID,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_client_id UUID;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;
  IF NOT FOUND OR (v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;

  UPDATE content_projects
  SET generation_lease_token = NULL,
      generation_lease_until = NULL
  WHERE id = p_project_id
    AND client_id = p_client_id
    AND generation_lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION release_content_project_generation(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_content_project_generation(UUID, UUID, UUID, UUID)
  TO service_role;

DROP FUNCTION IF EXISTS create_content_project_draft(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID
);

CREATE OR REPLACE FUNCTION create_content_project_draft(
  p_client_id UUID,
  p_project_id UUID,
  p_actor_id UUID,
  p_content_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_content_brief JSONB,
  p_source_references JSONB,
  p_style_snapshot JSONB,
  p_generation_kind TEXT DEFAULT 'original',
  p_parent_piece_id UUID DEFAULT NULL,
  p_generation_lease_token UUID DEFAULT NULL
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
  v_piece content_pieces%ROWTYPE;
  v_source JSONB;
  v_item_id UUID;
BEGIN
  SELECT role::TEXT, client_id INTO v_actor_role, v_actor_client_id
  FROM users WHERE id = p_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Content actor not found.';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;

  SELECT * INTO v_project
  FROM content_projects
  WHERE id = p_project_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Content project not found.';
  END IF;
  IF v_project.status NOT IN ('active', 'saved')
     OR v_project.current_step <> 'generate'
     OR p_generation_lease_token IS NULL
     OR v_project.generation_lease_token IS DISTINCT FROM p_generation_lease_token
     OR v_project.generation_lease_until IS NULL
     OR v_project.generation_lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The generation claim expired or this project already generated a draft.';
  END IF;
  IF jsonb_typeof(p_content_brief) <> 'object'
     OR jsonb_typeof(p_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content provenance.';
  END IF;
  IF p_content_brief IS DISTINCT FROM v_project.content_brief THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The project brief changed before generation completed.';
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(p_source_references)
  LOOP
    BEGIN
      v_item_id := (v_source ->> 'itemId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid factual source reference.';
    END;
    IF v_item_id IS NULL OR NOT (v_item_id = ANY(v_project.vault_source_ids)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A generated source was not selected as factual Vault evidence.';
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
  SET current_piece_id = v_piece.id,
      current_step = 'edit',
      status = 'active',
      vault_source_references = p_source_references,
      style_snapshot = p_style_snapshot,
      generation_lease_token = NULL,
      generation_lease_until = NULL
  WHERE id = p_project_id AND client_id = p_client_id;

  RETURN NEXT v_piece;
END;
$$;

REVOKE ALL ON FUNCTION create_content_project_draft(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_content_project_draft(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID, UUID
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
  v_source_project content_projects%ROWTYPE;
  v_new_project content_projects%ROWTYPE;
  v_parent content_pieces%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_source JSONB;
  v_item_id UUID;
  v_piece content_pieces%ROWTYPE;
  v_idea JSONB;
BEGIN
  SELECT role::TEXT, client_id INTO v_actor_role, v_actor_client_id
  FROM users WHERE id = p_actor_id;
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

  SELECT * INTO v_source_project
  FROM content_projects
  WHERE id = p_project_id AND client_id = p_client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected content project not found.';
  END IF;
  IF v_source_project.status = 'rejected' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A rejected project cannot create derived drafts.';
  END IF;

  SELECT * INTO v_parent
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
    IF v_item_id IS NULL OR NOT (v_item_id = ANY(v_source_project.vault_source_ids)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A derived source was not selected as factual Vault evidence.';
    END IF;
  END LOOP;

  v_idea := v_source_project.idea_snapshot || jsonb_build_object(
    'title', btrim(p_title),
    'channel', p_content_type,
    'derivedFromProjectId', v_source_project.id,
    'derivedFromPieceId', v_parent.id,
    'derivationKind', p_generation_kind
  );

  INSERT INTO content_projects (
    client_id, title, status, current_step, idea_snapshot, content_brief,
    vault_source_ids, vault_source_references, competitor_signals,
    style_snapshot, created_by
  ) VALUES (
    p_client_id, btrim(p_title), 'active', 'edit', v_idea, p_content_brief,
    v_source_project.vault_source_ids, p_source_references,
    v_source_project.competitor_signals, p_style_snapshot, p_actor_id
  )
  RETURNING * INTO v_new_project;

  INSERT INTO content_pieces (
    client_id, project_id, content_type, title, brief, body, status,
    content_brief, source_references, style_snapshot, generation_kind,
    parent_piece_id, created_by
  ) VALUES (
    p_client_id, v_new_project.id, p_content_type, btrim(p_title),
    p_content_brief ->> 'objective', p_body, 'draft',
    p_content_brief, p_source_references, p_style_snapshot, p_generation_kind,
    p_parent_piece_id, p_actor_id
  )
  RETURNING * INTO v_piece;

  UPDATE content_projects
  SET current_piece_id = v_piece.id
  WHERE id = v_new_project.id AND client_id = p_client_id;

  RETURN NEXT v_piece;
END;
$$;

REVOKE ALL ON FUNCTION create_content_project_derived_draft(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_content_project_derived_draft(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT
) TO service_role;

-- Defence in depth for the service-role RPC: VAs may edit draft text, but every
-- lifecycle transition is reserved for client/super administrators.
CREATE OR REPLACE FUNCTION update_content_piece_atomic(
  p_client_id UUID,
  p_piece_id UUID,
  p_actor_id UUID,
  p_status TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_body TEXT DEFAULT NULL,
  p_update_title BOOLEAN DEFAULT FALSE,
  p_update_body BOOLEAN DEFAULT FALSE,
  p_expected_piece_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_expected_dna_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_style_snapshot JSONB DEFAULT NULL
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
  v_dna_updated_at TIMESTAMPTZ;
  v_target_status TEXT;
  v_target_body TEXT;
BEGIN
  SELECT role::TEXT, client_id INTO v_actor_role, v_actor_client_id
  FROM users WHERE id = p_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Content actor not found.';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;

  SELECT * INTO v_piece
  FROM content_pieces
  WHERE id = p_piece_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Content piece not found.';
  END IF;
  IF p_expected_piece_updated_at IS NOT NULL
     AND v_piece.updated_at IS DISTINCT FROM p_expected_piece_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Content changed while it was being reviewed. Reload and try again.';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'approved', 'archived') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content status.';
  END IF;
  IF p_status IS NOT NULL AND v_actor_role NOT IN ('client_admin', 'super_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not allowed to change the content lifecycle.';
  END IF;

  v_target_status := coalesce(p_status, v_piece.status);
  v_target_body := CASE WHEN p_update_body THEN p_body ELSE v_piece.body END;
  IF (p_update_title OR p_update_body)
     AND v_piece.status <> 'draft'
     AND v_target_status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only draft content can be edited.';
  END IF;
  IF p_update_title AND (p_title IS NULL OR length(btrim(p_title)) = 0 OR length(p_title) > 300) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid content title is required.';
  END IF;
  IF p_update_body AND p_body IS NOT NULL AND length(p_body) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Content body is too long.';
  END IF;

  IF v_target_status = 'approved' THEN
    IF v_target_body IS NULL OR length(btrim(v_target_body)) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A content body is required before approval.';
    END IF;
    SELECT updated_at INTO v_dna_updated_at
    FROM company_dna WHERE client_id = p_client_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Complete Company DNA before approving content.';
    END IF;
    IF p_expected_dna_updated_at IS NULL
       OR v_dna_updated_at IS DISTINCT FROM p_expected_dna_updated_at THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Company DNA changed while this content was being reviewed. Reload and try again.';
    END IF;
    IF p_style_snapshot IS NULL OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A validated style snapshot is required for approval.';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE content_pieces
  SET status = v_target_status,
      title = CASE WHEN p_update_title THEN btrim(p_title) ELSE content_pieces.title END,
      body = CASE WHEN p_update_body THEN p_body ELSE content_pieces.body END,
      style_snapshot = CASE WHEN v_target_status = 'approved' THEN p_style_snapshot ELSE content_pieces.style_snapshot END,
      updated_at = clock_timestamp()
  WHERE id = p_piece_id AND client_id = p_client_id
  RETURNING content_pieces.*;
END;
$$;

REVOKE ALL ON FUNCTION update_content_piece_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_content_piece_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('113_content_high_priority_integrity.sql')
ON CONFLICT DO NOTHING;
