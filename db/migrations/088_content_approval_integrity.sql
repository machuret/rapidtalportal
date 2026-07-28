-- ============================================================
-- 088_content_approval_integrity.sql – atomic content approval
--
-- Keeps channel support consistent, records the Company DNA style snapshot used
-- for each draft, and makes approval/edit transitions one locked operation.
-- The application validates the exact Company DNA snapshot, then this function
-- verifies neither the piece nor DNA changed before committing.
-- ============================================================

ALTER TABLE content_pieces
  ADD COLUMN IF NOT EXISTS style_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE content_topics
  DROP CONSTRAINT IF EXISTS content_topics_content_type_check;

ALTER TABLE content_topics
  ADD CONSTRAINT content_topics_content_type_check
  CHECK (content_type IN (
    'email', 'x', 'linkedin', 'facebook', 'instagram', 'social',
    'newsletter', 'blog', 'message', 'other'
  ));

ALTER TABLE content_pieces
  DROP CONSTRAINT IF EXISTS content_pieces_content_type_check;

ALTER TABLE content_pieces
  ADD CONSTRAINT content_pieces_content_type_check
  CHECK (content_type IN (
    'email', 'x', 'linkedin', 'facebook', 'instagram', 'social',
    'newsletter', 'blog', 'message', 'other'
  ));

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

  IF p_expected_piece_updated_at IS NOT NULL
     AND v_piece.updated_at IS DISTINCT FROM p_expected_piece_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Content changed while it was being reviewed. Reload and try again.';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'approved', 'archived') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content status.';
  END IF;

  v_target_status := coalesce(p_status, v_piece.status);
  v_target_body := CASE WHEN p_update_body THEN p_body ELSE v_piece.body END;

  -- Content is editable only while it is a draft. Returning an approved/archive
  -- item to draft is a separate explicit transition before editing.
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
    IF v_actor_role NOT IN ('va', 'client_admin', 'super_admin') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not allowed to approve content.';
    END IF;

    IF v_target_body IS NULL OR length(btrim(v_target_body)) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A content body is required before approval.';
    END IF;

    -- Lock the exact DNA row that the application validated. This prevents a
    -- simultaneous Company DNA edit from making approval stale mid-transaction.
    SELECT updated_at
      INTO v_dna_updated_at
    FROM company_dna
    WHERE client_id = p_client_id
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
  SET
    status = v_target_status,
    title = CASE WHEN p_update_title THEN btrim(p_title) ELSE content_pieces.title END,
    body = CASE WHEN p_update_body THEN p_body ELSE content_pieces.body END,
    style_snapshot = CASE
      WHEN v_target_status = 'approved' THEN p_style_snapshot
      ELSE content_pieces.style_snapshot
    END,
    updated_at = clock_timestamp()
  WHERE id = p_piece_id
    AND client_id = p_client_id
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
VALUES ('088_content_approval_integrity.sql')
ON CONFLICT DO NOTHING;
